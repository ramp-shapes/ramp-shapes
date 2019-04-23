import { HashMap, ReadonlyHashMap } from './hash-map';
import * as Rdf from './rdf-model';
import {
  ShapeID, Shape, ObjectShape, ObjectProperty, PropertyPathSegment, UnionShape, SetShape,
  OptionalShape, ResourceShape, LiteralShape, ListShape, MapShape, ShapeReference
} from './shapes';
import {
  makeTermMap, makeTermSet, makeShapeResolver, assertUnknownShape,
  resolveListShapeDefaults, matchesTerm
} from './common';
import { tryConvertToNativeType } from './type-conversion';

export interface FramingParams {
  rootShape: ShapeID;
  shapes: ReadonlyArray<Shape>;
  triples: ReadonlyArray<Rdf.Quad>;
  frameType?: FrameTypeHandler;
}

export interface FrameTypeHandler {
  (shape: Shape, value: unknown): unknown;
}
export namespace FrameTypeHandler {
  export const identity: FrameTypeHandler = (shape, value) => value;
  export const convertToNativeType: FrameTypeHandler = (shape, value) => {
    return (shape.type === 'resource' || shape.type === 'literal')
        ? tryConvertToNativeType(shape, value as Rdf.Term)
        : value;
  }
}

export interface FramingSolution {
  readonly value: unknown;
  readonly vars: ReadonlyHashMap<ShapeID, unknown>;
}

export function *frame(params: FramingParams): IterableIterator<FramingSolution> {
  const keys = makeTermMap<unknown>() as HashMap<ShapeID, MapKeyContext>;

  const context: FramingContext = {
    triples: params.triples,
    vars: makeTermMap<unknown>() as HashMap<ShapeID, unknown>,
    keys,
    resolveShape: makeShapeResolver(params.shapes, shapeID => {
      throw new Error(
        `Failed to resolve shape ${Rdf.toString(shapeID)} at ` +
        formatShapeStack(context)
      );
    }),
    frameType: params.frameType || FrameTypeHandler.convertToNativeType,
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
  readonly triples: ReadonlyArray<Rdf.Quad>;
  readonly vars: HashMap<ShapeID, unknown>;
  readonly keys: HashMap<ShapeID, MapKeyContext>;
  resolveShape(shapeID: ShapeID): Shape;
  frameType(shape: Shape, value: unknown): unknown;
}

interface MapKeyContext {
  map: ShapeID;
  reference: ShapeReference;
  match?: unknown;
}

function *frameShape(
  shape: Shape,
  candidates: Iterable<Rdf.Term>,
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
    const keyContext = context.keys.get(shape.id);
    if (keyContext) {
      keyContext.match = frameKey(keyContext, shape, value);
    }
    const typed = context.frameType(shape, value);
    context.vars.set(shape.id, typed);

    yield typed;

    if (keyContext) {
      keyContext.match = undefined;
    }
    context.vars.delete(shape.id);
  }
}

function *frameObject(
  shape: ObjectShape,
  candidates: Iterable<Rdf.Term>,
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
          `Invalid subject ${Rdf.toString(candidate)} for shape ${Rdf.toString(shape.id)}: ` +
          `failed to match properties: ${missing.map(p => `"${p.name}"`).join(', ')} at ` +
          formatShapeStack(context)
        );
      }
    }
  }
}

function *frameProperties(
  properties: ReadonlyArray<ObjectProperty>,
  template: { [fieldName: string]: unknown },
  candidate: Rdf.NamedNode | Rdf.BlankNode,
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
  candidate: Rdf.NamedNode | Rdf.BlankNode,
  context: FramingContext
): Iterable<unknown> {
  const values = findByPropertyPath(path, candidate, context);
  yield* frameShape(valueShape, values, context);
}

function findByPropertyPath(
  path: ReadonlyArray<PropertyPathSegment>,
  candidate: Rdf.NamedNode | Rdf.BlankNode,
  context: FramingContext
): Iterable<Rdf.Term> {
  if (path.length === 0) {
    return [candidate];
  }

  let current = makeTermSet();
  let next = makeTermSet();
  current.add(candidate);

  for (const segment of path) {
    for (const {subject: s, predicate: p, object: o} of context.triples) {
      if (!Rdf.equals(p, segment.predicate)) {
        continue;
      }
      let source: Rdf.Term = s;
      let target: Rdf.Term = o;
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
  candidates: Iterable<Rdf.Term>,
  context: FramingContext
): Iterable<unknown> {
  for (const variant of shape.variants) {
    const variantShape = context.resolveShape(variant);
    yield* frameShape(variantShape, candidates, context);
  }
}

function *frameSet(
  shape: SetShape,
  candidates: Iterable<Rdf.Term>,
  context: FramingContext
): Iterable<unknown[]> {
  const itemShape = context.resolveShape(shape.itemShape);
  yield Array.from(frameShape(itemShape, candidates, context));
}

function *frameOptional(
  shape: OptionalShape,
  candidates: Iterable<Rdf.Term>,
  context: FramingContext
): Iterable<unknown> {
  let found = false;
  const itemShape = context.resolveShape(shape.itemShape);
  for (const value of frameShape(itemShape, candidates, context)) {
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
  context: FramingContext
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
  readonly nil: Rdf.NamedNode;
}

function *frameListItems(
  list: ListFraming,
  required: boolean,
  candidate: Rdf.NamedNode | Rdf.BlankNode,
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
          `for subject ${Rdf.toString(candidate)} at ` + formatShapeStack(context)
        );
      }
      list.template.pop();
    }
  }
  if (required && !foundHead) {
    throw new Error(
      `Missing head or nil for list ${Rdf.toString(list.origin.id)} ` +
      `for subject ${Rdf.toString(candidate)} at ` + formatShapeStack(context)
    );
  }
}

function *frameMap(
  shape: MapShape,
  candidates: Iterable<Rdf.Term>,
  context: FramingContext
): Iterable<{ [key: string]: unknown }> {
  const result: { [key: string]: unknown } = {};

  let keyContext: MapKeyContext = {map: shape.id, reference: shape.key};
  context.keys.set(shape.key.target, keyContext);

  const itemShape = context.resolveShape(shape.itemShape);
  for (const item of frameShape(itemShape, candidates, context)) {
    const key = keyContext.match;
    if (key) {
      if (typeof key === 'string' || typeof key === 'number' || typeof key === 'boolean') {
        result[key.toString()] = item;
      } else {
        throw new Error(
          `Cannot use non-primitive value as a key of map ${Rdf.toString(shape.id)}: ` +
          `(${typeof key}) ${key} at ` + formatShapeStack(context)
        );
      }
    }
  }

  context.keys.delete(shape.key.target);
  yield result;
}

function frameKey(keyContext: MapKeyContext, shape: Shape, value: unknown): unknown {
  const {reference} = keyContext;
  switch (reference.part) {
    case 'value':
      if (shape.type === 'resource' || shape.type === 'literal') {
        return (value as Rdf.NamedNode | Rdf.BlankNode | Rdf.Literal).value;
      } else {
        throw new Error(
          `Framing term value as map key allowed only for resource or literal shapes: ` +
          `map is ${keyContext.map}, key is ${keyContext.reference.target}`
        );
      }
    case 'datatype':
    case 'language':
      if (shape.type === 'literal') {
        const literal = value as Rdf.Literal;
        return reference.part === 'datatype' ? literal.datatype : literal.language;
      } else {
        throw new Error(
          `Framing term datatype or language as map key allowed only for literal shapes: ` +
          `map is ${keyContext.map}, key is ${keyContext.reference.target}`
        );
      }
    default:
      return value;
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

function formatShapeStack(context: FramingContext) {
  // TODO implement
  // return context.stack.map(s => `${s.type} ${Rdf.toString(s.id)}`).join(' |> ');
  return '<framing stack (not implemented yet)>';
}

function toTraceString(value: unknown) {
  return Array.isArray(value) ? `[length = ${value.length}]` :
    (typeof value === 'object' && value) ? `{keys: ${Object.keys(value)}}` :
    String(value);
}
