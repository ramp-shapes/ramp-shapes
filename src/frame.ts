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
        `Failed to resolve shape ${Rdf.toString(shapeID)}`
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
  for (const value of frameShape(rootShape, allCandidates, undefined, context)) {
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

interface MapKeyContext {
  map: ShapeID;
  reference: ShapeReference;
  match?: unknown;
}

function *frameShape(
  shape: Shape,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame | undefined,
  context: FramingContext
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
    const keyContext = context.keys.get(shape.id);
    if (keyContext) {
      keyContext.match = frameKey(keyContext, shape, value, nextStack);
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
  stack: StackFrame,
  context: FramingContext
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
  context: FramingContext
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
  context: FramingContext
): Iterable<unknown> {
  const values = findByPropertyPath(property.path, candidate, context);
  const nextStack = new StackFrame(stack, valueShape, property);
  yield* frameShape(valueShape, values, nextStack, context);
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
  stack: StackFrame,
  context: FramingContext
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
  context: FramingContext
): Iterable<unknown[]> {
  const itemShape = context.resolveShape(shape.itemShape);
  yield Array.from(frameShape(itemShape, candidates, stack, context));
}

function *frameOptional(
  shape: OptionalShape,
  candidates: Iterable<Rdf.Term>,
  stack: StackFrame,
  context: FramingContext
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
  stack: StackFrame,
  context: FramingContext
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
  context: FramingContext
): Iterable<{ [key: string]: unknown }> {
  const result: { [key: string]: unknown } = {};

  let keyContext: MapKeyContext = {map: shape.id, reference: shape.key};
  context.keys.set(shape.key.target, keyContext);

  const itemShape = context.resolveShape(shape.itemShape);
  for (const item of frameShape(itemShape, candidates, stack, context)) {
    const key = keyContext.match;
    if (key) {
      if (typeof key === 'string' || typeof key === 'number' || typeof key === 'boolean') {
        result[key.toString()] = item;
      } else {
        throw new Error(
          `Cannot use non-primitive value as a key of map ${Rdf.toString(shape.id)}: ` +
          `(${typeof key}) ${key} at ` + formatShapeStack(stack)
        );
      }
    }
  }

  context.keys.delete(shape.key.target);
  yield result;
}

function frameKey(keyContext: MapKeyContext, shape: Shape, value: unknown, stack: StackFrame): unknown {
  const {reference} = keyContext;
  switch (reference.part) {
    case 'value':
      if (shape.type === 'resource' || shape.type === 'literal') {
        return (value as Rdf.NamedNode | Rdf.BlankNode | Rdf.Literal).value;
      } else {
        throw new Error(
          `Framing term value as map key allowed only for resource or literal shapes: ` +
          `map is ${keyContext.map}, key is ${keyContext.reference.target} at ` +
          formatShapeStack(stack)
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
          `map is ${keyContext.map}, key is ${keyContext.reference.target} at ` +
          formatShapeStack(stack)
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

function toTraceString(value: unknown) {
  return Array.isArray(value) ? `[length = ${value.length}]` :
    (typeof value === 'object' && value) ? `{keys: ${Object.keys(value)}}` :
    String(value);
}
