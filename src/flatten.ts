import { makeShapeResolver, assertUnknownShape } from './common';
import * as Rdf from './rdf-model';
import {
  ShapeID, Shape, NodeShape
} from './shapes';

export interface FlattenParams {
  value: unknown;
  rootShape: ShapeID;
  shapes: ReadonlyArray<Shape>;
}

export function flatten(params: FlattenParams): IterableIterator<Rdf.Triple> {
  const context: FlattenContext = {
    resolveShape: makeShapeResolver(params.shapes),
    flattenType: (shape, value) => {
      return value;
    }
  };
  const rootShape = context.resolveShape(params.rootShape);
  return flattenShape(rootShape, params.value, context);
}

interface FlattenContext {
  resolveShape: (shapeID: ShapeID) => Shape;
  flattenType: (shape: Shape, value: unknown) => unknown;
}

function flattenShape(
  shape: Shape,
  value: unknown,
  context: FlattenContext
): IterableIterator<Rdf.Triple> {
  const converted = context.flattenType(shape, value);
  switch (shape.type) {
    case 'node':
      return flattenNode(shape, converted, context);
    default:
      return assertUnknownShape(/* TODO: uncomment */shape as never);
  }
}

function *flattenNode(
  shape: NodeShape,
  value: unknown,
  context: FlattenContext
): IterableIterator<Rdf.Triple> {
  // TODO: implement
}
