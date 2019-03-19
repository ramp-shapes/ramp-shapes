import { HashMap, HashSet } from './hash-map';
import * as Rdf from './rdf-model';
import { ShapeID, Shape } from './shapes';

export function makeNodeSet() {
  return new HashSet<Rdf.Node>(Rdf.hash, Rdf.equals);
}

export function makeNodeMap<V>() {
  return new HashMap<Rdf.Node, V>(Rdf.hash, Rdf.equals);
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
