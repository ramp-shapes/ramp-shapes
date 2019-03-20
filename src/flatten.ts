import { makeShapeResolver, randomBlankNode, assertUnknownShape } from './common';
import * as Rdf from './rdf-model';
import {
  ShapeID, Shape, ObjectShape, ObjectProperty, UnionShape, SetShape,
  OptionalShape, NodeShape, ListShape,
} from './shapes';
import { tryConvertFromNativeType } from './type-conversion';
import { doesNodeMatch } from './frame';

export interface FlattenParams {
  value: unknown;
  rootShape: ShapeID;
  shapes: ReadonlyArray<Shape>;
}

export function flatten(params: FlattenParams): Iterable<Rdf.Triple> {
  const context: FlattenContext = {
    resolveShape: makeShapeResolver(params.shapes),
    generateBlankNode: prefix => {
      return randomBlankNode(prefix, 48);
    },
    flattenType: (shape, value) => {
      return shape.type === 'node'
        ? tryConvertFromNativeType(shape, value)
        : value;
    }
  };
  const rootShape = context.resolveShape(params.rootShape);
  const match = flattenShape(rootShape, params.value, context);
  if (!match) {
    throw new Error(`Failed to match root shape ${Rdf.toString(rootShape.id)}`);
  }
  return match.generate(undefined);
}

interface FlattenContext {
  resolveShape: (shapeID: ShapeID) => Shape;
  generateBlankNode: (prefix: string) => Rdf.Blank;
  flattenType: (shape: Shape, value: unknown) => unknown;
}

interface ShapeMatch {
  nodes: () => Iterable<Rdf.Node>;
  generate: (edge: Edge | undefined) => Iterable<Rdf.Triple>;
}

function flattenShape(
  shape: Shape,
  value: unknown,
  context: FlattenContext
): ShapeMatch | undefined {
  const converted = context.flattenType(shape, value);
  switch (shape.type) {
    case 'object':
      return flattenObject(shape, converted, context);
    case 'union':
      return flattenUnion(shape, converted, context);
    case 'set':
      return flattenSet(shape, converted, context);
    case 'optional':
      return flattenOptional(shape, converted, context);
    case 'node':
      return flattenNode(shape, converted, context);
    case 'list':
      return flattenList(shape, converted, context);
    default:
      return assertUnknownShape(shape);
  }
}

function flattenObject(
  shape: ObjectShape,
  value: unknown,
  context: FlattenContext
): ShapeMatch | undefined {
  if (!(typeof value === 'object' && value)) {
    return undefined;
  }

  const matches: Array<{ property: ObjectProperty; match: ShapeMatch }> = [];
  const missing: Array<ObjectProperty> = [];
  if (!matchProperties(shape.typeProperties, value, matches, missing, context)) {
    return undefined;
  }
  if (!matchProperties(shape.properties, value, matches, undefined, context)) {
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
  const subject = memo.resolve(context);

  function *nodes(): Iterable<Rdf.Node> {
    yield subject;
  }

  function *generate(edge: Edge | undefined): Iterable<Rdf.Triple> {
    yield* flattenEdge(edge, subject, context);
    for (const {property, match} of matches) {
      yield* match.generate({subject, property});
    }
  }

  return {nodes, generate};
}

function matchProperties(
  properties: ReadonlyArray<ObjectProperty>,
  value: { [propertyName: string]: unknown },
  matches: Array<{ property: ObjectProperty; match: ShapeMatch }>,
  missing: Array<ObjectProperty> | undefined,
  context: FlattenContext
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
  subject: Rdf.Iri | Rdf.Blank;
  property: ObjectProperty;
}

function *flattenEdge(
  edge: Edge | undefined,
  object: Rdf.Node,
  context: FlattenContext
): Iterable<Rdf.Triple> {
  if (!edge || edge.property.path.length === 0) {
    return;
  }
  const path = edge.property.path;
  let s = edge.subject;
  for (let i = 0; i < path.length - 1; i++) {
    const o = context.generateBlankNode('path');
    const {predicate, reverse} = path[i];
    yield reverse ? Rdf.triple(o, predicate, s) : Rdf.triple(s, predicate, o);
    s = o;
  }
  const last = path[path.length - 1];
  yield last.reverse
    ? Rdf.triple(object, last.predicate, s)
    : Rdf.triple(s, last.predicate, object);
}

function isSelfProperty(property: ObjectProperty) {
  return property.path.length === 0;
}

function flattenUnion(
  shape: UnionShape,
  value: unknown,
  context: FlattenContext
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
  context: FlattenContext
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

  function *nodes(): Iterable<Rdf.Node> {
    for (const match of matches) {
      yield* match.nodes();
    }
  }

  function *generate(edge: Edge | undefined): Iterable<Rdf.Triple> {
    for (const match of matches) {
      yield* match.generate(edge);
    }
  }

  return {nodes, generate};
}

function flattenOptional(
  shape: OptionalShape,
  value: unknown,
  context: FlattenContext
): ShapeMatch | undefined {
  const isEmpty = value === shape.emptyValue;

  const valueShape = context.resolveShape(shape.valueShape);
  const match = isEmpty ? undefined : flattenShape(valueShape, value, context);
  if (!isEmpty && !match) {
    return undefined;
  }

  function *nodes(): Iterable<Rdf.Node> {
    if (match) {
      yield* match.nodes();
    }
  }

  function *generate(edge: Edge | undefined): Iterable<Rdf.Triple> {
    if (match) {
      yield* match.generate(edge);
    }
  }

  return {nodes, generate};
}

function flattenNode(
  shape: NodeShape,
  value: unknown,
  context: FlattenContext
): ShapeMatch | undefined {
  if (!(looksLikeRdfNode(value) && doesNodeMatch(shape, value))) {
    return undefined;
  }
  const node = value;
  function *nodes(): Iterable<Rdf.Node> {
    yield node;
  }
  function *generate(edge: Edge | undefined): Iterable<Rdf.Triple> {
    yield* flattenEdge(edge, node, context);
  }
  return {nodes, generate};
}

function flattenList(
  shape: ListShape,
  value: unknown,
  context: FlattenContext
): ShapeMatch | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  // TODO: implement
  throw new Error('List flattening not implemented yet');
}

class SubjectMemo {
  private iri: Rdf.Iri | undefined;
  private lastBlank: Rdf.Blank | undefined;

  constructor(private shape: Shape) {}

  set(node: Rdf.Node) {
    if (node.type === 'uri') {
      if (this.iri) {
        throw new Error(
          `Inconsistent self reference for object shape ${Rdf.toString(this.shape.id)}`
        );
      }
      this.iri = node;
    } else if (node.type === 'bnode') {
      this.lastBlank = node;
    }
  }

  resolve(context: FlattenContext) {
    return this.iri || this.lastBlank || context.generateBlankNode(this.shape.type);
  }
}

function looksLikeRdfNode(value: unknown): value is Rdf.Node {
  if (!(typeof value === 'object' && value && 'type' in value)) {
    return false;
  }
  const {type} = value as any;
  return type === 'uri' || type === 'bnode' || type === 'literal';
}
