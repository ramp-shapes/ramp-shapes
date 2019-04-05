import { HashMap, ReadonlyHashMap } from './hash-map';
import * as Rdf from './rdf-model';
import {
  ShapeID, Shape, ObjectShape, ObjectProperty, PropertyPathSegment, UnionShape, SetShape,
  OptionalShape, ResourceShape, LiteralShape, ListShape, MapShape,
} from './shapes';
import {
  makeNodeMap, makeNodeSet, makeShapeResolver, assertUnknownShape, resolveListShapeDefaults,
  doesNodeMatch
} from './common';
import { tryConvertToNativeType } from './type-conversion';

export interface FramingParams {
  rootShape: ShapeID;
  shapes: ReadonlyArray<Shape>;
  triples: ReadonlyArray<Rdf.Triple>;
  trace?: boolean;
}

export interface FramingSolution {
  readonly value: unknown;
  readonly vars: ReadonlyHashMap<ShapeID, unknown>;
}

export function *frame(params: FramingParams): IterableIterator<FramingSolution> {
  const trace = params.trace
    ? (...args: unknown[]) => console.log(...args)
    : () => {};

  const context: FramingContext = {
    triples: params.triples,
    vars: makeNodeMap<unknown>() as HashMap<ShapeID, unknown>,
    resolveShape: makeShapeResolver(params.shapes),
    frameType: (shape, value) => {
      return (shape.type === 'resource' || shape.type === 'literal')
        ? tryConvertToNativeType(shape, value as Rdf.Node)
        : value;
    },
    enableTrace: Boolean(params.trace),
    trace,
  };

  const rootShape = context.resolveShape(params.rootShape);
  const allCandidates = findAllCandidates(params.triples);
  const solution: { value: unknown; vars: typeof context.vars } = {
    value: undefined,
    vars: context.vars,
  };
  for (const value of frameShape(rootShape, allCandidates, context)) {
    solution.value = value;
    yield solution;
    solution.value = undefined;
  }
}

interface FramingContext {
  readonly triples: ReadonlyArray<Rdf.Triple>;
  readonly vars: HashMap<ShapeID, unknown>;
  resolveShape(shapeID: ShapeID): Shape;
  frameType(shape: Shape, value: unknown): unknown;
  enableTrace: boolean;
  trace(...args: unknown[]): void;
}

function *frameShape(
  shape: Shape,
  candidates: Iterable<Rdf.Node>,
  context: FramingContext
): Iterable<unknown> {
  const solutions = (() => {
    switch (shape.type) {
      case 'object':
        return frameObject(shape, candidates, context);
      case 'union':
        return frameUnion(shape, candidates, context);
      case 'set':
        return frameSet(shape, candidates, context);
      case 'optional':
        return frameOptional(shape, candidates, context);
      case 'resource':
      case 'literal':
        return frameNode(shape, candidates, context);
      case 'list':
        return frameList(shape, candidates, context);
      case 'map':
        return frameMap(shape, candidates, context);
      default:
        return assertUnknownShape(shape);
    }
  })();
  
  for (const value of solutions) {
    const typed = context.frameType(shape, value);
    context.vars.set(shape.id, typed);
    yield typed;
    context.vars.delete(shape.id);
  }
}

function *frameObject(
  shape: ObjectShape,
  candidates: Iterable<Rdf.Node>,
  context: FramingContext
): Iterable<{ [fieldName: string]: unknown }> {
  for (const candidate of filterResources(candidates)) {
    for (const partial of frameProperties(shape.typeProperties, {}, candidate, undefined, context)) {
      // stores failed to match properties to produce diagnostics
      const missing = shape.typeProperties.length > 0 ? [] as ObjectProperty[] : undefined;
      for (const final of frameProperties(shape.properties, partial, candidate, missing, context)) {
        yield {...final};
      }
      if (missing && missing.length > 0) {
        throw new Error(
          `Invalid entity ${Rdf.toString(candidate)} for shape ${Rdf.toString(shape.id)}: ` +
          `failed to match properties: ${missing.map(p => `"${p.name}"`).join(', ')}.`
        );
      }
    }
  }
}

function *frameProperties(
  properties: ReadonlyArray<ObjectProperty>,
  template: { [fieldName: string]: unknown },
  candidate: Rdf.Iri | Rdf.Blank,
  missing: ObjectProperty[] | undefined,
  context: FramingContext
): Iterable<{ [fieldName: string]: unknown }> {
  if (properties.length === 0) {
    if (!missing || missing.length === 0) {
      yield template;
    }
    return;
  }

  const [first, ...rest] = properties;
  const valueShape = context.resolveShape(first.valueShape);

  let found = false;
  for (const value of frameProperty(first.path, valueShape, candidate, context)) {
    found = true;
    template[first.name] = value;
    yield* frameProperties(rest, template, candidate, missing, context);
    delete template[first.name];
  }

  if (!found && missing) {
    missing.push(first);
    yield* frameProperties(rest, template, candidate, missing, context);
  }
}

function *frameProperty(
  path: ReadonlyArray<PropertyPathSegment>,
  valueShape: Shape,
  candidate: Rdf.Iri | Rdf.Blank,
  context: FramingContext
): Iterable<unknown> {
  const values = findByPropertyPath(path, candidate, context);
  yield* frameShape(valueShape, values, context);
}

function findByPropertyPath(
  path: ReadonlyArray<PropertyPathSegment>,
  candidate: Rdf.Iri | Rdf.Blank,
  context: FramingContext
): Iterable<Rdf.Node> {
  if (path.length === 0) {
    return [candidate];
  }

  let current = makeNodeSet();
  let next = makeNodeSet();
  current.add(candidate);

  for (const segment of path) {
    for (const {s, p, o} of context.triples) {
      if (!Rdf.equals(p, segment.predicate)) {
        continue;
      }
      let source = s;
      let target = o;
      if (segment.reverse) {
        source = o;
        target = s;
      }
      if (current.has(source)) {
        next.add(target);
      }
    }

    const previous = current;
    previous.clear();
    current = next;
    next = previous;
  }

  return current;
}

function *frameUnion(
  shape: UnionShape,
  candidates: Iterable<Rdf.Node>,
  context: FramingContext
): Iterable<unknown> {
  for (const variant of shape.variants) {
    const variantShape = context.resolveShape(variant);
    yield* frameShape(variantShape, candidates, context);
  }
}

function *frameSet(
  shape: SetShape,
  candidates: Iterable<Rdf.Node>,
  context: FramingContext
): Iterable<unknown[]> {
  const itemShape = context.resolveShape(shape.itemShape);
  yield Array.from(frameShape(itemShape, candidates, context));
}

function *frameOptional(
  shape: OptionalShape,
  candidates: Iterable<Rdf.Node>,
  context: FramingContext
): Iterable<unknown> {
  let found = false;
  const valueShape = context.resolveShape(shape.valueShape);
  for (const value of frameShape(valueShape, candidates, context)) {
    found = true;
    yield value;
  }
  if (!found) {
    yield shape.emptyValue;
  }
}

function *frameNode(
  shape: ResourceShape | LiteralShape,
  candidates: Iterable<Rdf.Node>,
  context: FramingContext
): Iterable<Rdf.Node> {
  for (const candidate of candidates) {
    if (doesNodeMatch(shape, candidate)) {
      yield candidate;
    }
  }
}

function *frameList(
  shape: ListShape,
  candidates: Iterable<Rdf.Node>,
  context: FramingContext
): Iterable<unknown[]> {
  const {head, tail, nil} = resolveListShapeDefaults(shape);
  const item = context.resolveShape(shape.itemShape);
  const list: ListFraming = {origin: shape, template: [], head, tail, nil, item};
  for (const candidate of filterResources(candidates)) {
    for (const final of frameListItems(list, false, candidate, context)) {
      yield [...final];
    }
  }
}

interface ListFraming {
  readonly origin: ListShape;
  readonly template: unknown[];
  readonly head: ReadonlyArray<PropertyPathSegment>;
  readonly tail: ReadonlyArray<PropertyPathSegment>;
  readonly item: Shape;
  readonly nil: Rdf.Iri;
}

function *frameListItems(
  list: ListFraming,
  required: boolean,
  candidate: Rdf.Iri | Rdf.Blank,
  context: FramingContext
): IterableIterator<unknown[]> {
  if (Rdf.equals(candidate, list.nil)) {
    yield list.template;
    return;
  }

  let foundHead = false;
  for (const head of findByPropertyPath(list.head, candidate, context)) {
    foundHead = true;

    for (const item of frameShape(list.item, [head], context)) {
      list.template.push(item);
      let foundTail = false;
      for (const tail of filterResources(findByPropertyPath(list.tail, candidate, context))) {
        foundTail = true;
        yield* frameListItems(list, true, tail, context);
      }
      if (!foundTail) {
        throw new Error(
          `Missing tail for list ${Rdf.toString(list.origin.id)} ` +
          `at ${Rdf.toString(candidate)}`
        );
      }
      list.template.pop();
    }
  }
  if (required && !foundHead) {
    throw new Error(
      `Missing head or nil for list ${Rdf.toString(list.origin.id)} ` +
      `at ${Rdf.toString(candidate)}`
    );
  }
}

function *frameMap(
  shape: MapShape,
  candidates: Iterable<Rdf.Node>,
  context: FramingContext
): Iterable<{ [key: string]: unknown }> {
  const result: { [key: string]: unknown } = {};
  const itemShape = context.resolveShape(shape.itemShape);
  for (const item of frameShape(itemShape, candidates, context)) {
    const key = context.vars.get(shape.keyRef);
    if (key) {
      if (typeof key === 'string' || typeof key === 'number' || typeof key === 'boolean') {
        result[key.toString()] = item;
      } else {
        throw new Error(
          `Cannot use non-primitive value as a key of map ${Rdf.toString(shape.id)}: ` +
          `(${typeof key}) ${key}`
        );
      }
    }
  }
  yield result;
}

function *filterResources(nodes: Iterable<Rdf.Node>) {
  for (const node of nodes) {
    if (node.type === 'uri' || node.type === 'bnode') {
      yield node;
    }
  }
}

function findAllCandidates(triples: ReadonlyArray<Rdf.Triple>) {
  const candidates = makeNodeSet();
  for (const {s, p, o} of triples) {
    candidates.add(s);
    candidates.add(o);
  }
  return candidates;
}

function toTraceString(value: unknown) {
  return Array.isArray(value) ? `[length = ${value.length}]` :
    (typeof value === 'object' && value) ? `{keys: ${Object.keys(value)}}` :
    String(value);
}
