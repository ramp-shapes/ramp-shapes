import { HashMap, HashSet, ReadonlyHashMap, ReadonlyHashSet } from './hash-map';
import * as Rdf from './rdf-model';
import {
  ShapeID, Shape, ObjectShape, ObjectProperty, PropertyPathSegment, UnionShape, SetShape,
  OptionalShape, NodeShape, ListShape
} from './shapes';

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
  enableTrace: boolean;
  trace(...args: unknown[]): void;
}

function *unifyShape(
  shape: Shape,
  candidates: Iterable<Rdf.Node>,
  context: UnificationContext
): IterableIterator<unknown> {
  switch (shape.type) {
    case 'object':
      yield* unifyObject(shape, candidates, context);
      break;
    case 'union':
      yield* unifyUnion(shape, candidates, context);
      break;
    case 'set':
      yield* unifySet(shape, candidates, context);
      break;
    case 'optional':
      yield* unifyOptional(shape, candidates, context);
      break;
    case 'node':
      yield* unifyNode(shape, candidates, context);
      break;
    case 'list':
      yield* unifyList(shape, candidates, context);
      break;
    default:
      throw new Error(`Unknown shape type ${(shape as Shape).type}`);
  }
}

function *unifyObject(
  shape: ObjectShape,
  candidates: Iterable<Rdf.Node>,
  context: UnificationContext
): IterableIterator<unknown> {
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
): IterableIterator<unknown> {
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
): IterableIterator<unknown> {
  for (const candidate of candidates) {
    if (!shape.value) {
      context.vars.set(shape.id, candidate);
      yield candidate;
      context.vars.delete(shape.id);
    } else if (Rdf.equals(candidate, shape.value)) {
      yield candidate;
    }
  }
}

const RDF_NAMESPACE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const DEFAULT_LIST_HEAD: ReadonlyArray<PropertyPathSegment> =
  [{predicate: Rdf.iri(RDF_NAMESPACE + 'first'), reverse: false}];
const DEFAULT_LIST_TAIL: ReadonlyArray<PropertyPathSegment> =
  [{predicate: Rdf.iri(RDF_NAMESPACE + 'rest'), reverse: false}];
const DEFAULT_LIST_NIL: NodeShape = {
  type: 'node',
  id: Rdf.iri(RDF_NAMESPACE + 'nil'),
  value: Rdf.iri(RDF_NAMESPACE + 'nil'),
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
