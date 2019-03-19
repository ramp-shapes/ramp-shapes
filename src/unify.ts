import { HashMap, HashSet, ReadonlyHashMap } from './hash-map';
import * as Rdf from './rdf-model';
import {
  ShapeID, Shape, ObjectShape, ObjectProperty, PropertyPathSegment, UnionShape, SetShape,
  OptionalShape, NodeShape, ListShape,
} from './shapes';
import { tryConvertToNativeType } from './type-conversion';
import { rdf, xsd } from './vocabulary';

export interface UnificationSolution {
  readonly value: unknown;
  readonly vars: ReadonlyHashMap<ShapeID, unknown>;
}

export function *unifyTriplesToShape(params: {
  rootShape: ShapeID,
  shapes: ReadonlyArray<Shape>,
  triples: ReadonlyArray<Rdf.Triple>,
  trace?: boolean,
}): IterableIterator<UnificationSolution> {
  const contextShapes = makeNodeMap<Shape>();
  for (const shape of params.shapes) {
    contextShapes.set(shape.id, shape);
  }

  const trace = params.trace
    ? (...args: unknown[]) => console.log(...args)
    : () => {};

  const context: UnificationContext = {
    triples: params.triples,
    vars: new HashMap<ShapeID, unknown>(Rdf.hash, Rdf.equals),
    resolveShape: shapeID => {
      const shape = contextShapes.get(shapeID);
      if (!shape) {
        throw new Error(`Failed to resolve shape ${Rdf.toString(shapeID)}`);
      }
      return shape;
    },
    convertType: (shape, value) => {
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
  for (const value of unifyShape(rootShape, allCandidates, context)) {
    solution.value = value;
    yield solution;
    solution.value = undefined;
  }
}

interface UnificationContext {
  readonly triples: ReadonlyArray<Rdf.Triple>;
  readonly vars: HashMap<ShapeID, unknown>;
  resolveShape(shapeID: ShapeID): Shape;
  convertType(shape: Shape, value: unknown): unknown;
  enableTrace: boolean;
  trace(...args: unknown[]): void;
}

function *unifyShape(
  shape: Shape,
  candidates: Iterable<Rdf.Node>,
  context: UnificationContext
): IterableIterator<unknown> {
  const solutions = (() => {
    switch (shape.type) {
      case 'object':
        return unifyObject(shape, candidates, context);
      case 'union':
        return unifyUnion(shape, candidates, context);
      case 'set':
        return unifySet(shape, candidates, context);
      case 'optional':
        return unifyOptional(shape, candidates, context);
      case 'node':
        return unifyNode(shape, candidates, context);
      case 'list':
        return unifyList(shape, candidates, context);
      default:
        throw new Error(`Unknown shape type ${(shape as Shape).type}`);
    }
  })();
  
  for (const value of solutions) {
    yield context.convertType(shape, value);
  }
}

function *unifyObject(
  shape: ObjectShape,
  candidates: Iterable<Rdf.Node>,
  context: UnificationContext
): IterableIterator<{ [fieldName: string]: unknown }> {
  for (const candidate of filterResources(candidates)) {
    for (const partial of unifyProperties(shape.typeProperties, {}, candidate, undefined, context)) {
      // stores failed to match properties to produce diagnostics
      const missing = shape.typeProperties.length > 0 ? [] as ObjectProperty[] : undefined;
      for (const final of unifyProperties(shape.properties, partial, candidate, missing, context)) {
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

function *unifyProperties(
  properties: ReadonlyArray<ObjectProperty>,
  template: { [fieldName: string]: unknown },
  candidate: Rdf.Iri | Rdf.Blank,
  missing: ObjectProperty[] | undefined,
  context: UnificationContext
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
  for (const value of unifyProperty(first.path, valueShape, candidate, context)) {
    found = true;
    template[first.name] = value;
    yield* unifyProperties(rest, template, candidate, missing, context);
    delete template[first.name];
  }

  if (!found && missing) {
    missing.push(first);
    yield* unifyProperties(rest, template, candidate, missing, context);
  }
}

function *unifyProperty(
  path: ReadonlyArray<PropertyPathSegment>,
  valueShape: Shape,
  candidate: Rdf.Iri | Rdf.Blank,
  context: UnificationContext
): IterableIterator<unknown> {
  const values = findByPropertyPath(path, candidate, context);
  yield* unifyShape(valueShape, values, context);
}

function findByPropertyPath(
  path: ReadonlyArray<PropertyPathSegment>,
  candidate: Rdf.Iri | Rdf.Blank,
  context: UnificationContext
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

function *unifyUnion(
  shape: UnionShape,
  candidates: Iterable<Rdf.Node>,
  context: UnificationContext
): IterableIterator<unknown> {
  for (const variant of shape.variants) {
    const variantShape = context.resolveShape(variant);
    yield* unifyShape(variantShape, candidates, context);
  }
}

function *unifySet(
  shape: SetShape,
  candidates: Iterable<Rdf.Node>,
  context: UnificationContext
): IterableIterator<unknown[]> {
  const itemShape = context.resolveShape(shape.itemShape);
  yield Array.from(unifyShape(itemShape, candidates, context));
}

function *unifyOptional(
  shape: OptionalShape,
  candidates: Iterable<Rdf.Node>,
  context: UnificationContext
): IterableIterator<unknown> {
  let found = false;
  const valueShape = context.resolveShape(shape.valueShape);
  for (const value of unifyShape(valueShape, candidates, context)) {
    found = true;
    yield value;
  }
  if (!found) {
    yield shape.emptyValue;
  }
}

function *unifyNode(
  shape: NodeShape,
  candidates: Iterable<Rdf.Node>,
  context: UnificationContext
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

function *unifyList(
  shape: ListShape,
  candidates: Iterable<Rdf.Node>,
  context: UnificationContext
): IterableIterator<unknown[]> {
  const list: ListUnification = {
    origin: shape,
    template: [],
    head: shape.headPath || DEFAULT_LIST_HEAD,
    tail: shape.tailPath || DEFAULT_LIST_TAIL,
    item: context.resolveShape(shape.itemShape),
    nil: shape.nilShape ? context.resolveShape(shape.nilShape) : DEFAULT_LIST_NIL,
  };
  for (const candidate of filterResources(candidates)) {
    for (const final of unifyListItems(list, false, candidate, context)) {
      yield [...final];
    }
  }
}

interface ListUnification {
  readonly origin: ListShape;
  readonly template: unknown[];
  readonly head: ReadonlyArray<PropertyPathSegment>;
  readonly tail: ReadonlyArray<PropertyPathSegment>;
  readonly item: Shape;
  readonly nil: Shape;
}

function *unifyListItems(
  list: ListUnification,
  required: boolean,
  candidate: Rdf.Iri | Rdf.Blank,
  context: UnificationContext
): IterableIterator<unknown[]> {
  let foundNil = false;
  for (const nil of unifyShape(list.nil, [candidate], context)) {
    foundNil = true;
    yield list.template;
  }
  if (foundNil) {
    return;
  }

  let foundHead = false;
  for (const head of findByPropertyPath(list.head, candidate, context)) {
    foundHead = true;

    for (const item of unifyShape(list.item, [head], context)) {
      list.template.push(item);
      let foundTail = false;
      for (const tail of filterResources(findByPropertyPath(list.tail, candidate, context))) {
        foundTail = true;
        yield* unifyListItems(list, true, tail, context);
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

function makeNodeSet() {
  return new HashSet<Rdf.Node>(Rdf.hash, Rdf.equals);
}

function makeNodeMap<V>() {
  return new HashMap<Rdf.Node, V>(Rdf.hash, Rdf.equals);
}

function toTraceString(value: unknown) {
  return Array.isArray(value) ? `[length = ${value.length}]` :
    (typeof value === 'object' && value) ? `{keys: ${Object.keys(value)}}` :
    String(value);
}
