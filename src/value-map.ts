import type { DataFactory } from '@rdfjs/types';

import { DefaultDataFactory } from './rdf/rdf-model.js';
import { Shape, TypedShape, Match, ValueMapper } from './shapes.js';
import { type TransformVisitor, DefaultMatchCache, transform } from './transform.js';
import { mapByDefault } from './mappers.js';

type ValueMatch = Match<unknown>;

export interface ValueMapParams<S extends Shape> {
  value: unknown;
  shape: S;
  factory?: DataFactory;
  defaultMapper?: ValueMapper<unknown, unknown>;
}

export function valueMap<S extends Shape>(
  params: ValueMapParams<S>
): S extends TypedShape<infer T> ? T : unknown {
  const {
    factory = DefaultDataFactory,
    defaultMapper = mapByDefault(factory),
  } = params;
  const cache = new DefaultMatchCache<ValueMatch>();

  const fromArray = (matches: ValueMatch[], shape: Shape) => {
    const values = matches.map(m => m.value);
    return (shape.mapper ?? defaultMapper).map(values, shape);
  };

  const visitor: TransformVisitor<ValueMatch> = {
    createPlaceholder: (hole) => new Match(hole),
    resolvePlaceholder: (hole, match) => {
      if (match) {
        hole.resolve(match.value);
      }
    },
    intoShape: boxed => new Match(boxed),
    fromAnyOf: (match, shape) => {
      return (shape.mapper ?? defaultMapper).map(match.value, shape);
    },
    fromList: fromArray,
    fromLiteral: (value, shape) => {
      return (shape.mapper ?? defaultMapper).map(value, shape);
    },
    fromNode: (value, shape) => {
      return (shape.mapper ?? defaultMapper).map(value, shape);
    },
    fromMap: (matches, shape) => {
      const entries: [string, unknown][] = [];
      for (const property in matches) {
        if (Object.prototype.hasOwnProperty.call(matches, property)) {
          entries.push([property, matches[property].value]);
        }
      }
      const mapped = Object.fromEntries(entries);
      return (shape.mapper ?? defaultMapper).map(mapped, shape);
    },
    fromOptional: (match, shape) => {
      return (shape.mapper ?? defaultMapper).map(match?.value, shape);
    },
    fromRecord: (matches, shape) => {
      const entries: [string, unknown][] = [];
      for (const {match, property} of matches) {
        if (property.kind === 'transient') {
          continue;
        }
        entries.push([property.name, match.value]);
      }
      const mapped = Object.fromEntries(entries);
      return (shape.mapper ?? defaultMapper).map(mapped, shape);
    },
    fromSet: fromArray,
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
  defaultMapper?: ValueMapper<unknown, unknown>;
}

export function valueUnmap<S extends Shape>(
  params: ValueUnmapParams<S>
): unknown {
  const {
    factory = DefaultDataFactory,
    defaultMapper = mapByDefault(factory),
  } = params;
  const cache = new DefaultMatchCache<ValueMatch>();

  const fromIdentity = (match: ValueMatch) => match;
  const fromArray = (matches: ValueMatch[], shape: Shape) => {
    return new Match(matches.map(m => m.value));
  };

  const visitor: TransformVisitor<ValueMatch> = {
    createPlaceholder: (hole) => new Match(hole),
    resolvePlaceholder: (hole, match) => {
      if (match) {
        hole.resolve(match.value);
      }
    },
    intoShape: (boxed, shape) => (shape.mapper ?? defaultMapper).unmap(boxed, shape),
    fromAnyOf: fromIdentity,
    fromList: fromArray,
    fromLiteral: (value, shape) => new Match(value),
    fromNode: (value, shape) => new Match(value),
    fromMap: (matches, shape) => {
      const entries: [string, unknown][] = [];
      for (const property in matches) {
        if (Object.prototype.hasOwnProperty.call(matches, property)) {
          entries.push([property, matches[property].value]);
        }
      }
      return new Match(Object.fromEntries(entries));
    },
    fromOptional: fromIdentity,
    fromRecord: (matches, shape) => {
      const entries: [string, unknown][] = [];
      for (const {match, property} of matches) {
        if (property.kind === 'transient') {
          continue;
        }
        entries.push([property.name, match.value]);
      }
      return new Match(Object.fromEntries(entries));
    },
    fromSet: fromArray,
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
