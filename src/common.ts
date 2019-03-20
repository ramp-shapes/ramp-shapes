import { HashMap, HashSet } from './hash-map';
import * as Rdf from './rdf-model';
import { ShapeID, Shape } from './shapes';

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
