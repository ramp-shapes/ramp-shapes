import { HashMap, HashSet, ReadonlyHashSet } from './hash-map';
import * as Rdf from './rdf';
import {
  ShapeID, Shape, ObjectShape, ObjectProperty, PathSequence, UnionShape, SetShape, OptionalShape,
  ResourceShape, LiteralShape, ListShape, MapShape, ShapeReference, isPathSegment,
} from './shapes';
import {
  ResolvedListShape, makeTermMap, makeTermSet, assertUnknownShape, makeListShapeDefaults, resolveListShape,
  matchesTerm,
} from './common';
import { RampError, ErrorCode, formatDisplayShape, formatShapeStack } from './errors';
import { compactByReference } from './synthesize';
import { ValueMapper } from './value-mapping';

export interface FrameParams {
  shape: Shape;
  dataset: Rdf.Dataset;
  candidates?: Iterable<Rdf.Term>;
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
    mapper: params.mapper || ValueMapper.mapByDefault(factory),
    listDefaults: makeListShapeDefaults(factory),
    dataset: params.dataset,
    visiting: new HashMap(MatchKey.hash, MatchKey.equals),
    matches: new HashMap(MatchKey.hash, MatchKey.equals),
    refs,
  };

  const candidates = params.candidates || findAllCandidates(params.dataset);
  const stack = new StackFrame(undefined, params.shape);
  for (const value of frameShape(params.shape, false, candidates, stack, context)) {
    if (value === MISMATCH) {
      continue;
    } else if (value instanceof CyclicMatch) {
      throw makeError(ErrorCode.CyclicMatch, `Failed to match cyclic shape`, stack);
    }
    yield {value};
  }
}

interface FrameContext {
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
  hasEdge() {
    return this.edge !== undefined;
  }
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

class CyclicMatch {
  holes: MatchHole[] | undefined;
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
  match?: unknown;
}

interface Mismatch { _RamMismatch: true; }
const MISMATCH = { _RamMismatch: true } as Mismatch;

function *frameShape(
  shape: Shape,
  strict: boolean,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<unknown | CyclicMatch | Mismatch> {
  const required = strict && !shape.lenient;
  const solutions = (() => {
    switch (shape.type) {
      case 'object':
        return frameObject(shape, required, candidates, stack, context);
      case 'union':
        return frameUnion(shape, required, candidates, stack, context);
      case 'set':
        return frameSet(shape, required, candidates, stack, context);
      case 'optional':
        return frameOptional(shape, required, candidates, stack, context);
      case 'resource':
      case 'literal':
        return frameNode(shape, required, candidates, stack, context);
      case 'list':
        return frameList(shape, required, candidates, stack, context);
      case 'map':
        return frameMap(shape, required, candidates, stack, context);
      default:
        return assertUnknownShape(shape);
    }
  })();

  for (const value of solutions) {
    if (value === MISMATCH) {
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

      const typed = context.mapper.fromRdf(value, shape);
      yield typed;
    }
  }
}

function *frameObject(
  shape: ObjectShape,
  required: boolean,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<{ [fieldName: string]: unknown } | CyclicMatch | Mismatch> {
  function failMatch(focusedStack: FocusedStackFrame, code: ErrorCode, message: string): never {
    const fullMessage = message +
      ` when framing subject ${Rdf.toString(focusedStack.focus)}` +
      ` to shape ${Rdf.toString(shape.id)}`;
    throw makeError(code, fullMessage, stack);
  }

  function frameProperties(
    properties: ReadonlyArray<ObjectProperty>,
    required: boolean,
    candidate: Rdf.NamedNode | Rdf.BlankNode,
    template: { [fieldName: string]: unknown },
    focusedStack: FocusedStackFrame
  ): boolean {
    for (const property of properties) {
      const values = findByPropertyPath(property.path, candidate, context);
      const nextStack = new StackFrame(focusedStack, property.valueShape, property.name);
      let found = false;
      for (const value of frameShape(property.valueShape, required, values, nextStack, context)) {
        if (value === MISMATCH) {
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
        } else if (value instanceof CyclicMatch) {
          value.addHole({target: template, property: property.name});
          template[property.name] = undefined;
        } else {
          template[property.name] = value;
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

  for (const candidate of candidates) {
    if (!isResource(candidate)) {
      yield required
        ? failMatch(stack.setFocus(candidate), ErrorCode.NonResourceTerm, `Found non-resource term`)
        : MISMATCH;
      continue;
    }

    const matchKey: MatchKey = {shape, term: candidate};
    if (context.matches.has(matchKey)) {
      yield context.matches.get(matchKey) as { [fieldName: string]: unknown };
      continue;
    }

    if (context.visiting.has(matchKey)) {
      yield makeCyclicMatch(context, matchKey);
      continue;
    }

    context.visiting.set(matchKey, null);
    let foundMatch = false;
    const template = {};
    const focusedStack = stack.setFocus(candidate);

    if (frameProperties(shape.typeProperties, required, candidate, template, focusedStack)) {
      const checkProperties = required || shape.typeProperties.length > 0;
      if (frameProperties(shape.properties, checkProperties, candidate, template, focusedStack)) {
        foundMatch = true;
      }
    }

    if (foundMatch) {
      fillCyclicHoles(context, matchKey, template);
    }
    context.visiting.delete(matchKey);
    yield foundMatch ? template : MISMATCH;
  }
}

function findByPropertyPath(
  path: PathSequence,
  candidate: Rdf.NamedNode | Rdf.BlankNode,
  context: FrameContext
): Iterable<Rdf.Term> {
  if (path.length === 0) {
    return [candidate];
  } else if (path.length === 1) {
    const element = path[0];
    if (isPathSegment(element)) {
      // optimize for single forward predicate
      const objects: Rdf.Term[] = [];
      for (const q of context.dataset.iterateMatches(candidate, element.predicate, null)) {
        objects.push(q.object);
      }
      return objects;
    } else if (element.operator === '^' && element.path.length === 1) {
      const reversed = element.path[0];
      if (isPathSegment(reversed)) {
        // optimize for single backwards predicate
        const subjects: Rdf.Term[] = [];
        for (const q of context.dataset.iterateMatches(null, reversed.predicate, candidate)) {
          subjects.push(q.subject);
        }
        return subjects;
      }
    }
  }

  // use full/slow search in all other cases
  const source = makeTermSet();
  source.add(candidate);
  return findByPath(source, path, false, context);
}

function *frameUnion(
  shape: UnionShape,
  required: boolean,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<unknown | CyclicMatch | Mismatch> {
  let found = false;
  let mismatch = false;
  for (const variantShape of shape.variants) {
    const nextStack = new StackFrame(stack, variantShape);
    for (const match of frameShape(variantShape, false, candidates, nextStack, context)) {
      if (match === MISMATCH) {
        mismatch = true;
      } else {
        found = true;
        yield match;
      }
    }
  }

  if (!found && mismatch) {
    if (required) {
      // try to frame with "required = true" to produce error
      for (const variantShape of shape.variants) {
        const nextStack = new StackFrame(stack, variantShape);
        yield* frameShape(variantShape, true, candidates, nextStack, context);
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
): Iterable<unknown> {
  const nextStack = new StackFrame(stack, shape.itemShape);
  const matches: unknown[] = [];
  for (const match of frameShape(shape.itemShape, required, candidates, nextStack, context)) {
    if (match === MISMATCH) {
      yield MISMATCH;
      return;
    }
    if (match instanceof CyclicMatch) {
      const index = matches.length;
      matches.push(undefined);
      match.addHole({target: matches, property: index});
    } else {
      matches.push(match);
    }
  }
  if (typeof shape.minCount === 'number' && matches.length < shape.minCount) {
    if (required) {
      const message = `Set item count ${matches.length} is less than minimum (${shape.minCount})`;
      throw makeError(ErrorCode.MinCountMismatch, message, stack);
    }
    yield MISMATCH;
    return;
  }
  if (typeof shape.maxCount === 'number' && matches.length > shape.maxCount) {
    if (required) {
      const message = `Set item count ${matches.length} is greater than maximum (${shape.maxCount})`;
      throw makeError(ErrorCode.MaxCountMismatch, message, stack);
    }
    yield MISMATCH;
    return;
  }
  yield matches;
}

function *frameOptional(
  shape: OptionalShape,
  required: boolean,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<unknown | CyclicMatch | Mismatch> {
  let found = false;
  const nextStack = new StackFrame(stack, shape.itemShape);
  for (const value of frameShape(shape.itemShape, false, candidates, nextStack, context)) {
    if (value === MISMATCH) {
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
    yield shape.emptyValue;
  }
}

function *frameNode(
  shape: ResourceShape | LiteralShape,
  required: boolean,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<Rdf.Term | Mismatch> {
  for (const candidate of candidates) {
    if (matchesTerm(shape, candidate)) {
      yield candidate;
    } else if (required) {
      return throwFailedToMatch(stack.setFocus(candidate));
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
): Iterable<unknown[] | CyclicMatch | Mismatch> {
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
      for (const item of frameShape(shape.itemShape, required, [foundHead], nextStack, context)) {
        if (item === MISMATCH) {
          return MISMATCH;
        } else if (hasItemMatch) {
          return required ? failMatch(
            ErrorCode.MultipleListItemMatches,
            `Multiple matches for list item found`
          ) : MISMATCH;
        }
        hasItemMatch = true;
        result.push(item);
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
      yield context.matches.get(matchKey) as unknown[];
      continue;
    }

    if (context.visiting.has(matchKey)) {
      yield makeCyclicMatch(context, matchKey);
      continue;
    }

    context.visiting.set(matchKey, null);
    const list = frameListFromTerm(stack.setFocus(candidate));
    if (list !== MISMATCH) {
      fillCyclicHoles(context, matchKey, list);
    }
    context.visiting.delete(matchKey);
    yield list;
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
): Iterable<{ [key: string]: unknown } | Mismatch> {
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
    if (item === MISMATCH) {
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
  yield result;
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
    const compacted = compactByReference(refContext.match, shape, refContext.reference);
    return Rdf.looksLikeTerm(compacted) ? context.mapper.fromRdf(compacted, shape) : compacted;
  } catch (e) {
    const message = e.message || `Error compacting value of shape ${Rdf.toString(shape.id)}`;
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
  path: PathSequence,
  reverse: boolean,
  context: FrameContext
): HashSet<Rdf.Term> {
  const iteratedPath = reverse ? [...path].reverse() : path;
  let next: HashSet<Rdf.Term> | undefined;

  for (const element of iteratedPath) {
    const current = next || sources;
    next = makeTermSet();

    if (isPathSegment(element)) {
      for (const source of current) {
        const matches = reverse
          ? context.dataset.iterateMatches(null, element.predicate, source)
          : context.dataset.iterateMatches(source, element.predicate, null);
        for (const q of matches) {
          next.add(q.object);
        }
      }
    } else {
      switch (element.operator) {
        case '|':
          for (const alternative of element.path) {
            for (const term of findByPath(current, [alternative], reverse, context)) {
              next.add(term);
            }
          }
          break;
        case '^': {
          for (const term of findByPath(current, element.path, !reverse, context)) {
            next.add(term);
          }
          break;
        }
        case '!': {
          const excluded = makeTermSet();
          for (const term of findByPath(current, element.path, reverse, context)) {
            excluded.add(term);
          }
          for (const term of findAllCandidates(context.dataset)) {
            if (!excluded.has(term)) {
              next.add(term);
            }
          }
          break;
        }
        case '*':
        case '+':
        case '?': {
          if (element.operator === '*' || element.operator === '?') {
            for (const term of current) {
              next.add(term);
            }
          }

          const once = element.operator === '?';
          let foundAtStep: HashSet<Rdf.Term> | undefined;
          do {
            foundAtStep = findByPath(foundAtStep || current, element.path, reverse, context);
            for (const term of foundAtStep) {
              if (next.has(term)) {
                foundAtStep.delete(term);
              } else {
                next.add(term);
              }
            }
          } while (foundAtStep.size > 0 && !once);
        }
      }
    }
  }
  return next || makeTermSet();
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
    match = new CyclicMatch();
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
  const stackString = stackArray ? formatShapeStack(stackArray) : undefined;
  const error = new Error(
    `RAMP${code}: ${message}` + (stackString ? ` at ${stackString}` : '')
  ) as RampError;
  error.rampErrorCode = code;
  error.rampStack = stackArray;
  return error;
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
