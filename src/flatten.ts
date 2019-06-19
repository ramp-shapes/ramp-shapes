import * as Rdf from './rdf-model';
import {
  ShapeID, Shape, ObjectShape, ObjectProperty, PropertyPathSegment, UnionShape, SetShape,
  OptionalShape, ResourceShape, LiteralShape, ListShape, MapShape, ShapeReference,
} from './shapes';
import {
  SubjectMemo, makeShapeResolver, assertUnknownShape, resolveListShapeDefaults, matchesTerm, makeTermMap
} from './common';
import { ReferenceMatch, synthesizeShape } from './synthesize';
import { ValueMapper, looksLikeRdfNode } from './value-mapping';

export interface FlattenParams {
  value: unknown;
  rootShape: ShapeID;
  shapes: ReadonlyArray<Shape>;
  mapper?: ValueMapper;
}

export function flatten(params: FlattenParams): Iterable<Rdf.Quad> {
  const blankUniqueKey = Rdf.randomBlankNode('', 24).value;
  let blankIndex = 1;
  const generateBlankNode = (prefix: string) => {
    const index = blankIndex++;
    return Rdf.blankNode(`${prefix}_${blankUniqueKey}_${index}`);
  }

  const context: LowerContext = {
    mapper: params.mapper || ValueMapper.mapByDefault(),
    resolveShape: makeShapeResolver(params.shapes, shapeID => {
      throw new Error(
        `Failed to resolve shape ${Rdf.toString(shapeID)}`
      );
    }),
    generateSubject: shape => generateBlankNode(shape.type),
    generateBlankNode,
  };
  const rootShape = context.resolveShape(params.rootShape);
  const match = flattenShape(rootShape, params.value, context);
  if (!match) {
    throw new Error(`Failed to match root shape ${Rdf.toString(rootShape.id)}`);
  }
  return match.generate(undefined);
}

type RdfNode = Rdf.NamedNode | Rdf.BlankNode | Rdf.Literal;

interface LowerContext {
  readonly mapper: ValueMapper;
  resolveShape: (shapeID: ShapeID) => Shape;
  generateSubject: (shape: Shape) => Rdf.NamedNode | Rdf.BlankNode;
  generateBlankNode: (prefix: string) => Rdf.BlankNode;
}

interface ShapeMatch {
  nodes: () => Iterable<RdfNode>;
  generate: (edge: Edge | undefined) => Iterable<Rdf.Quad>;
}

function flattenShape(
  shape: Shape,
  value: unknown,
  context: LowerContext
): ShapeMatch | undefined {
  const converted = context.mapper.toRdf(value, shape);
  switch (shape.type) {
    case 'object':
      return flattenObject(shape, converted, context);
    case 'union':
      return flattenUnion(shape, converted, context);
    case 'set':
      return flattenSet(shape, converted, context);
    case 'optional':
      return flattenOptional(shape, converted, context);
    case 'resource':
    case 'literal':
      return flattenNode(shape, converted, context);
    case 'list':
      return flattenList(shape, converted, context);
    case 'map':
      return flattenMap(shape, converted, context);
    default:
      return assertUnknownShape(shape);
  }
}

function flattenObject(
  shape: ObjectShape,
  value: unknown,
  context: LowerContext
): ShapeMatch | undefined {
  if (!isObjectWithProperties(value)) {
    return undefined;
  }

  const matches: Array<{ property: ObjectProperty; match: ShapeMatch }> = [];
  const missing: Array<ObjectProperty> = [];
  if (!matchProperties(shape.typeProperties, value, matches, undefined, context)) {
    return undefined;
  }
  if (!matchProperties(shape.properties, value, matches, missing, context)) {
    if (shape.typeProperties) {
      throw new Error(
        `Invalid value for shape ${Rdf.toString(shape.id)}: ` +
        `failed to match properties: ${missing.map(p => `"${p.name}"`).join(', ')}.`
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
  value: { [propertyName: string]: unknown },
  matches: Array<{ property: ObjectProperty; match: ShapeMatch }>,
  missing: Array<ObjectProperty> | undefined,
  context: LowerContext
): boolean {
  for (const property of properties) {
    const propertyValue = value[property.name];
    const valueShape = context.resolveShape(property.valueShape);
    const match = flattenShape(valueShape, propertyValue, context);
    if (match) {
      matches.push({property, match});
    } else {
      if (missing) {
        missing.push(property);
      } else {
        return false;
      }
    }
  }
  return missing ? missing.length === 0 : true;
}

interface Edge {
  subject: Rdf.NamedNode | Rdf.BlankNode;
  path: ReadonlyArray<PropertyPathSegment>;
}

function generateEdge(
  edge: Edge | undefined,
  object: RdfNode,
  context: LowerContext
): Iterable<Rdf.Quad> {
  return edge ? generatePropertyPath(edge.subject, edge.path, object, context) : [];
}

function *generatePropertyPath(
  subject: Rdf.NamedNode | Rdf.BlankNode,
  path: ReadonlyArray<PropertyPathSegment>,
  object: RdfNode,
  context: LowerContext
): Iterable<Rdf.Quad> {
  if (path.length === 0) {
    return;
  }
  let s = subject;
  for (let i = 0; i < path.length - 1; i++) {
    const o = context.generateBlankNode('path');
    const {predicate, reverse} = path[i];
    yield reverse ? Rdf.quad(o, predicate, s) : Rdf.quad(s, predicate, o);
    s = o;
  }
  const last = path[path.length - 1];
  if (last.reverse) {
    if (object.termType === 'Literal') {
      throw new Error(
        `Cannot put literal ${object} as subject with predicate ${last.predicate}`
      );
    }
    yield Rdf.quad(object, last.predicate, s);
  } else {
    yield Rdf.quad(s, last.predicate, object);
  }
}

function isSelfProperty(property: ObjectProperty) {
  return property.path.length === 0;
}

function flattenUnion(
  shape: UnionShape,
  value: unknown,
  context: LowerContext
): ShapeMatch | undefined {
  for (const variant of shape.variants) {
    const variantShape = context.resolveShape(variant);
    const match = flattenShape(variantShape, value, context);
    if (match) {
      return match;
    }
  }
  return undefined;
}

function flattenSet(
  shape: SetShape,
  value: unknown,
  context: LowerContext
): ShapeMatch | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const itemShape = context.resolveShape(shape.itemShape);
  const matches: ShapeMatch[] = [];
  for (const item of value) {
    const match = flattenShape(itemShape, item, context);
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
  value: unknown,
  context: LowerContext
): ShapeMatch | undefined {
  const isEmpty = value === shape.emptyValue;

  const itemShape = context.resolveShape(shape.itemShape);
  const match = isEmpty ? undefined : flattenShape(itemShape, value, context);
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
  value: unknown,
  context: LowerContext
): ShapeMatch | undefined {
  if (!(looksLikeRdfNode(value) && matchesTerm(shape, value))) {
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
  value: unknown,
  context: LowerContext
): ShapeMatch | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const {head, tail, nil} = resolveListShapeDefaults(shape);
  const itemShape = context.resolveShape(shape.itemShape);

  const matches: ShapeMatch[] = [];
  for (const item of value) {
    const match = flattenShape(itemShape, item, context);
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
  value: unknown,
  context: LowerContext
) {
  if (typeof value !== 'object') {
    return undefined;
  }

  const itemShape = context.resolveShape(shape.itemShape);

  const matches: ShapeMatch[] = [];
  for (const key in value) {
    if (!Object.hasOwnProperty.call(value, key)) { continue; }
    const valueAtKey = (value as { [key: string]: unknown })[key];

    let item = valueAtKey;
    if (shape.value) {
      const matches = makeTermMap<ReadonlyArray<ReferenceMatch>>();
      matches.set(shape.key.target, [
        {ref: shape.key, match: key},
        {ref: shape.value, match: valueAtKey},
      ]);
      item = synthesizeShape(itemShape, {
        matches,
        resolveShape: context.resolveShape,
      });
    }

    const match = flattenShape(itemShape, item, context);
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
