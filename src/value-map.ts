import type { DataFactory } from '@rdfjs/types';

import { DefaultDataFactory } from './rdf/rdf-model.js';
import { Shape, TypedShape, ValueHole } from './shapes.js';
import { type TransformVisitor, DefaultMatchCache, transform } from './transform.js';
import { mapByDefault } from './mappers.js';

type ValueMatch = { readonly value: unknown } | ValueHole;

export interface ValueMapParams<S extends Shape> {
  value: unknown;
  shape: S;
  factory?: DataFactory;
}

export function valueMap<S extends Shape>(
  params: ValueMapParams<S>
): S extends TypedShape<infer T> ? T : unknown {
  const {factory = DefaultDataFactory} = params;
  const cache = new DefaultMatchCache<ValueMatch>();
  const defaultMapper = mapByDefault();

  const visitArray = (matches: ValueMatch[], shape: Shape, value: unknown) => {
    const values = matches.map(m => m.value);
    return {value: (shape.mapper ?? defaultMapper).map(values, shape)};
  };

  const visitor: TransformVisitor<ValueMatch> = {
    createPlaceholder: (value, shape) => new ValueHole(value, shape),
    visitAnyOf: (match, shape) => {
      return {value: (shape.mapper ?? defaultMapper).map(match.value, shape)};
    },
    visitList: visitArray,
    visitLiteral: (value, shape) => {
      return {value: (shape.mapper ?? defaultMapper).map(value, shape)};
    },
    visitNode: (value, shape) => {
      return {value: (shape.mapper ?? defaultMapper).map(value, shape)};
    },
    visitMap: (matches, shape) => {
      const entries: [string, unknown][] = [];
      for (const property in matches) {
        if (Object.prototype.hasOwnProperty.call(matches, property)) {
          entries.push([property, matches[property].value]);
        }
      }
      const mapped = Object.fromEntries(entries);
      return {value: (shape.mapper ?? defaultMapper).map(mapped, shape)};
    },
    visitOptional: (match, shape) => {
      return {value: (shape.mapper ?? defaultMapper).map(match?.value, shape)};
    },
    visitRecord: (matches, shape, value) => {
      const entries: [string, unknown][] = [];
      for (const {match, property} of matches) {
        if (property.kind === 'transient') {
          continue;
        }
        entries.push([property.name, match.value]);
      }
      const mapped = Object.fromEntries(entries);
      return {value: (shape.mapper ?? defaultMapper).map(mapped, shape)};
    },
    visitSet: visitArray,
  };

  const transformed = transform<ValueMatch>({
    shape: params.shape,
    value: params.value,
    factory,
    visitor,
    cache,
  });

  return transformed.value as S extends TypedShape<infer T> ? T : unknown;
}

export interface ValueUnmapParams<S extends Shape> {
  value: S extends TypedShape<infer T> ? T : unknown;
  shape: S;
  factory?: DataFactory;
}

export function valueUnmap<S extends Shape>(
  params: ValueMapParams<S>
): unknown {
  const {factory = DefaultDataFactory} = params;
  const cache = new DefaultMatchCache<ValueMatch>();
  const defaultMapper = mapByDefault();

  const visitArray = (matches: ValueMatch[], shape: Shape, value: unknown) => {
    const values = matches.map(m => m.value);
    return (shape.mapper ?? defaultMapper).unmap(values, shape);
  };

  const visitor: TransformVisitor<ValueMatch> = {
    createPlaceholder: (value, shape) => new ValueHole(value, shape),
    visitAnyOf: (match, shape) => {
      return (shape.mapper ?? defaultMapper).unmap(match.value, shape);
    },
    visitList: visitArray,
    visitLiteral: (value, shape) => {
      return (shape.mapper ?? defaultMapper).unmap(value, shape);
    },
    visitNode: (value, shape) => {
      return (shape.mapper ?? defaultMapper).unmap(value, shape);
    },
    visitMap: (matches, shape) => {
      const entries: [string, unknown][] = [];
      for (const property in matches) {
        if (Object.prototype.hasOwnProperty.call(matches, property)) {
          entries.push([property, matches[property].value]);
        }
      }
      const mapped = Object.fromEntries(entries);
      return (shape.mapper ?? defaultMapper).unmap(mapped, shape);
    },
    visitOptional: (match, shape) => {
      return {value: (shape.mapper ?? defaultMapper).map(match?.value, shape)};
    },
    visitRecord: (matches, shape, value) => {
      const entries: [string, unknown][] = [];
      for (const {match, property} of matches) {
        if (property.kind === 'transient') {
          continue;
        }
        entries.push([property.name, match]);
      }
      const mapped = Object.fromEntries(entries);
      return (shape.mapper ?? defaultMapper).unmap(mapped, shape);
    },
    visitSet: visitArray,
  };

  const transformed = transform({
    shape: params.shape,
    value: params.value,
    factory,
    visitor,
    cache,
  });

  return transformed.value;
}
