import { makeNodeSet, makeShapeResolver, randomBlankNode, assertUnknownShape } from './common';
import { HashSet } from './hash-map';
import * as Rdf from './rdf-model';
import {
  ShapeID, Shape, ObjectShape, ObjectProperty, NodeShape
} from './shapes';

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
      return value;
    }
  };
  const rootShape = context.resolveShape(params.rootShape);
  const match = flattenShape(rootShape, params.value, context);
  return generateFromMatch(match, match.node);
}

interface FlattenContext {
  resolveShape: (shapeID: ShapeID) => Shape;
  generateBlankNode: (prefix: string) => Rdf.Blank;
  flattenType: (shape: Shape, value: unknown) => unknown;
}

interface ShapeMatch {
  node: Rdf.Node;
  generate?: (node: Rdf.Node) => Iterable<Rdf.Triple>;
}

function flattenShape(
  shape: Shape,
  value: unknown,
  context: FlattenContext
): ShapeMatch {
  const converted = context.flattenType(shape, value);
  switch (shape.type) {
    case 'object':
      return flattenObject(shape, converted, context);
    case 'node':
      return flattenNode(shape, converted, context);
    default:
      return assertUnknownShape(/* TODO: uncomment */shape as never);
  }
}

function flattenObject(
  shape: ObjectShape,
  value: unknown,
  context: FlattenContext
): ShapeMatch {
  if (!(typeof value === 'object' && value)) {
    throw new Error(
      `Cannot flatten non-object value using object shape ${Rdf.toString(shape.id)}`
    );
  }
  
  const matchContext: PropertyMatchContext = {
    shape,
    selfIri: undefined,
    lastSelfBlank: undefined,
    matches: [],
  };

  flattenProperties(shape.typeProperties, value, matchContext, context);
  flattenProperties(shape.properties, value, matchContext, context);

  function *generate(node: Rdf.Node): Iterable<Rdf.Triple> {
    if (!(node.type === 'uri' || node.type === 'bnode')) {
      throw new Error(
        `Cannot flatten object shape ${Rdf.toString(shape.id)} ` +
        `with non-resource subject ${Rdf.toString(node)}`
      );
    }
    for (const {property, match} of matchContext.matches) {
      const propertyObject = isSelfProperty(property) ? node : match.node;
      yield* flattenPropertyPath(property, node, propertyObject, context);
      yield* generateFromMatch(match, propertyObject);
    }
  }

  return {
    node: matchContext.selfIri
      || matchContext.lastSelfBlank
      || context.generateBlankNode(shape.type),
    generate,
  }
}

interface PropertyMatchContext {
  shape: ObjectShape;
  selfIri: Rdf.Iri | undefined;
  lastSelfBlank: Rdf.Blank | undefined;
  matches: Array<{ property: ObjectProperty; match: ShapeMatch }>;
}

function flattenProperties(
  properties: ReadonlyArray<ObjectProperty>,
  value: { [propertyName: string]: unknown },
  matchContext: PropertyMatchContext,
  context: FlattenContext
): void {
  for (const property of properties) {
    const propertyValue = value[property.name];
    const valueShape = context.resolveShape(property.valueShape);
    const match = flattenShape(valueShape, propertyValue, context);
    matchContext.matches.push({property, match});

    if (isSelfProperty(property) && match.node) {
      if (match.node.type === 'uri') {
        if (matchContext.selfIri) {
          throw new Error(
            `Inconsistent self reference for object shape ` +
            Rdf.toString(matchContext.shape.id)
          );
        }
        matchContext.selfIri = match.node;
      } else if (match.node.type === 'bnode') {
        matchContext.lastSelfBlank = match.node;
      }
    }
  }
}

function *flattenPropertyPath(
  {path}: ObjectProperty,
  subject: Rdf.Iri | Rdf.Blank,
  object: Rdf.Node,
  context: FlattenContext
): Iterable<Rdf.Triple> {
  if (path.length === 0) {
    return;
  }
  let s = subject;
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

function flattenNode(
  shape: NodeShape,
  value: unknown,
  context: FlattenContext
): ShapeMatch {
  if (!looksLikeRdfNode(value)) {
    throw new Error(
      `Cannot flatten non-RDF node using node shape ${Rdf.toString(shape.id)}`
    );
  }
  return {node: value};
}

function *generateFromMatch(match: ShapeMatch, subject: Rdf.Node): Iterable<Rdf.Triple> {
  if (match.generate) {
    yield* match.generate(subject);
  }
}

function looksLikeRdfNode(value: unknown): value is Rdf.Node {
  if (!(typeof value === 'object' && value && 'type' in value)) {
    return false;
  }
  const {type} = value as any;
  return type === 'uri' || type === 'bnode' || type === 'literal';
}
