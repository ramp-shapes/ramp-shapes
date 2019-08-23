import * as Rdf from './rdf';
import {
  ShapeID, Shape, ObjectShape, ObjectProperty, PathSequence, UnionShape, SetShape,
  OptionalShape, ResourceShape, LiteralShape, ListShape, MapShape, isPathSegment,
} from './shapes';
import {
  SubjectMemo, makeShapeResolver, assertUnknownShape, resolveListShapeDefaults, matchesTerm, makeTermMap
} from './common';
import { RampError, ErrorCode, StackFrame, formatDisplayShape, formatShapeStack } from './errors';
import { ReferenceMatch, synthesizeShape } from './synthesize';
import { ValueMapper } from './value-mapping';

export interface FlattenParams {
  value: unknown;
  rootShape: ShapeID;
  shapes: ReadonlyArray<Shape>;
  mapper?: ValueMapper;
  unstable_generateBlankNode?: (prefix: string) => Rdf.BlankNode;
}

export function flatten(params: FlattenParams): Iterable<Rdf.Quad> {
  const generateBlankNode = params.unstable_generateBlankNode || makeDefaultBlankNodeGenerator();

  const context: LowerContext = {
    stack: [],
    mapper: params.mapper || ValueMapper.mapByDefault(),
    resolveShape: makeShapeResolver(params.shapes, shapeID => {
      throw context.makeError(
        ErrorCode.MissingShape,
        `Failed to resolve shape ${Rdf.toString(shapeID)}`
      );
    }),
    generateSubject: shape => generateBlankNode(shape.type),
    generateBlankNode,
    makeError: (code, message) => {
      const stackString = formatShapeStack(context.stack);
      const error = new Error(`RAMP${code}: ${message} at ${stackString}`) as RampError;
      error.rampErrorCode = code;
      error.rampStack = [...context.stack];
      return error;
    },
  };
  const rootShape = context.resolveShape(params.rootShape);
  const match = flattenShape(rootShape, true, params.value, {shape: rootShape}, context);
  if (!match) {
    const displyedShape = formatDisplayShape(rootShape);
    throw context.makeError(
      ErrorCode.ShapeMismatch,
      `Value does not match root shape ${displyedShape}`
    );
  }
  return match.generate(undefined);
}

type RdfNode = Rdf.NamedNode | Rdf.BlankNode | Rdf.Literal;

interface LowerContext {
  readonly stack: StackFrame[];
  readonly mapper: ValueMapper;
  resolveShape: (shapeID: ShapeID) => Shape;
  generateSubject: (shape: Shape) => Rdf.NamedNode | Rdf.BlankNode;
  generateBlankNode: (prefix: string) => Rdf.BlankNode;
  makeError(code: ErrorCode, message: string): RampError;
}

interface ShapeMatch {
  nodes: () => Iterable<RdfNode>;
  generate: (edge: Edge | undefined) => Iterable<Rdf.Quad>;
}

function flattenShape(
  shape: Shape,
  required: boolean,
  value: unknown,
  frame: StackFrame,
  context: LowerContext
): ShapeMatch | undefined {
  context.stack.push(frame);

  const converted = context.mapper.toRdf(value, shape);
  let match: ShapeMatch | undefined;
  switch (shape.type) {
    case 'object':
      match = flattenObject(shape, required, converted, context);
      break;
    case 'union':
      match = flattenUnion(shape, required, converted, context);
      break;
    case 'set':
      match = flattenSet(shape, required, converted, context);
      break;
    case 'optional':
      match = flattenOptional(shape, required, converted, context);
      break;
    case 'resource':
    case 'literal':
      match = flattenNode(shape, required, converted, context);
      break;
    case 'list':
      match = flattenList(shape, required, converted, context);
      break;
    case 'map':
      match = flattenMap(shape, required, converted, context);
      break;
    default:
      return assertUnknownShape(shape);
  }

  if (required && !match) {
    const displyedShape = formatDisplayShape(shape);
    throw context.makeError(
      ErrorCode.ShapeMismatch,
      `Value does not match ${displyedShape}: ${JSON.stringify(value)}`
    );
  }

  context.stack.pop();
  return match;
}

function flattenObject(
  shape: ObjectShape,
  required: boolean,
  value: unknown,
  context: LowerContext
): ShapeMatch | undefined {
  if (!isObjectWithProperties(value)) {
    return undefined;
  }

  const matches: Array<{ property: ObjectProperty; match: ShapeMatch }> = [];
  if (!matchProperties(shape.typeProperties, required, value, matches, context)) {
    return undefined;
  }
  if (!matchProperties(shape.properties, true, value, matches, context)) {
    if (shape.typeProperties) {
      throw new Error(
        `Invalid value for shape ${Rdf.toString(shape.id)}: failed to match properties.`
      );
    } else {
      return undefined;
    }
  }

  const memo = new SubjectMemo(shape);
  for (const {property, match} of matches) {
    if (isSelfProperty(property)) {
      for (const node of match.nodes()) {
        memo.set(node);
      }
    }
  }
  const subject = memo.resolve() || context.generateSubject(shape);

  function nodes(): Iterable<RdfNode> {
    return [subject];
  }

  function *generate(edge: Edge | undefined): Iterable<Rdf.Quad> {
    yield* generateEdge(edge, subject, context);
    for (const {property, match} of matches) {
      yield* match.generate({subject, path: property.path});
    }
  }

  return {nodes, generate};
}

function isObjectWithProperties(obj: unknown): obj is { [propertyName: string]: unknown } {
  return Boolean(typeof obj === 'object' && obj);
}

function matchProperties(
  properties: ReadonlyArray<ObjectProperty>,
  required: boolean,
  value: { [propertyName: string]: unknown },
  matches: Array<{ property: ObjectProperty; match: ShapeMatch }>,
  context: LowerContext
): boolean {
  for (const property of properties) {
    const propertyValue = value[property.name];
    const valueShape = context.resolveShape(property.valueShape);
    const frame: StackFrame = {shape: valueShape, edge: property.name};
    const match = flattenShape(valueShape, required, propertyValue, frame, context);
    if (match) {
      matches.push({property, match});
    } else if (required) {
      throw new Error(`Failed to match property "${property.name}"`);
    } else {
      return false;
    }
  }
  return true;
}

interface Edge {
  subject: Rdf.NamedNode | Rdf.BlankNode;
  path: PathSequence;
}

function generateEdge(
  edge: Edge | undefined,
  object: RdfNode,
  context: LowerContext
): Iterable<Rdf.Quad> {
  return edge ? generatePropertyPath(edge.subject, edge.path, object, context) : [];
}

function *generatePropertyPath(
  subject: RdfNode,
  path: PathSequence,
  object: RdfNode,
  context: LowerContext
): Iterable<Rdf.Quad> {
  if (path.length === 0) {
    return;
  }
  let s = subject;
  for (let i = 0; i < path.length; i++) {
    const o = i === path.length - 1
      ? object : context.generateBlankNode('path');
    const element = path[i];
    if (isPathSegment(element)) {
      if (s.termType === 'Literal') {
        throw new Error(
          `Cannot put literal ${Rdf.toString(s)} as subject with ` +
          `predicate ${Rdf.toString(element.predicate)}`
        );
      }
      yield Rdf.quad(s, element.predicate, o);
    } else {
      switch (element.operator) {
        case '|': {
          if (element.path.length > 0) {
            // take only the first alternative
            const alternative = element.path.slice(0, 1);
            yield* generatePropertyPath(s, alternative, o, context);
          }
          break;
        }
        case '^': {
          // switch subject and predicate
          yield* generatePropertyPath(o, element.path, s, context);
          break;
        }
        case '*':
        case '+':
        case '?': {
          // always generate a path with length === 1
          yield* generatePropertyPath(s, element.path, o, context);
          break;
        }
        case '!':
          // ignore negated paths (should we do anything else instead?)
          break;
      }
    }
    s = o;
  }
}

function isSelfProperty(property: ObjectProperty) {
  return property.path.length === 0;
}

function flattenUnion(
  shape: UnionShape,
  required: boolean,
  value: unknown,
  context: LowerContext
): ShapeMatch | undefined {
  for (const variant of shape.variants) {
    const variantShape = context.resolveShape(variant);
    const match = flattenShape(variantShape, false, value, {shape: variantShape}, context);
    if (match) {
      return match;
    }
  }

  if (required) {
    for (const variant of shape.variants) {
      const variantShape = context.resolveShape(variant);
      // try flatten with `required = true` to produce an error
      flattenShape(variantShape, true, value, {shape: variantShape}, context);
    }
  }

  return undefined;
}

function flattenSet(
  shape: SetShape,
  required: boolean,
  value: unknown,
  context: LowerContext
): ShapeMatch | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const itemShape = context.resolveShape(shape.itemShape);
  const frame: StackFrame = {shape: itemShape};
  const matches: ShapeMatch[] = [];
  for (const item of value) {
    const match = flattenShape(itemShape, required, item, frame, context);
    if (!match) {
      return undefined;
    }
    matches.push(match);
  }

  function *nodes(): Iterable<RdfNode> {
    for (const match of matches) {
      yield* match.nodes();
    }
  }

  function *generate(edge: Edge | undefined): Iterable<Rdf.Quad> {
    for (const match of matches) {
      yield* match.generate(edge);
    }
  }

  return {nodes, generate};
}

function flattenOptional(
  shape: OptionalShape,
  required: boolean,
  value: unknown,
  context: LowerContext
): ShapeMatch | undefined {
  const isEmpty = value === shape.emptyValue;

  const itemShape = context.resolveShape(shape.itemShape);
  const frame: StackFrame = {shape: itemShape};
  const match = isEmpty ? undefined : flattenShape(itemShape, required, value, frame, context);
  if (!isEmpty && !match) {
    return undefined;
  }

  function nodes(): Iterable<RdfNode> {
    return match ? match.nodes() : [];
  }

  function generate(edge: Edge | undefined): Iterable<Rdf.Quad> {
    return match ? match.generate(edge) : [];
  }

  return {nodes, generate};
}

function flattenNode(
  shape: ResourceShape | LiteralShape,
  required: boolean,
  value: unknown,
  context: LowerContext
): ShapeMatch | undefined {
  if (!(Rdf.looksLikeTerm(value) && matchesTerm(shape, value))) {
    return undefined;
  }
  const node = value as RdfNode;
  function nodes(): Iterable<RdfNode> {
    return [node];
  }
  function generate(edge: Edge | undefined): Iterable<Rdf.Quad> {
    return generateEdge(edge, node, context);
  }
  return {nodes, generate};
}

function flattenList(
  shape: ListShape,
  required: boolean,
  value: unknown,
  context: LowerContext
): ShapeMatch | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const {head, tail, nil} = resolveListShapeDefaults(shape);
  const itemShape = context.resolveShape(shape.itemShape);
  const frame: StackFrame = {shape: itemShape};

  const matches: ShapeMatch[] = [];
  for (const item of value) {
    const match = flattenShape(itemShape, required, item, frame, context);
    if (!match) {
      return undefined;
    }
    matches.push(match);
  }

  const list = matches.length === 0 ? nil : context.generateBlankNode('list');

  function *nodes(): Iterable<RdfNode> {
    yield list;
  }

  function *generate(edge: Edge | undefined): Iterable<Rdf.Quad> {
    yield* generateEdge(edge, list, context);
    let current = list;
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      yield* match.generate({subject: current, path: head});
      const next = i === matches.length - 1
        ? nil : context.generateBlankNode('list');
      yield* generatePropertyPath(current, tail, next, context);
      current = next;
    }
  }

  return {nodes, generate};
}

function flattenMap(
  shape: MapShape,
  required: boolean,
  value: unknown,
  context: LowerContext
) {
  if (typeof value !== 'object') {
    return undefined;
  }

  const itemShape = context.resolveShape(shape.itemShape);
  const frame: StackFrame = {shape: itemShape};

  const matches: ShapeMatch[] = [];
  for (const key in value) {
    if (!Object.hasOwnProperty.call(value, key)) { continue; }
    const valueAtKey = (value as { [key: string]: unknown })[key];

    let item = valueAtKey;
    if (shape.value) {
      const refs = makeTermMap<ReadonlyArray<ReferenceMatch>>();
      refs.set(shape.key.target, [
        {ref: shape.key, match: key},
        {ref: shape.value, match: valueAtKey},
      ]);
      item = synthesizeShape(itemShape, {
        matches: refs,
        resolveShape: context.resolveShape,
      });
    }

    const match = flattenShape(itemShape, required, item, frame, context);
    if (!match) {
      return undefined;
    }
    matches.push(match);
  }

  function *nodes() {
    for (const match of matches) {
      yield* match.nodes();
    }
  }

  function *generate(edge: Edge | undefined): Iterable<Rdf.Quad> {
    for (const match of matches) {
      yield* match.generate(edge);
    }
  }

  return {nodes, generate};
}

function makeDefaultBlankNodeGenerator() {
  const blankUniqueKey = Rdf.randomBlankNode('', 24).value;
  let blankIndex = 1;
  return (prefix: string) => {
    const index = blankIndex++;
    return Rdf.blankNode(`${prefix}_${blankUniqueKey}_${index}`);
  };
}
