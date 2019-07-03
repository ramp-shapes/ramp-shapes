import { HashMap, ReadonlyHashMap, HashSet, ReadonlyHashSet } from './hash-map';
import * as Rdf from './rdf';
import {
  ShapeID, Shape, ObjectShape, ObjectProperty, PathSequence, UnionShape, SetShape, OptionalShape,
  ResourceShape, LiteralShape, ListShape, MapShape, ShapeReference, isPathSegment,
} from './shapes';
import {
  makeTermMap, makeTermSet, makeShapeResolver, assertUnknownShape,
  resolveListShapeDefaults, matchesTerm
} from './common';
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

export function *frame(params: FrameParams): IterableIterator<FrameSolution> {
  const refs = makeTermMap<unknown>() as HashMap<ShapeID, RefContext[]>;

  const context: FrameContext = {
    mapper: params.mapper || ValueMapper.mapByDefault(),
    dataset: params.dataset,
    vars: makeTermMap<unknown>() as HashMap<ShapeID, unknown>,
    refs,
    resolveShape: makeShapeResolver(params.shapes, shapeID => {
      throw new Error(
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

function *frameShape(
  shape: Shape,
  strict: boolean,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<unknown> {
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
): Iterable<{ [fieldName: string]: unknown }> {
  for (const candidate of candidates) {
    if (!isResource(candidate)) {
      if (required) {
        return throwFailedToMatch(shape, stack, candidate);
      } else {
        continue;
      }
    }
    const template = {};
    // stores failed to match properties to produce diagnostics
    let errors: PropertyMatchError[] | undefined = required ? [] : undefined;
    if (frameProperties(shape.typeProperties, template, candidate, undefined, stack, context)) {
      if (!errors && shape.typeProperties.length > 0) {
        errors = [];
      }

      if (frameProperties(shape.properties, template, candidate, errors, stack, context)) {
        yield template;
      } else if (errors && errors.length > 0) {
        throwPropertyError(errors, shape, candidate, stack);
      }
    } else if (errors && errors.length > 0) {
      throwPropertyError(errors, shape, candidate, stack);
    }
  }
}

function throwPropertyError(
  errors: ReadonlyArray<PropertyMatchError>,
  shape: ObjectShape,
  candidate: Rdf.Term,
  stack: StackFrame
): never {
  const propertyErrors: string[] = [];

  if (errors.find(e => e.type === 'no-match')) {
    propertyErrors.push(
      'failed to match properties: ' +
      errors
        .filter(e => e.type === 'no-match')
        .map(e => `"${e.property.name}"`)
        .join(', ')
    );
  }

  if (errors.find(e => e.type === 'multiple-matches')) {
    propertyErrors.push(
      'found multiple matches for properties: ' +
      errors
        .filter(e => e.type === 'multiple-matches')
        .map(e => `"${e.property.name}"`)
        .join(', ')
    );
  }

  throw new Error(
    `Invalid subject ${Rdf.toString(candidate)} for shape ${Rdf.toString(shape.id)}: ` +
    propertyErrors.join('; ') + ' at ' + formatShapeStack(stack)
  );
}

interface PropertyMatchError {
  type: 'no-match' | 'multiple-matches';
  property: ObjectProperty;
}

function frameProperties(
  properties: ReadonlyArray<ObjectProperty>,
  template: { [fieldName: string]: unknown },
  candidate: Rdf.NamedNode | Rdf.BlankNode,
  errors: PropertyMatchError[] | undefined,
  stack: StackFrame,
  context: FrameContext
): boolean {
  const required = errors !== undefined;
  for (const property of properties) {
    const valueShape = context.resolveShape(property.valueShape);

    let found = false;
    for (const value of frameProperty(property, valueShape, required, candidate, stack, context)) {
      if (found) {
        if (errors) {
          errors.push({property, type: 'multiple-matches'});
        } else {
          return false;
        }
      }
      found = true;
      template[property.name] = value;
    }

    if (!found) {
      if (errors) {
        errors.push({property, type: 'no-match'});
      } else {
        return false;
      }
    }
  }

  return errors ? errors.length === 0 : true;
}

function *frameProperty(
  property: ObjectProperty,
  valueShape: Shape,
  required: boolean,
  candidate: Rdf.NamedNode | Rdf.BlankNode,
  stack: StackFrame,
  context: FrameContext
): Iterable<unknown> {
  const values = findByPropertyPath(property.path, candidate, context);
  const nextStack = new StackFrame(stack, valueShape, property.name);
  yield* frameShape(valueShape, required, values, nextStack, context);
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
  for (const variant of shape.variants) {
    const variantShape = context.resolveShape(variant);
    const nextStack = new StackFrame(stack, variantShape);
    for (const match of frameShape(variantShape, false, candidates, nextStack, context)) {
      found = true;
      yield match;
    }
  }

  if (required && !found) {
    // try to frame first shape with "required = true" to produce error
    for (const variant of shape.variants) {
      const variantShape = context.resolveShape(variant);
      const nextStack = new StackFrame(stack, variantShape);
      yield* frameShape(variantShape, true, candidates, nextStack, context);
    }
    // otherwise just throw an error
    return throwFailedToMatch(shape, stack);
  }
}

function *frameSet(
  shape: SetShape,
  required: boolean,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<unknown[]> {
  const itemShape = context.resolveShape(shape.itemShape);
  const nextStack = new StackFrame(stack, itemShape);
  yield Array.from(frameShape(itemShape, required, candidates, nextStack, context));
}

function *frameOptional(
  shape: OptionalShape,
  required: boolean,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<unknown> {
  let found = false;
  const itemShape = context.resolveShape(shape.itemShape);
  const nextStack = new StackFrame(stack, itemShape);
  for (const value of frameShape(itemShape, false, candidates, nextStack, context)) {
    found = true;
    yield value;
  }
  if (!found) {
    if (required && !isEmpty(candidates)) {
      // try to frame first shape with "required = true" to produce error
      yield* frameShape(itemShape, true, candidates, stack, context);
      // otherwise just throw an error
      return throwFailedToMatch(shape, stack);
    }
    yield shape.emptyValue;
  }
}

function *frameNode(
  shape: ResourceShape | LiteralShape,
  required: boolean,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<Rdf.Term> {
  for (const candidate of candidates) {
    if (matchesTerm(shape, candidate)) {
      yield candidate;
    } else if (required) {
      return throwFailedToMatch(shape, stack, candidate);
    }
  }
}

function *frameList(
  shape: ListShape,
  required: boolean,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<unknown[]> {
  const {head: headPath, tail: tailPath, nil} = resolveListShapeDefaults(shape);
  const itemShape = context.resolveShape(shape.itemShape);

  for (const candidate of candidates) {
    if (!isResource(candidate)) {
      if (required) {
        return throwFailedToMatch(shape, stack, candidate);
      } else {
        continue;
      }
    }

    let result: unknown[] | undefined;
    let index = 0;
    let rest = candidate;

    while (true) {
      if (Rdf.equalTerms(rest, nil)) {
        if (!result) {
          result = [];
        }
        break;
      }

      let foundHead: Rdf.Term | undefined;
      for (const head of findByPropertyPath(headPath, rest, context)) {
        if (foundHead && !Rdf.equalTerms(head, foundHead)) {
          throw new Error(`Found multiple matches for list head ` +
            formatListMatchPosition(index, rest, candidate, shape, stack));
        }
        foundHead = head;
      }
      if (!foundHead) {
        if (index > 0) {
          throw new Error(
            `Failed to match list head ` +
            formatListMatchPosition(index, rest, candidate, shape, stack)
          );
        } else if (required) {
          return throwFailedToMatch(shape, stack, candidate);
        } else {
          break;
        }
      }

      if (!result) {
        result = [];
      }

      const nextStack = new StackFrame(stack, itemShape, index);
      let hasItemMatch = false;
      for (const item of frameShape(itemShape, required, [foundHead], nextStack, context)) {
        if (hasItemMatch) {
          // fail to match item if multiple matches found
          hasItemMatch = false;
          break;
        }
        hasItemMatch = true;
        result.push(item);
      }
      if (!hasItemMatch) {
        // fail to match list when failed to match an item
        result = undefined;
        break;
      }

      let foundTail: Rdf.NamedNode | Rdf.BlankNode | undefined;
      for (const tail of findByPropertyPath(tailPath, rest, context)) {
        if (!isResource(tail)) { continue; }
        if (foundTail && !Rdf.equalTerms(tail, foundTail)) {
          throw new Error(`Found multiple matches for list tail ` +
            formatListMatchPosition(index, rest, candidate, shape, stack));
        }
        foundTail = tail;
      }
      if (!foundTail) {
        throw new Error(`Failed to match list tail ` +
          formatListMatchPosition(index, rest, candidate, shape, stack));
      }

      rest = foundTail;
      index++;
    }

    if (result) {
      yield result;
    }
  }
}

function formatListMatchPosition(
  index: number,
  tail: Rdf.NamedNode | Rdf.BlankNode,
  subject: Rdf.NamedNode | Rdf.BlankNode,
  shape: Shape,
  stack: StackFrame
) {
  return (
    `at index ${index} with tail ${Rdf.toString(tail)}, subject ${Rdf.toString(subject)}, ` +
    `shape ${Rdf.toString(shape.id)} at ` + formatShapeStack(stack)
  );
}

function *frameMap(
  shape: MapShape,
  required: boolean,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<{ [key: string]: unknown }> {
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
    const key = frameByReference(keyContext, stack, context);
    const value = valueContext ? frameByReference(valueContext, stack, context) : item;
    if (key !== undefined && value !== undefined) {
      if (!(typeof key === 'string' || typeof key === 'number' || typeof key === 'boolean')) {
        throw new Error(
          `Cannot use non-primitive value as a key of map ${Rdf.toString(shape.id)}: ` +
          `(${typeof key}) ${key} at ` + formatShapeStack(stack)
        );
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
    throw new Error(`${message} at ${formatShapeStack(stack)}`);
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

function isEmpty(collection: Iterable<unknown>) {
  for (const item of collection) {
    return false;
  }
  return true;
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
  const displyedShape = shape.id.termType === 'BlankNode'
    ? `(${shape.type} ${Rdf.toString(shape.id)})`
    : Rdf.toString(shape.id);

  const baseMessage = term
    ? `Term ${Rdf.toString(term)} does not match ${displyedShape} at `
    : `Failed to match ${displyedShape} at `;

  throw new Error(baseMessage + formatShapeStack(stack));
}

function formatShapeStack(stack: StackFrame) {
  let result = '';
  let frame: StackFrame | undefined = stack;
  let last: StackFrame | undefined;
  while (frame) {
    const shape = frame.shape.id.termType === 'BlankNode'
      ? `(${frame.shape.type} ${Rdf.toString(frame.shape.id)})`
      : Rdf.toString(frame.shape.id);
    const edge = (
      (last && typeof last.edge === 'string') ? `."${last.edge}"` :
      (last && typeof last.edge === 'number') ? `.[${last.edge}]` :
      ''
    );
    result = `${shape}${edge}${last ? ` / ` : ''}${result}`;
    last = frame;
    frame = frame.parent;
  }
  return result;
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
    throw new Error('Cannot remove ref context');
  }
  const removed = items.pop();
  if (removed !== ref) {
    throw new Error('Encountered non-matching ref operations');
  }
}

function toTraceString(value: unknown) {
  return Array.isArray(value) ? `[length = ${value.length}]` :
    (typeof value === 'object' && value) ? `{keys: ${Object.keys(value)}}` :
    String(value);
}
