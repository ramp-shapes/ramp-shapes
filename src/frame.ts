import { HashMap, ReadonlyHashMap } from './hash-map';
import * as Rdf from './rdf-model';
import { makeNodeMap, makeNodeSet, makeShapeResolver, assertUnknownShape } from './common';
import {
  ShapeID, Shape, ObjectShape, ObjectProperty, PropertyPathSegment, UnionShape, SetShape,
  OptionalShape, NodeShape, ListShape,
} from './shapes';
import { tryConvertToNativeType } from './type-conversion';
import { rdf, xsd } from './vocabulary';

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
      return shape.type === 'node'
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
): IterableIterator<unknown> {
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
      case 'node':
        return frameNode(shape, candidates, context);
      case 'list':
        return frameList(shape, candidates, context);
      default:
        return assertUnknownShape(shape);
    }
  })();
  
  for (const value of solutions) {
    yield context.frameType(shape, value);
  }
}

function *frameObject(
  shape: ObjectShape,
  candidates: Iterable<Rdf.Node>,
  context: FramingContext
): IterableIterator<{ [fieldName: string]: unknown }> {
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
): IterableIterator<{ [fieldName: string]: unknown }> {
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
): IterableIterator<unknown> {
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
): IterableIterator<unknown> {
  for (const variant of shape.variants) {
    const variantShape = context.resolveShape(variant);
    yield* frameShape(variantShape, candidates, context);
  }
}

function *frameSet(
  shape: SetShape,
  candidates: Iterable<Rdf.Node>,
  context: FramingContext
): IterableIterator<unknown[]> {
  const itemShape = context.resolveShape(shape.itemShape);
  yield Array.from(frameShape(itemShape, candidates, context));
}

function *frameOptional(
  shape: OptionalShape,
  candidates: Iterable<Rdf.Node>,
  context: FramingContext
): IterableIterator<unknown> {
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
  shape: NodeShape,
  candidates: Iterable<Rdf.Node>,
  context: FramingContext
): IterableIterator<Rdf.Node> {
  for (const candidate of candidates) {
    let nodeType: 'literal' | 'resource';
    let datatype: string | undefined;
    if (candidate.type === 'literal') {
      nodeType = 'literal';
      datatype = candidate.datatype || xsd.string.value;
    } else {
      nodeType = 'resource';
    }

    if (nodeType === shape.nodeType && (!shape.datatype || datatype === shape.datatype.value)) {
      if (!shape.value) {
        context.vars.set(shape.id, candidate);
        yield candidate;
        context.vars.delete(shape.id);
      } else if (Rdf.equals(candidate, shape.value)) {
        yield candidate;
      }
    }
  }
}

const DEFAULT_LIST_HEAD: ReadonlyArray<PropertyPathSegment> =
  [{predicate: rdf.first, reverse: false}];
const DEFAULT_LIST_TAIL: ReadonlyArray<PropertyPathSegment> =
  [{predicate: rdf.rest, reverse: false}];
const DEFAULT_LIST_NIL: NodeShape = {
  type: 'node',
  id: rdf.nil,
  nodeType: 'resource',
  value: rdf.nil,
};

function *frameList(
  shape: ListShape,
  candidates: Iterable<Rdf.Node>,
  context: FramingContext
): IterableIterator<unknown[]> {
  const list: ListFraming = {
    origin: shape,
    template: [],
    head: shape.headPath || DEFAULT_LIST_HEAD,
    tail: shape.tailPath || DEFAULT_LIST_TAIL,
    item: context.resolveShape(shape.itemShape),
    nil: shape.nilShape ? context.resolveShape(shape.nilShape) : DEFAULT_LIST_NIL,
  };
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
  readonly nil: Shape;
}

function *frameListItems(
  list: ListFraming,
  required: boolean,
  candidate: Rdf.Iri | Rdf.Blank,
  context: FramingContext
): IterableIterator<unknown[]> {
  let foundNil = false;
  for (const nil of frameShape(list.nil, [candidate], context)) {
    foundNil = true;
    yield list.template;
  }
  if (foundNil) {
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