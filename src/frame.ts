import { HashMap, ReadonlyHashMap, HashSet, ReadonlyHashSet } from './hash-map';
import * as Rdf from './rdf';
import {
  ShapeID, Shape, ObjectShape, ObjectProperty, PathSequence, UnionShape, SetShape, OptionalShape,
  ResourceShape, LiteralShape, ListShape, MapShape, ShapeReference, isPathSegment,
} from './shapes';
import {
  makeTermMap, makeTermSet, makeShapeResolver, assertUnknownShape,
  resolveListShapeDefaults, matchesTerm,
} from './common';
import { RampError, ErrorCode, formatDisplayShape, formatShapeStack } from './errors';
import { compactByReference } from './synthesize';
import { ValueMapper } from './value-mapping';

export interface FrameParams {
  rootShape: ShapeID;
  shapes: ReadonlyArray<Shape>;
  dataset: Rdf.Dataset;
  candidates?: Iterable<Rdf.Term>;
  mapper?: ValueMapper;
}

export interface FrameSolution {
  readonly value: unknown;
  readonly vars: ReadonlyHashMap<ShapeID, unknown>;
}

/**
 * @throws {RamError}
 */
export function *frame(params: FrameParams): IterableIterator<FrameSolution> {
  const refs = makeTermMap<unknown>() as HashMap<ShapeID, RefContext[]>;

  const context: FrameContext = {
    mapper: params.mapper || ValueMapper.mapByDefault(),
    dataset: params.dataset,
    vars: makeTermMap<unknown>() as HashMap<ShapeID, unknown>,
    refs,
    resolveShape: makeShapeResolver(params.shapes, shapeID => {
      throw makeError(
        ErrorCode.MissingShape,
        `Failed to resolve shape ${Rdf.toString(shapeID)}`
      );
    }),
  };

  const rootShape = context.resolveShape(params.rootShape);
  const candidates = params.candidates || findAllCandidates(params.dataset);
  const solution: { value: unknown; vars: typeof context.vars } = {
    value: undefined,
    vars: context.vars,
  };
  const stack = new StackFrame(undefined, rootShape);
  for (const value of frameShape(rootShape, false, candidates, stack, context)) {
    if (value === MISMATCH) {
      continue;
    }
    solution.value = value;
    yield solution;
    solution.value = undefined;
  }
}

interface FrameContext {
  readonly mapper: ValueMapper;
  readonly dataset: Rdf.Dataset;
  readonly vars: HashMap<ShapeID, unknown>;
  readonly refs: HashMap<ShapeID, RefContext[]>;
  resolveShape(shapeID: ShapeID): Shape;
}

class StackFrame {
  constructor(
    readonly parent: StackFrame | undefined,
    readonly shape: Shape,
    readonly edge?: string | number,
  ) {}
  hasEdge() {
    return this.edge !== undefined;
  }
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
): Iterable<unknown | Mismatch> {
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
        yield strict ? throwFailedToMatch(shape, stack) : MISMATCH;
      }
      continue;
    }

    const matchingRefs = context.refs.get(shape.id);
    if (matchingRefs) {
      for (const ref of matchingRefs) {
        ref.match = value;
      }
    }
    const typed = context.mapper.fromRdf(value, shape);
    context.vars.set(shape.id, typed);

    yield typed;

    if (matchingRefs) {
      for (const ref of matchingRefs) {
        ref.match = undefined;
      }
    }
    context.vars.delete(shape.id);
  }
}

function *frameObject(
  shape: ObjectShape,
  required: boolean,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<{ [fieldName: string]: unknown } | Mismatch> {
  function failMatch(candidate: Rdf.Term, code: ErrorCode, message: string): never {
    const fullMessage = message +
      ` when framing subject ${Rdf.toString(candidate)}` +
      ` to shape ${Rdf.toString(shape.id)}`;
    throw makeError(code, fullMessage, stack);
  }

  function frameProperties(
    properties: ReadonlyArray<ObjectProperty>,
    required: boolean,
    candidate: Rdf.NamedNode | Rdf.BlankNode,
    template: { [fieldName: string]: unknown }
  ): boolean {
    for (const property of properties) {
      const valueShape = context.resolveShape(property.valueShape);
      const values = findByPropertyPath(property.path, candidate, context);
      const nextStack = new StackFrame(stack, valueShape, property.name);
      let found = false;
      for (const value of frameShape(valueShape, required, values, nextStack, context)) {
        if (value === MISMATCH) {
          return required ? failMatch(
            candidate,
            ErrorCode.PropertyMismatch,
            `Failed to match property "${property.name}"`
          ) : false;
        }
        if (found) {
          return required ? failMatch(
            candidate,
            ErrorCode.MultiplePropertyMatches,
            `Found multiple matches for property "${property.name}"`
          ) : false;
        }
        found = true;
        template[property.name] = value;
      }
      if (!found) {
        return required ? failMatch(
          candidate,
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
        ? failMatch(candidate, ErrorCode.NonResourceTerm, `Found non-resource term`)
        : MISMATCH;
      continue;
    }

    const template = {};
    if (frameProperties(shape.typeProperties, required, candidate, template)) {
      const checkProperties = required || shape.typeProperties.length > 0;
      if (frameProperties(shape.properties, checkProperties, candidate, template)) {
        yield template;
      } else {
        yield MISMATCH;
      }
    } else {
      yield MISMATCH;
    }
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
): Iterable<unknown> {
  let found = false;
  let mismatch = false;
  for (const variant of shape.variants) {
    const variantShape = context.resolveShape(variant);
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
      for (const variant of shape.variants) {
        const variantShape = context.resolveShape(variant);
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
  const itemShape = context.resolveShape(shape.itemShape);
  const nextStack = new StackFrame(stack, itemShape);
  const matches: unknown[] = [];
  for (const match of frameShape(itemShape, required, candidates, nextStack, context)) {
    if (match === MISMATCH) {
      yield MISMATCH;
      return;
    }
    matches.push(match);
  }
  yield matches;
}

function *frameOptional(
  shape: OptionalShape,
  required: boolean,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<unknown | Mismatch> {
  let found = false;
  const itemShape = context.resolveShape(shape.itemShape);
  const nextStack = new StackFrame(stack, itemShape);
  for (const value of frameShape(itemShape, false, candidates, nextStack, context)) {
    if (value === MISMATCH) {
      if (required) {
        // try to frame with "required = true" to produce error
        yield* frameShape(itemShape, true, candidates, nextStack, context);
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
      return throwFailedToMatch(shape, stack, candidate);
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
): Iterable<unknown[] | Mismatch> {
  const {head: headPath, tail: tailPath, nil} = resolveListShapeDefaults(shape);
  const itemShape = context.resolveShape(shape.itemShape);

  function frameListFromTerm(candidate: Rdf.Term): unknown[] | Mismatch {
    let result: unknown[] | undefined;
    let index = 0;
    let rest = candidate;

    function failMatch(code: ErrorCode, message: string): never {
      const fullMessage = message + formatListMatchPosition(index, rest, candidate, shape);
      throw makeError(code, fullMessage, stack);
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

      const nextStack = new StackFrame(stack, itemShape, index);
      let hasItemMatch = false;
      for (const item of frameShape(itemShape, required, [foundHead], nextStack, context)) {
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
    yield frameListFromTerm(candidate);
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

  const itemShape = context.resolveShape(shape.itemShape);
  const nextStack = new StackFrame(stack, itemShape);
  for (const item of frameShape(itemShape, required, candidates, nextStack, context)) {
    if (item === MISMATCH) {
      yield MISMATCH;
      return;
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
  const shape = context.resolveShape(refContext.reference.target);
  try {
    return compactByReference(refContext.match, shape, refContext.reference);
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

function throwFailedToMatch(shape: Shape, stack: StackFrame, term?: Rdf.Term): never {
  const displyedShape = formatDisplayShape(shape);
  const baseMessage = term
    ? `Term ${Rdf.toString(term)} does not match ${displyedShape}`
    : `Failed to match ${displyedShape}`;

  throw makeError(ErrorCode.ShapeMismatch, baseMessage, stack);
}

function pushRef(map: HashMap<ShapeID, RefContext[]>, ref: RefContext) {
  let items = map.get(ref.reference.target);
  if (!items) {
    items = [];
    map.set(ref.reference.target, items);
  }
  items.push(ref);
}

function popRef(map: HashMap<ShapeID, RefContext[]>, ref: RefContext) {
  const items = map.get(ref.reference.target);
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
