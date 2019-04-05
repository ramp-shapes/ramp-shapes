import { HashMap, HashSet } from './hash-map';
import * as Rdf from './rdf-model';
import {
  ShapeID, Shape, PropertyPathSegment, ResourceShape, LiteralShape, ListShape
} from './shapes';
import { rdf, xsd } from './vocabulary';

export function makeNodeSet() {
  return new HashSet<Rdf.Node>(Rdf.hash, Rdf.equals);
}

export function makeNodeMap<V>() {
  return new HashMap<Rdf.Node, V>(Rdf.hash, Rdf.equals);
}

export function randomBlankNode(prefix: string, randomBitCount: number): Rdf.Blank {
  if (randomBitCount > 48) {
    throw new Error(`Cannot generate random blank node with > 48 bits of randomness`);
  }
  const hexDigitCount = Math.ceil(randomBitCount / 4);
  const num = Math.floor(Math.random() * Math.pow(2, randomBitCount));
  const value = prefix + num.toString(16).padStart(hexDigitCount, '0');
  return {type: 'bnode', value};
}

export function makeShapeResolver(
  shapes: ReadonlyArray<Shape>
): (shapeID: ShapeID) => Shape {
  const contextShapes = makeNodeMap<Shape>();
  for (const shape of shapes) {
    contextShapes.set(shape.id, shape);
  }
  return shapeID => {
    const shape = contextShapes.get(shapeID);
    if (!shape) {
      throw new Error(`Failed to resolve shape ${Rdf.toString(shapeID)}`);
    }
    return shape;
  };
}

export function assertUnknownShape(shape: never): never {
  throw new Error(`Unknown shape type ${(shape as Shape).type}`);
}

export function doesNodeMatch(shape: ResourceShape | LiteralShape, node: Rdf.Node): boolean {
  if (shape.type === 'resource') {
    return (node.type === 'uri' || node.type === 'bnode')
      && (!shape.value || Rdf.equals(shape.value, node));
  } else {
    return node.type === 'literal'
      && (!shape.datatype || shape.datatype.value === node.datatype)
      && (!shape.language || shape.language === node["xml:lang"])
      && (!shape.value || Rdf.equals(shape.value, node));
  }
}

const DEFAULT_LIST_HEAD: ReadonlyArray<PropertyPathSegment> =
  [{predicate: rdf.first, reverse: false}];
const DEFAULT_LIST_TAIL: ReadonlyArray<PropertyPathSegment> =
  [{predicate: rdf.rest, reverse: false}];

export interface ResolvedListShape {
  head: ReadonlyArray<PropertyPathSegment>;
  tail: ReadonlyArray<PropertyPathSegment>;
  nil: Rdf.Iri;
}

export function resolveListShapeDefaults(shape: ListShape): ResolvedListShape {
  return {
    head: shape.headPath || DEFAULT_LIST_HEAD,
    tail: shape.tailPath || DEFAULT_LIST_TAIL,
    nil: shape.nil || rdf.nil,
  };
}
