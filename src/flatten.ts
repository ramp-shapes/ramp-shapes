import * as Rdf from './rdf-model';
import {
  ShapeID, Shape, ObjectShape, ObjectProperty, PropertyPathSegment, UnionShape, SetShape,
  OptionalShape, ResourceShape, LiteralShape, ListShape, MapShape,
} from './shapes';
import {
  makeShapeResolver, assertUnknownShape, resolveListShapeDefaults, matchesTerm
} from './common';
import { tryConvertFromNativeType } from './type-conversion';

export interface FlattenParams {
  value: unknown;
  rootShape: ShapeID;
  shapes: ReadonlyArray<Shape>;
}

export function flatten(params: FlattenParams): Iterable<Rdf.Quad> {
  const context: FlattenContext = {
    resolveShape: makeShapeResolver(params.shapes),
    generateSubject: shape => {
      return Rdf.randomBlankNode(shape.type, 48);
    },
    generateBlankNode: prefix => {
      return Rdf.randomBlankNode(prefix, 48);
    },
    flattenType: (shape, value) => {
      return (shape.type === 'resource' || shape.type === 'literal')
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

type RdfNode = Rdf.NamedNode | Rdf.BlankNode | Rdf.Literal;

interface FlattenContext {
  resolveShape: (shapeID: ShapeID) => Shape;
  generateSubject: (shape: Shape) => Rdf.NamedNode | Rdf.BlankNode;
  generateBlankNode: (prefix: string) => Rdf.BlankNode;
  flattenType: (shape: Shape, value: unknown) => unknown;
}

interface ShapeMatch {
  nodes: () => Iterable<RdfNode>;
  generate: (edge: Edge | undefined) => Iterable<Rdf.Quad>;
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
  context: FlattenContext
): ShapeMatch | undefined {
  if (!(typeof value === 'object' && value)) {
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
  const subject = memo.resolve(context);

  function *nodes(): Iterable<RdfNode> {
    yield subject;
  }

  function *generate(edge: Edge | undefined): Iterable<Rdf.Quad> {
    yield* flattenEdge(edge, subject, context);
    for (const {property, match} of matches) {
      yield* match.generate({subject, path: property.path});
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
  subject: Rdf.NamedNode | Rdf.BlankNode;
  path: ReadonlyArray<PropertyPathSegment>;
}

function flattenEdge(
  edge: Edge | undefined,
  object: RdfNode,
  context: FlattenContext
): Iterable<Rdf.Quad> {
  return edge ? flattenPropertyPath(edge.subject, edge.path, object, context) : [];
}

function *flattenPropertyPath(
  subject: Rdf.NamedNode | Rdf.BlankNode,
  path: ReadonlyArray<PropertyPathSegment>,
  object: RdfNode,
  context: FlattenContext
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
  context: FlattenContext
): ShapeMatch | undefined {
  const isEmpty = value === shape.emptyValue;

  const valueShape = context.resolveShape(shape.valueShape);
  const match = isEmpty ? undefined : flattenShape(valueShape, value, context);
  if (!isEmpty && !match) {
    return undefined;
  }

  function *nodes(): Iterable<RdfNode> {
    if (match) {
      yield* match.nodes();
    }
  }

  function *generate(edge: Edge | undefined): Iterable<Rdf.Quad> {
    if (match) {
      yield* match.generate(edge);
    }
  }

  return {nodes, generate};
}

function flattenNode(
  shape: ResourceShape | LiteralShape,
  value: unknown,
  context: FlattenContext
): ShapeMatch | undefined {
  if (!(looksLikeRdfNode(value) && matchesTerm(shape, value))) {
    return undefined;
  }
  const node = value as RdfNode;
  function *nodes(): Iterable<RdfNode> {
    yield node;
  }
  function *generate(edge: Edge | undefined): Iterable<Rdf.Quad> {
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
    yield* flattenEdge(edge, list, context);
    let current = list;
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      yield* match.generate({subject: current, path: head});
      const next = i === matches.length - 1
        ? nil : context.generateBlankNode('list');
      yield* flattenPropertyPath(current, tail, next, context);
      current = next;
    }
  }

  return {nodes, generate};
}

function flattenMap(
  shape: MapShape,
  value: unknown,
  context: FlattenContext
) {
  if (typeof value !== 'object') {
    return undefined;
  }

  const itemShape = context.resolveShape(shape.itemShape);

  const matches: ShapeMatch[] = [];
  for (const key in value) {
    if (!Object.hasOwnProperty.call(value, key)) { continue; }
    const item = (value as { [key: string]: unknown })[key];
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

class SubjectMemo {
  private iri: Rdf.NamedNode | undefined;
  private lastBlank: Rdf.BlankNode | undefined;

  constructor(private shape: Shape) {}

  set(node: Rdf.Term) {
    if (node.termType === 'NamedNode') {
      if (this.iri) {
        throw new Error(
          `Inconsistent self reference for object shape ${Rdf.toString(this.shape.id)}`
        );
      }
      this.iri = node;
    } else if (node.termType === 'BlankNode') {
      this.lastBlank = node;
    }
  }

  resolve(context: FlattenContext) {
    return this.iri || this.lastBlank || context.generateSubject(this.shape);
  }
}

function looksLikeRdfNode(value: unknown): value is Rdf.Term {
  if (!(typeof value === 'object' && value && 'termType' in value)) {
    return false;
  }
  const {termType} = value as Rdf.Term;
  return termType === 'NamedNode' || termType === 'BlankNode' || termType === 'Literal';
}
