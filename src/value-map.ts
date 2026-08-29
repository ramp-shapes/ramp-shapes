import type { DataFactory } from '@rdfjs/types';

import { DefaultDataFactory } from './rdf/rdf-model.js';
import { Shape, TypedShape, ValueHole } from './shapes.js';
import { type TransformVisitor, DefaultMatchCache, transform } from './transform.js';
import { mapByDefault } from './value-mapping.js';

export interface ValueMapParams<S extends Shape> {
  value: unknown;
  shape: S;
  factory?: DataFactory;
}

export function valueMap<S extends Shape>(
  params: ValueMapParams<S>
): S extends TypedShape<infer T> ? T : unknown {
  const {factory = DefaultDataFactory} = params;
  const cache = new DefaultMatchCache();
  const defaultMapper = mapByDefault();

  const visitByDefault = (match: unknown, shape: Shape, value: unknown) => {
    return (shape.mapper ?? defaultMapper).map(match, shape);
  };

  const visitor: TransformVisitor<unknown> = {
    createPlaceholder: (value, shape) => new ValueHole(value, shape),
    visitAnyOf: visitByDefault,
    visitList: visitByDefault,
    visitLiteral: (value, shape) => {
      return (shape.mapper ?? defaultMapper).map(value, shape);
    },
    visitNode: (value, shape) => {
      return (shape.mapper ?? defaultMapper).map(value, shape);
    },
    visitMap: visitByDefault,
    visitOptional: visitByDefault,
    visitRecord: (matches, shape, value) => {
      const mapped = Object.create(null) as Record<string, unknown>;
      for (const {match, property} of matches) {
        mapped[property.name] = match;
      }
      return (shape.mapper ?? defaultMapper).map(mapped, shape);
    },
    visitSet: visitByDefault,
  };

  const transformed = transform<unknown>({
    shape: params.shape,
    value: params.value,
    factory,
    visitor,
    cache,
  });

  return transformed as S extends TypedShape<infer T> ? T : unknown;
}
