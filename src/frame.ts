import { HashMap, ReadonlyHashMap,  } from './hash-map';
import * as Rdf from './rdf-model';
import {
  ShapeID, Shape, ObjectShape, ObjectProperty, PropertyPathSegment, UnionShape, SetShape,
  OptionalShape, ResourceShape, LiteralShape, ListShape, MapShape, ShapeReference
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
  triples: ReadonlyArray<Rdf.Quad>;
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
    triples: params.triples,
    indexedTriples: indexTriples(params.triples),
    vars: makeTermMap<unknown>() as HashMap<ShapeID, unknown>,
    refs,
    resolveShape: makeShapeResolver(params.shapes, shapeID => {
      throw new Error(
        `Failed to resolve shape ${Rdf.toString(shapeID)}`
      );
    }),
  };

  const rootShape = context.resolveShape(params.rootShape);
  const allCandidates = findAllCandidates(params.triples);
  const solution: { value: unknown; vars: typeof context.vars } = {
    value: undefined,
    vars: context.vars,
  };
  for (const value of frameShape(rootShape, allCandidates, undefined, context)) {
    solution.value = value;
    yield solution;
    solution.value = undefined;
  }
}

interface IndexKey {
  readonly source: Rdf.Term;
  readonly predicate: Rdf.Term;
}
namespace IndexKey {
  export function hashCode(key: IndexKey): number {
    return (Rdf.hash(key.source) * 31 + Rdf.hash(key.predicate)) | 0;
  }
  export function equals(a: IndexKey, b: IndexKey): boolean {
    return Rdf.equals(a.source, b.source) && Rdf.equals(a.predicate, b.predicate);
  }
}

function indexTriples(triples: ReadonlyArray<Rdf.Quad>) {
  const indexed = new HashMap<IndexKey, Rdf.Quad[]>(IndexKey.hashCode, IndexKey.equals);
  const put = (key: IndexKey, quad: Rdf.Quad) => {
    let items = indexed.get(key);
    if (!items) {
      items = [];
      indexed.set(key, items);
    }
    items.push(quad);
  };
  for (const t of triples) {
    put({source: t.subject, predicate: t.predicate}, t);
    put({source: t.object, predicate: t.predicate}, t);
  }
  return indexed;
}

interface FrameContext {
  readonly mapper: ValueMapper;
  readonly triples: ReadonlyArray<Rdf.Quad>;
  readonly indexedTriples: ReadonlyHashMap<IndexKey, Rdf.Quad[]>;
  readonly vars: HashMap<ShapeID, unknown>;
  readonly refs: HashMap<ShapeID, RefContext[]>;
  resolveShape(shapeID: ShapeID): Shape;
}

class StackFrame {
  constructor(
    readonly parent: StackFrame | undefined,
    readonly shape: Shape,
    readonly property?: ObjectProperty,
    readonly index?: number,
  ) {}
  hasEdge() {
    return this.property !== undefined || this.index !== undefined;
  }
}

interface RefContext {
  source: ShapeID;
  reference: ShapeReference;
  match?: unknown;
}

function *frameShape(
  shape: Shape,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame | undefined,
  context: FrameContext
): Iterable<unknown> {
  const nextStack = (stack && stack.hasEdge()) ? stack : new StackFrame(stack, shape);

  const solutions = (() => {
    switch (shape.type) {
      case 'object':
        return frameObject(shape, candidates, nextStack, context);
      case 'union':
        return frameUnion(shape, candidates, nextStack, context);
      case 'set':
        return frameSet(shape, candidates, nextStack, context);
      case 'optional':
        return frameOptional(shape, candidates, nextStack, context);
      case 'resource':
      case 'literal':
        return frameNode(shape, candidates, nextStack, context);
      case 'list':
        return frameList(shape, candidates, nextStack, context);
      case 'map':
        return frameMap(shape, candidates, nextStack, context);
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
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<{ [fieldName: string]: unknown }> {
  for (const candidate of filterResources(candidates)) {
    const template = {};
    if (frameProperties(shape.typeProperties, template, candidate, undefined, stack, context)) {
      // stores failed to match properties to produce diagnostics
      const errors: PropertyMatchError[] | undefined =
        shape.typeProperties.length > 0 ? [] : undefined;

      if (frameProperties(shape.properties, template, candidate, errors, stack, context)) {
        yield template;
      } else if (errors && errors.length > 0) {
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
    }
  }
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
  for (const property of properties) {
    const valueShape = context.resolveShape(property.valueShape);

    let found = false;
    for (const value of frameProperty(property, valueShape, candidate, stack, context)) {
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
  candidate: Rdf.NamedNode | Rdf.BlankNode,
  stack: StackFrame,
  context: FrameContext
): Iterable<unknown> {
  const values = findByPropertyPath(property.path, candidate, context);
  const nextStack = new StackFrame(stack, valueShape, property);
  yield* frameShape(valueShape, values, nextStack, context);
}

function findByPropertyPath(
  path: ReadonlyArray<PropertyPathSegment>,
  candidate: Rdf.NamedNode | Rdf.BlankNode,
  context: FrameContext
): Iterable<Rdf.Term> {
  if (path.length === 0) {
    return [candidate];
  }

  let current: Rdf.Term[] = [candidate];
  let next: Rdf.Term[] = [];

  for (const segment of path) {
    for (const source of current) {
      const key: IndexKey = {source, predicate: segment.predicate};
      const triples = context.indexedTriples.get(key);
      if (triples) {
        for (const t of triples) {
          if (segment.reverse && Rdf.equals(source, t.object)) {
            next.push(t.subject);
          } else if (!segment.reverse && Rdf.equals(source, t.subject)) {
            next.push(t.object);
          }
        }
      }
    }
    const temp = current;
    current = next;
    next = temp;
    next.length = 0;
  }

  if (current.length > 1) {
    const set = makeTermSet();
    for (const value of current) {
      set.add(value);
    }
    return set;
  } else {
    return current;
  }
}

function *frameUnion(
  shape: UnionShape,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<unknown> {
  for (const variant of shape.variants) {
    const variantShape = context.resolveShape(variant);
    yield* frameShape(variantShape, candidates, stack, context);
  }
}

function *frameSet(
  shape: SetShape,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<unknown[]> {
  const itemShape = context.resolveShape(shape.itemShape);
  yield Array.from(frameShape(itemShape, candidates, stack, context));
}

function *frameOptional(
  shape: OptionalShape,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<unknown> {
  let found = false;
  const itemShape = context.resolveShape(shape.itemShape);
  for (const value of frameShape(itemShape, candidates, stack, context)) {
    found = true;
    yield value;
  }
  if (!found) {
    yield shape.emptyValue;
  }
}

function *frameNode(
  shape: ResourceShape | LiteralShape,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<Rdf.Term> {
  for (const candidate of candidates) {
    if (matchesTerm(shape, candidate)) {
      yield candidate;
    }
  }
}

function *frameList(
  shape: ListShape,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FrameContext
): Iterable<unknown[]> {
  const {head: headPath, tail: tailPath, nil} = resolveListShapeDefaults(shape);
  const itemShape = context.resolveShape(shape.itemShape);

  for (const candidate of filterResources(candidates)) {
    let result: unknown[] | undefined;
    let index = 0;
    let rest = candidate;

    while (true) {
      if (Rdf.equals(rest, nil)) {
        if (!result) {
          result = [];
        }
        break;
      }

      let foundHead: Rdf.Term | undefined;
      for (const head of findByPropertyPath(headPath, rest, context)) {
        if (foundHead && !Rdf.equals(head, foundHead)) {
          throw new Error(`Found multiple matches for list head ` +
            formatListMatchPosition(index, rest, candidate, shape, stack));
        }
        foundHead = head;
      }
      if (!foundHead) {
        if (index === 0) {
          break;
        } else {
          throw new Error(
            `Failed to match list head ` +
            formatListMatchPosition(index, rest, candidate, shape, stack)
          );
        }
      }

      if (!result) {
        result = [];
      }

      const nextStack = new StackFrame(stack, itemShape, undefined, index);
      let hasItemMatch = false;
      for (const item of frameShape(itemShape, [foundHead], nextStack, context)) {
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
      for (const tail of filterResources(findByPropertyPath(tailPath, rest, context))) {
        if (foundTail && !Rdf.equals(tail, foundTail)) {
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
  for (const item of frameShape(itemShape, candidates, stack, context)) {
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

function *filterResources(nodes: Iterable<Rdf.Term>) {
  for (const node of nodes) {
    if (node.termType === 'NamedNode' || node.termType === 'BlankNode') {
      yield node;
    }
  }
}

function findAllCandidates(triples: ReadonlyArray<Rdf.Quad>) {
  const candidates = makeTermSet();
  for (const {subject, object} of triples) {
    candidates.add(subject);
    candidates.add(object);
  }
  return candidates;
}

function formatShapeStack(stack: StackFrame) {
  let result = '';
  let frame: StackFrame | undefined = stack;
  while (frame) {
    const edge = (
      frame.property ? `"${frame.property.name}" |> ` :
      frame.index ? `${frame.index} |> ` :
      ''
    );
    result = edge + Rdf.toString(frame.shape.id) + (result ? ' |> ' : '') + result;
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
