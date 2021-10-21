import { HashMap, HashSet, ReadonlyHashSet } from './hash-map';
import * as Rdf from './rdf';
import {
  ShapeID, Shape, RecordShape, RecordProperty, ComputedProperty, PropertyPath, AnyOfShape, SetShape,
  OptionalShape, ResourceShape, LiteralShape, ListShape, MapShape, ShapeReference, getNestedPropertyPath,
} from './shapes';
import {
  ResolvedListShape, makeTermMap, makeTermSet, assertUnknownShape, makeListShapeDefaults, resolveListShape,
  matchesTerm,
} from './common';
import { RampError, ErrorCode, formatDisplayShape, makeRampError } from './errors';
import { SynthesizeContext, synthesizeShape, compactByReference, EMPTY_REF_MATCHES } from './synthesize';
import { ValueMapper } from './value-mapping';

export interface FrameParams {
  shape: Shape;
  dataset: Rdf.Dataset;
  candidates?: Iterable<Rdf.Term>;
  /** Default is `true` if there are initial candidates otherwise `false`. */
  strict?: boolean;
  factory?: Rdf.DataFactory;
  mapper?: ValueMapper;
}

export interface FrameSolution {
  readonly value: unknown;
}

/**
 * @throws {RamError}
 */
export function *frame(params: FrameParams): IterableIterator<FrameSolution> {
  const factory = params.factory || Rdf.DefaultDataFactory;
  const refs = makeTermMap<unknown>() as HashMap<ShapeID, RefContext[]>;

  const context: FrameContext = {
    factory,
    mapper: params.mapper || ValueMapper.mapByDefault(factory),
    listDefaults: makeListShapeDefaults(factory),
    dataset: params.dataset,
    visiting: new HashMap(MatchKey.hash, MatchKey.equals),
    matches: new HashMap(MatchKey.hash, MatchKey.equals),
    refs,
  };

  const candidates = params.candidates || findAllCandidates(params.dataset);
  const strict = Boolean(params.candidates);
  const stack = new StackFrame(undefined, params.shape);
  for (const match of frameShape(params.shape, strict, candidates, stack, context)) {
    if (match instanceof Mismatch) {
      continue;
    } else if (match instanceof CyclicMatch) {
      throw makeError(ErrorCode.CyclicMatch, `Failed to match cyclic shape`, stack);
    }
    yield {value: match.value};
  }
}

interface FrameContext {
  readonly factory: Rdf.DataFactory;
  readonly mapper: ValueMapper;
  readonly listDefaults: ResolvedListShape;
  readonly dataset: Rdf.Dataset;
  readonly visiting: HashMap<MatchKey, CyclicMatch | null>;
  readonly matches: HashMap<MatchKey, unknown>;
  readonly refs: HashMap<ShapeID, RefContext[]>;
}

class StackFrame {
  constructor(
    readonly parent: StackFrame | undefined,
    readonly shape: Shape,
    readonly edge?: string | number,
    readonly focus?: Rdf.Term
  ) {}
  setFocus(focus: Rdf.Term): FocusedStackFrame {
    return new StackFrame(this.parent, this.shape, this.edge, focus) as FocusedStackFrame;
  }
}

interface FocusedStackFrame extends StackFrame {
  focus: Rdf.Term;
}

interface MatchKey {
  shape: Shape;
  term: Rdf.Term;
}
namespace MatchKey {
  export function hash(key: MatchKey): number {
    let hash = Rdf.hashTerm(key.shape.id);
    // tslint:disable-next-line: no-bitwise
    hash = (hash * 31 + Rdf.hashTerm(key.term)) | 0;
    return hash;
  }
  export function equals(a: MatchKey, b: MatchKey): boolean {
    return Rdf.equalTerms(a.shape.id, b.shape.id) && Rdf.equalTerms(a.term, b.term);
  }
}

class CandidateMatch<T = unknown> {
  constructor(
    readonly value: T,
    readonly candidate: Rdf.Term | null
  ) {}
}

class CyclicMatch {
  holes: MatchHole[] | undefined;
  constructor(
    readonly candidate: Rdf.Term | null
  ) {}
  addHole(hole: MatchHole) {
    if (!this.holes) {
      this.holes = [];
    }
    this.holes.push(hole);
  }
}

interface MatchHole {
  target: object;
  property: string | number;
}

interface RefContext {
  source: ShapeID;
  reference: ShapeReference;
  match?: CandidateMatch;
}

class Mismatch {
  private _ramMismatch = true;
  private constructor() {}
  static instance = new Mismatch();
}
const MISMATCH = Mismatch.instance;

function *frameShape(
  shape: Shape,
  strict: boolean,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<CandidateMatch | CyclicMatch | Mismatch> {
  const required = strict && !shape.lenient;
  let solutions: Iterable<CandidateMatch | CyclicMatch | Mismatch>;
  switch (shape.type) {
    case 'record': {
      solutions = frameRecord(shape, required, candidates, stack, context);
      break;
    }
    case 'anyOf': {
      solutions = frameAnyOf(shape, required, candidates, stack, context);
      break;
    }
    case 'set': {
      solutions = frameSet(shape, required, candidates, stack, context);
      break;
    }
    case 'optional': {
      solutions = frameOptional(shape, required, candidates, stack, context);
      break;
    }
    case 'resource':
    case 'literal': {
      solutions = frameNode(shape, required, candidates, stack, context);
      break;
    }
    case 'list': {
      solutions = frameList(shape, required, candidates, stack, context);
      break;
    }
    case 'map': {
      solutions = frameMap(shape, required, candidates, stack, context);
      break;
    }
    default: {
      return assertUnknownShape(shape);
    }
  }

  for (const value of solutions) {
    if (value instanceof Mismatch) {
      if (!shape.lenient) {
        yield strict ? throwFailedToMatch(stack) : MISMATCH;
      }
    } else if (value instanceof CyclicMatch) {
      yield value;
    } else {
      const matchingRefs = context.refs.get(shape.id);
      if (matchingRefs) {
        for (const ref of matchingRefs) {
          ref.match = value;
        }
      }

      const typed = context.mapper.fromRdf(value.value, shape);
      yield new CandidateMatch(typed, value.candidate);
    }
  }
}

function *frameRecord(
  shape: RecordShape,
  required: boolean,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<CandidateMatch<{ [fieldName: string]: unknown }> | CyclicMatch | Mismatch> {
  for (const candidate of candidates) {
    if (!isResource(candidate)) {
      yield required
        ? failMatch(stack.setFocus(candidate), ErrorCode.NonResourceTerm, `Found non-resource term`)
        : MISMATCH;
      continue;
    }

    const matchKey: MatchKey = {shape, term: candidate};
    if (context.matches.has(matchKey)) {
      yield new CandidateMatch(
        context.matches.get(matchKey) as { [fieldName: string]: unknown },
        candidate
      );
      continue;
    }

    if (context.visiting.has(matchKey)) {
      yield makeCyclicMatch(context, matchKey);
      continue;
    }

    context.visiting.set(matchKey, null);
    let foundMatch = false;
    const template: { [fieldName: string]: unknown } = {};
    const focusedStack = stack.setFocus(candidate);

    if (frameProperties(shape.typeProperties, required, candidate, template, focusedStack, context)) {
      const strictByType = required || shape.typeProperties.length > 0;
      if (frameProperties(shape.properties, strictByType, candidate, template, focusedStack, context)) {
        foundMatch = true;
      }
    }

    if (foundMatch) {
      synthesizeComputedProperties(shape.computedProperties, template, context);
      fillCyclicHoles(context, matchKey, template);
    }
    context.visiting.delete(matchKey);
    yield foundMatch ? new CandidateMatch(template, candidate) : MISMATCH;
  }
}

function frameProperties(
  properties: ReadonlyArray<RecordProperty>,
  required: boolean,
  candidate: Rdf.NamedNode | Rdf.BlankNode,
  template: { [fieldName: string]: unknown },
  focusedStack: FocusedStackFrame,
  context: FrameContext
): boolean {
  for (const property of properties) {
    const values = findByPropertyPath(property.path, candidate, context);
    const nextStack = new StackFrame(focusedStack, property.valueShape, property.name);
    let found = false;
    for (const match of frameShape(property.valueShape, required, values, nextStack, context)) {
      if (match instanceof Mismatch) {
        return required ? failMatch(
          focusedStack,
          ErrorCode.PropertyMismatch,
          `Failed to match property "${property.name}"`
        ) : false;
      }
      if (found) {
        return required ? failMatch(
          focusedStack,
          ErrorCode.MultiplePropertyMatches,
          `Found multiple matches for property "${property.name}"`
        ) : false;
      }
      found = true;
      if (property.transient) {
        /* ignore property value */
      } else if (match instanceof CyclicMatch) {
        match.addHole({target: template, property: property.name});
        template[property.name] = undefined;
      } else {
        template[property.name] = match.value;
      }
    }
    if (!found) {
      return required ? failMatch(
        focusedStack,
        ErrorCode.NoPropertyMatches,
        `Found no matches for property "${property.name}"`
      ) : false;
    }
  }
  return true;
}

function failMatch(focusedStack: FocusedStackFrame, code: ErrorCode, message: string): never {
  const fullMessage =
    `${message} when framing object shape ${formatDisplayShape(focusedStack.shape)}`;
  throw makeError(code, fullMessage, focusedStack);
}

function synthesizeComputedProperties(
  properties: ReadonlyArray<ComputedProperty>,
  template: { [fieldName: string]: unknown },
  context: FrameContext
) {
  if (properties.length === 0) { return; }
  const synthesizeContext: SynthesizeContext = {
    factory: context.factory,
    mapper: context.mapper,
    matches: EMPTY_REF_MATCHES,
  };
  for (const property of properties) {
    const value = synthesizeShape(property.valueShape, synthesizeContext);
    template[property.name] = value;
  }
}

function findByPropertyPath(
  path: PropertyPath,
  candidate: Rdf.NamedNode | Rdf.BlankNode,
  context: FrameContext
): Iterable<Rdf.Term> {
  if (path.type === 'predicate') {
    // optimize for single forward predicate
    const objects: Rdf.Term[] = [];
    for (const q of context.dataset.iterateMatches(candidate, path.predicate, null)) {
      objects.push(q.object);
    }
    return objects;
  } else if (path.type === 'inverse' && path.inverse.type === 'predicate') {
    // optimize for single backwards predicate
    const subjects: Rdf.Term[] = [];
    for (const q of context.dataset.iterateMatches(null, path.inverse.predicate, candidate)) {
      subjects.push(q.subject);
    }
    return subjects;
  } else if (path.type === 'sequence' && path.sequence.length === 0) {
    return [candidate];
  }

  // use full/slow search in all other cases
  const source = makeTermSet();
  source.add(candidate);
  return findByPath(source, path, false, context);
}

function *frameAnyOf(
  shape: AnyOfShape,
  required: boolean,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<CandidateMatch | CyclicMatch | Mismatch> {
  const unmatched = makeTermSet();
  for (const candidate of candidates) {
    unmatched.add(candidate);
  }

  for (const variantShape of shape.variants) {
    const nextStack = new StackFrame(stack, variantShape);
    for (const match of frameShape(variantShape, false, candidates, nextStack, context)) {
      if (!(match instanceof Mismatch)) {
        if (match.candidate) {
          unmatched.delete(match.candidate);
        } else {
          unmatched.clear();
        }
        yield match;
      }
    }
  }

  if (unmatched.size > 0) {
    if (required) {
      // try to frame with "required = true" to produce error
      for (const variantShape of shape.variants) {
        const nextStack = new StackFrame(stack, variantShape);
        yield* frameShape(variantShape, true, unmatched, nextStack, context);
      }
    } else {
      yield MISMATCH;
    }
  }
}

function *frameSet(
  shape: SetShape,
  required: boolean,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<CandidateMatch | Mismatch> {
  const {minCount = 0, maxCount = Infinity} = shape;
  const nextStack = new StackFrame(stack, shape.itemShape);
  const matches: unknown[] = [];
  for (const match of frameShape(shape.itemShape, required, candidates, nextStack, context)) {
    if (match instanceof Mismatch) {
      yield match;
      return;
    }
    if (match instanceof CyclicMatch) {
      const index = matches.length;
      matches.push(undefined);
      match.addHole({target: matches, property: index});
    } else {
      matches.push(match.value);
    }
  }
  if (matches.length < minCount) {
    if (required) {
      const message = `Set item count ${matches.length} is less than minimum (${shape.minCount})`;
      throw makeError(ErrorCode.MinCountMismatch, message, stack);
    }
    yield MISMATCH;
    return;
  }
  if (matches.length > maxCount) {
    if (required) {
      const message = `Set item count ${matches.length} is greater than maximum (${shape.maxCount})`;
      throw makeError(ErrorCode.MaxCountMismatch, message, stack);
    }
    yield MISMATCH;
    return;
  }
  yield new CandidateMatch(matches, null);
}

function *frameOptional(
  shape: OptionalShape,
  required: boolean,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<CandidateMatch | CyclicMatch | Mismatch> {
  let found = false;
  const nextStack = new StackFrame(stack, shape.itemShape);
  for (const value of frameShape(shape.itemShape, false, candidates, nextStack, context)) {
    if (value instanceof Mismatch) {
      if (required) {
        // try to frame with "required = true" to produce error
        yield* frameShape(shape.itemShape, true, candidates, nextStack, context);
      }
    } else {
      found = true;
    }
    yield value;
  }
  if (!found) {
    yield new CandidateMatch(shape.emptyValue, null);
  }
}

function *frameNode(
  shape: ResourceShape | LiteralShape,
  required: boolean,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<CandidateMatch<Rdf.Term> | Mismatch> {
  for (const candidate of candidates) {
    if (matchesTerm(shape, candidate)) {
      yield new CandidateMatch(candidate, candidate);
    } else if (required) {
      throw matchesTerm(
        shape,
        candidate,
        (code, message) => makeError(code, message, stack.setFocus(candidate))
      );
    } else {
      yield MISMATCH;
    }
  }
}

function *frameList(
  shape: ListShape,
  required: boolean,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<CandidateMatch<unknown[]> | CyclicMatch | Mismatch> {
  const {head: headPath, tail: tailPath, nil} = resolveListShape(shape, context.listDefaults);

  function frameListFromTerm(focusedStack: FocusedStackFrame): unknown[] | Mismatch {
    const candidate = focusedStack.focus;
    let result: unknown[] | undefined;
    let index = 0;
    let rest = candidate;

    function failMatch(code: ErrorCode, message: string): never {
      const fullMessage = message + formatListMatchPosition(index, rest, candidate, shape);
      throw makeError(code, fullMessage, focusedStack);
    }

    while (true) {
      if (!isResource(rest)) {
        return required ? failMatch(ErrorCode.NonResourceTerm, `List term is not a resource`) : MISMATCH;
      }

      if (Rdf.equalTerms(rest, nil)) {
        if (!result) {
          result = [];
        }
        return result;
      }

      let foundHead: Rdf.Term | undefined;
      for (const head of findByPropertyPath(headPath, rest, context)) {
        if (foundHead && !Rdf.equalTerms(head, foundHead)) {
          return required ? failMatch(
            ErrorCode.MultipleListHeadMatches,
            `Found multiple matches for list head`
          ) : MISMATCH;
        }
        foundHead = head;
      }
      if (!foundHead) {
        return required ? failMatch(ErrorCode.NoListHeadMatches, `Failed to match list head`) : MISMATCH;
      }

      if (!result) {
        result = [];
      }

      const nextStack = new StackFrame(focusedStack, shape.itemShape, index);
      let hasItemMatch = false;
      for (const match of frameShape(shape.itemShape, required, [foundHead], nextStack, context)) {
        if (match instanceof Mismatch) {
          return MISMATCH;
        } else if (match instanceof CyclicMatch) {
          throw new Error('Unexpected cyclic match when framing list item');
        } else if (hasItemMatch) {
          return required ? failMatch(
            ErrorCode.MultipleListItemMatches,
            `Multiple matches for list item found`
          ) : MISMATCH;
        }
        hasItemMatch = true;
        result.push(match.value);
      }
      if (!hasItemMatch) {
        return required ? failMatch(ErrorCode.NoListItemMatches, `No matches for list item found`) : MISMATCH;
      }

      let foundTail: Rdf.Term | undefined;
      for (const tail of findByPropertyPath(tailPath, rest, context)) {
        if (foundTail && !Rdf.equalTerms(tail, foundTail)) {
          return required ? failMatch(
            ErrorCode.MultipleListTailMatches,
            `Found multiple matches for list tail`
          ) : MISMATCH;
        }
        foundTail = tail;
      }
      if (!foundTail) {
        return required ? failMatch(ErrorCode.NoListTailMatches, `Failed to match list tail`) : MISMATCH;
      }

      rest = foundTail;
      index++;
    }
  }

  for (const candidate of candidates) {
    const matchKey: MatchKey = {shape, term: candidate};
    if (context.matches.has(matchKey)) {
      yield new CandidateMatch(context.matches.get(matchKey) as unknown[], candidate);
      continue;
    }

    if (context.visiting.has(matchKey)) {
      yield makeCyclicMatch(context, matchKey);
      continue;
    }

    context.visiting.set(matchKey, null);
    const list = frameListFromTerm(stack.setFocus(candidate));
    if (!(list instanceof Mismatch)) {
      fillCyclicHoles(context, matchKey, list);
    }
    context.visiting.delete(matchKey);
    yield list instanceof Mismatch ? list : new CandidateMatch(list, candidate);
  }
}

function formatListMatchPosition(
  index: number,
  tail: Rdf.Term,
  subject: Rdf.Term,
  shape: Shape,
) {
  return (
    ` at index ${index} with tail ${Rdf.toString(tail)}, subject ${Rdf.toString(subject)},` +
    ` shape ${Rdf.toString(shape.id)}`
  );
}

function *frameMap(
  shape: MapShape,
  required: boolean,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<CandidateMatch<{ [key: string]: unknown }> | Mismatch> {
  const result: { [key: string]: unknown } = {};

  const keyContext: RefContext = {source: shape.id, reference: shape.key};
  pushRef(context.refs, keyContext);

  let valueContext: RefContext | undefined;
  if (shape.value) {
    valueContext = {source: shape.id, reference: shape.value};
    pushRef(context.refs, valueContext);
  }

  const nextStack = new StackFrame(stack, shape.itemShape);
  for (const item of frameShape(shape.itemShape, required, candidates, nextStack, context)) {
    if (item instanceof Mismatch) {
      yield MISMATCH;
      return;
    }
    if (item instanceof CyclicMatch) {
      throw makeError(ErrorCode.CyclicMatch, `Cyclic map shape item matches are not supported`, stack);
    }
    if (keyContext.match === undefined) {
      throw makeError(
        ErrorCode.NoMapKeyMatches, `Failed to frame item as key of map ${Rdf.toString(shape.id)}`, stack
      );
    }
    if (valueContext && valueContext.match === undefined) {
      throw makeError(
        ErrorCode.NoMapValueMatches, `Failed to frame item as value of map ${Rdf.toString(shape.id)}`, stack
      );
    }
    const key = frameByReference(keyContext, stack, context);
    const value = valueContext ? frameByReference(valueContext, stack, context) : item;
    if (key !== undefined && value !== undefined) {
      if (!(typeof key === 'string' || typeof key === 'number' || typeof key === 'boolean')) {
        const message = `Cannot use non-primitive value as a key of map ${Rdf.toString(shape.id)}: ` +
          `(${typeof key}) ${key}`;
        throw makeError(ErrorCode.CompositeMapKey, message, stack);
      }
      result[key.toString()] = value;
    }
  }

  if (valueContext) {
    popRef(context.refs, valueContext);
  }
  popRef(context.refs, keyContext);
  yield new CandidateMatch(result, null);
}

function frameByReference(
  refContext: RefContext,
  stack: StackFrame,
  context: FrameContext
): unknown {
  if (refContext.match === undefined) {
    return undefined;
  }
  const shape = refContext.reference.target;
  try {
    const compacted = compactByReference(refContext.match.value, shape, refContext.reference);
    return Rdf.looksLikeTerm(compacted) ? context.mapper.fromRdf(compacted, shape) : compacted;
  } catch (e) {
    const message = (e as Error).message
      || `Error compacting value of shape ${Rdf.toString(shape.id)}`;
    throw makeError(ErrorCode.FailedToCompactValue, message, stack);
  }
}

function isResource(term: Rdf.Term): term is Rdf.NamedNode | Rdf.BlankNode {
  return term.termType === 'NamedNode' || term.termType === 'BlankNode';
}

function findAllCandidates(dataset: Rdf.Dataset) {
  const candidates = makeTermSet();
  for (const {subject, object} of dataset) {
    candidates.add(subject);
    candidates.add(object);
  }
  return candidates;
}

function findByPath(
  sources: ReadonlyHashSet<Rdf.Term>,
  path: PropertyPath,
  reverse: boolean,
  context: FrameContext
): HashSet<Rdf.Term> {
  switch (path.type) {
    case 'predicate': {
      const next = makeTermSet();
      for (const source of sources) {
        const matches = reverse
          ? context.dataset.iterateMatches(null, path.predicate, source)
          : context.dataset.iterateMatches(source, path.predicate, null);
        for (const q of matches) {
          next.add(q.object);
        }
      }
      return next;
    }
    case 'sequence': {
      const iteratedPath = reverse ? [...path.sequence].reverse() : path.sequence;
      let next: HashSet<Rdf.Term> | undefined;
      for (const element of iteratedPath) {
        const current = next || sources;
        next = makeTermSet();
        for (const term of findByPath(current, element, reverse, context)) {
          next.add(term);
        }
      }
      return next || makeTermSet();
    }
    case 'alternative': {
      const next = makeTermSet();
      for (const alternative of path.alternatives) {
        for (const term of findByPath(sources, alternative, reverse, context)) {
          next.add(term);
        }
      }
      return next;
    }
    case 'inverse': {
      return findByPath(sources, path.inverse, !reverse, context);
    }
    case 'zeroOrMore':
    case 'zeroOrOne':
    case 'oneOrMore': {
      const next = makeTermSet();
      if (path.type === 'zeroOrMore' || path.type === 'zeroOrOne') {
        for (const term of sources) {
          next.add(term);
        }
      }

      const nestedPath = getNestedPropertyPath(path);
      const once = path.type === 'zeroOrOne';
      let foundAtStep: HashSet<Rdf.Term> | undefined;
      do {
        foundAtStep = findByPath(foundAtStep || sources, nestedPath, reverse, context);
        for (const term of foundAtStep) {
          if (next.has(term)) {
            foundAtStep.delete(term);
          } else {
            next.add(term);
          }
        }
      } while (foundAtStep.size > 0 && !once);
      return next;
    }
    default: {
      throw new Error(`Unknown path type "${(path as PropertyPath).type}"`);
    }
  }
}

function throwFailedToMatch(stack: StackFrame): never {
  const displayedShape = formatDisplayShape(stack.shape);
  const baseMessage = stack.focus
    ? `Term ${Rdf.toString(stack.focus)} does not match ${displayedShape}`
    : `Failed to match ${displayedShape}`;

  throw makeError(ErrorCode.ShapeMismatch, baseMessage, stack);
}

function makeCyclicMatch(context: FrameContext, matchKey: MatchKey) {
  let match = context.visiting.get(matchKey);
  if (!match) {
    match = new CyclicMatch(matchKey.term);
    context.visiting.set(matchKey, match);
  }
  return match;
}

function fillCyclicHoles(context: FrameContext, matchKey: MatchKey, value: unknown) {
  const cyclic = context.visiting.get(matchKey);
  if (!(cyclic && cyclic.holes)) { return; }
  context.matches.set(matchKey, value);
  for (const hole of cyclic.holes) {
    (hole.target as any)[hole.property] = value;
  }
}

function pushRef(map: HashMap<ShapeID, RefContext[]>, ref: RefContext) {
  let items = map.get(ref.reference.target.id);
  if (!items) {
    items = [];
    map.set(ref.reference.target.id, items);
  }
  items.push(ref);
}

function popRef(map: HashMap<ShapeID, RefContext[]>, ref: RefContext) {
  const items = map.get(ref.reference.target.id);
  if (!items) {
    throw makeError(ErrorCode.CannotRemoveRefContext, 'Cannot remove ref context');
  }
  const removed = items.pop();
  if (removed !== ref) {
    throw makeError(ErrorCode.NonMatchingRefContext, 'Encountered non-matching ref operations');
  }
}

function makeError(code: ErrorCode, message: string, stack?: StackFrame): RampError {
  const stackArray = stack ? stackToArray(stack) : undefined;
  return makeRampError(code, message, stackArray);
}

function stackToArray(stack: StackFrame): StackFrame[] {
  const array: StackFrame[] = [];
  let frame: StackFrame | undefined = stack;
  while (frame) {
    array.unshift(frame);
    frame = frame.parent;
  }
  return array;
}
