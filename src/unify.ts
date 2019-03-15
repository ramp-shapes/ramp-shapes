import { HashMap, HashSet, ReadonlyHashMap, ReadonlyHashSet } from './hash-map';
import * as Rdf from './rdf-model';
import {
  ShapeID, Shape, ObjectShape, ObjectField, UnionShape, SetShape, OptionalShape, NodeShape
} from './shapes';

export interface UnificationSolution {
  readonly value: unknown;
  readonly vars: ReadonlyHashMap<ShapeID, unknown>;
}

export function *unifyTriplesToJson(params: {
  rootShape: ShapeID,
  shapes: ReadonlyArray<Shape>,
  triples: ReadonlyArray<Rdf.Triple>,
  trace?: boolean,
}): IterableIterator<UnificationSolution> {
  const contextShapes = makeNodeMap<Shape>();
  for (const shape of params.shapes) {
    contextShapes.set(shape.id, shape);
  }

  let level = 0;
  const trace = (...args: unknown[]) => {
    if (params.trace) {
      console.log('  '.repeat(level), ...args);
    }
  };

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
    traceOpen: (...args) => {
      trace(...args);
      level++;
    },
    traceClose: (...args) => {
      level--;
      trace(...args);
    }
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
  traceOpen(...args: unknown[]): void;
  traceClose(...args: unknown[]): void;
}

function *unifyShape(
  shape: Shape,
  candidates: ReadonlyHashSet<Rdf.Node>,
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
    default:
      throw new Error(`Unknown shape type ${(shape as Shape).type}`);
  }
}

function *unifyObject(
  shape: ObjectShape,
  candidates: ReadonlyHashSet<Rdf.Node>,
  context: UnificationContext
): IterableIterator<unknown> {
  for (const candidate of filterResources(candidates)) {
    if (context.enableTrace) {
      context.traceOpen('object', Rdf.toString(shape.id), candidate.value);
    }
    for (const partial of unifyFields(shape.typeFields, {}, candidate, context)) {
      let foundObject = false;
      for (const final of unifyFields(shape.otherFields, partial, candidate, context)) {
        foundObject = true;
        yield {...final};
      }
      if (shape.typeFields.length > 0 && !foundObject) {
        throw new Error(`Invalid entity ${Rdf.toString(candidate)} for shape ${Rdf.toString(shape.id)}`);
      }
    }
    if (context.enableTrace) {
      context.traceClose('/object', Rdf.toString(shape.id), candidate.value);
    }
  }
}

function *unifyFields(
  fields: ReadonlyArray<ObjectField>,
  template: { [fieldName: string]: unknown },
  candidate: Rdf.Iri | Rdf.Blank,
  context: UnificationContext
): IterableIterator<{ [fieldName: string]: unknown }> {
  if (fields.length === 0) {
    yield template;
    return;
  }
  const [field, ...otherFields] = fields;
  for (const value of unifyField(field, candidate, context)) {
    template[field.fieldName] = value;
    if (context.enableTrace) {
      context.trace(`field "${field.fieldName}" ->`, (
        Array.isArray(value) ? `[length = ${value.length}]` :
        (typeof value === 'object' && value) ? `{keys: ${Object.keys(value)}}` :
        String(value)
      ));
    }
    yield* unifyFields(otherFields, template, candidate, context);
    delete template[field.fieldName];
  }
}

function *unifyField(
  field: ObjectField,
  candidate: Rdf.Iri | Rdf.Blank,
  context: UnificationContext
): IterableIterator<unknown> {
  const targets = context.triples.reduce((acc: HashSet<Rdf.Node>, {s, p, o}: Rdf.Triple) => {
    if (!Rdf.equals(field.predicate, p)) {
      return acc;
    }
    let source: Rdf.Node;
    let target: Rdf.Node;
    if (field.direction === 'to-object') {
      source = s;
      target = o;
    } else {
      source = o;
      target = s;
    }
    if (Rdf.equals(candidate, source)) {
      acc.add(target);
    }
    return acc;
  }, makeNodeSet());

  const valueShape = context.resolveShape(field.valueShape);
  yield* unifyShape(valueShape, targets, context);
}

function *unifyUnion(
  shape: UnionShape,
  candidates: ReadonlyHashSet<Rdf.Node>,
  context: UnificationContext
): IterableIterator<unknown> {
  if (context.enableTrace) {
    context.traceOpen('union', Rdf.toString(shape.id));
  }
  for (const variant of shape.variants) {
    const variantShape = context.resolveShape(variant);
    yield* unifyShape(variantShape, candidates, context);
  }
  if (context.enableTrace) {
    context.traceClose('/union', Rdf.toString(shape.id));
  }
}

function *unifySet(
  shape: SetShape,
  candidates: ReadonlyHashSet<Rdf.Node>,
  context: UnificationContext
): IterableIterator<unknown> {
  const itemShape = context.resolveShape(shape.itemShape);
  if (context.enableTrace) {
    context.traceOpen('set', Rdf.toString(shape.id));
  }
  yield Array.from(unifyShape(itemShape, candidates, context));
  if (context.enableTrace) {
    context.traceClose('/set', Rdf.toString(shape.id));
  }
}

function *unifyOptional(
  shape: OptionalShape,
  candidates: ReadonlyHashSet<Rdf.Node>,
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
  candidates: ReadonlyHashSet<Rdf.Node>,
  context: UnificationContext
): IterableIterator<unknown> {
  for (const candidate of candidates) {
    if (!shape.value) {
      if (context.enableTrace) {
        context.trace('node (any) ->', Rdf.toString(candidate));
      }
      context.vars.set(shape.id, candidate);
      yield candidate;
      context.vars.delete(shape.id);
    } else if (Rdf.equals(candidate, shape.value)) {
      if (context.enableTrace) {
        context.trace('node (constant) ->', Rdf.toString(candidate));
      }
      yield candidate;
    }
  }
}

function *filterResources(nodes: ReadonlyHashSet<Rdf.Node>) {
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
