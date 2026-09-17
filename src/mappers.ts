import type { DataFactory, BlankNode, NamedNode, Literal, Term } from '@rdfjs/types';
import { ReadonlyHashMap } from '@reactodia/hashmap';

import { type RawTerm, looksLikeTerm, termFromRaw, termToString } from './rdf/rdf-model.js';
import { makeTermMap } from './common.js';
import {
  Shape, ValueMapper, Match, ResourceShape, LiteralShape, Vocabulary, TypedVocabulary,
  ValueHole,
} from './shapes.js';
import { rdf, xsd } from './vocabulary.js';

export function mapByDefault(factory: DataFactory): ValueMapper<unknown, unknown> {
  return mapInSequence([
    mapResolveHoles(),
    mapVocabularies(),
    mapAsNativeType(factory),
    mapAsIs(),
  ]);
}

export function mapAsIs<T>(): ValueMapper<T, T> {
  return {
    map: (value, shape) => new Match(value),
    unmap: (value, shape) => new Match(value),
  };
}

export function mapResolveHoles(): ValueMapper<unknown, unknown> {
  return {
    map: (value, shape) => {
      switch (shape.type) {
        case 'record':
        case 'map': {
          if (typeof value === 'object' && value !== null) {
            const valueObject = value as Record<string, unknown>;
            for (const key in valueObject) {
              if (Object.prototype.hasOwnProperty.call(value, key)) {
                const propertyValue = valueObject[key];
                if (propertyValue instanceof ValueHole) {
                  valueObject[key] = null;
                  propertyValue.addResolver(mapped => {
                    valueObject[key] = mapped;
                  });
                }
              }
            }
          }
          break;
        }
        case 'set':
        case 'list': {
          if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
              const item: unknown = value[i];
              if (item instanceof ValueHole) {
                item.addResolver(mapped => {
                  value[i] = mapped;
                });
              }
            }
          }
          break;
        }
      }
      return undefined;
    },
    unmap: (value, shape) => undefined,
  };
}

export function mapVocabularies(): ValueMapper<unknown, unknown> {
  return {
    map: (value, shape) => {
      switch (shape.type) {
        case 'resource': {
          const mapper = getVocabularyMapper(shape);
          if (mapper) {
            return mapper.map(value, shape);
          }
          break;
        }
      }
      return undefined;
    },
    unmap: (value, shape) => {
      switch (shape.type) {
        case 'resource': {
          const mapper = getVocabularyMapper(shape);
          if (mapper) {
            return mapper.unmap(value, shape);
          }
          break;
        }
      }
      return undefined;
    },
  };
}

const VOCABULARY_MAPPER = new WeakMap<Vocabulary, ValueMapper<unknown, unknown>>();

function getVocabularyMapper(shape: ResourceShape): ValueMapper<unknown, unknown> | undefined {
  if (shape.vocabulary) {
    let mapper = VOCABULARY_MAPPER.get(shape.vocabulary);
    if (!mapper) {
      mapper = mapVocabulary(shape.vocabulary);
      VOCABULARY_MAPPER.set(shape.vocabulary, mapper);
    }
    return mapper;
  }
  return undefined;
}

export function mapAsTerm<T extends Term>(factory: DataFactory): ValueMapper<RawTerm<T>, T> {
  return {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    map: (value, shape) => new Match(factory.fromTerm(value as any) as T),
    unmap: (value, shape) => {
      if (looksLikeTerm(value)) {
        const mapped: unknown = 'toJSON' in value && typeof value.toJSON === 'function'
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          ? value.toJSON()
          : value;
        return new Match(mapped as RawTerm<T>);
      }
      return undefined;
    },
  };
}

export function mapAsString<T extends NamedNode | BlankNode | Literal>(
  factory: DataFactory
): ValueMapper<RawTerm<T>, string> {
  return {
    map: (value, shape) => {
      if (value.termType === 'NamedNode') {
        return new Match(value.value);
      } else if (value.termType === 'BlankNode') {
        return new Match(termToString(value as BlankNode));
      } else if (value.termType === 'Literal') {
        return new Match(value.value);
      } else {
        return undefined;
      }
    },
    unmap: (value, shape) => {
      if (typeof value === 'string') {
        if (shape.type === 'resource') {
          const term = (
            value.startsWith('_:')
              ? factory.blankNode(value.substring(2))
              : factory.namedNode(value)
          );
          return new Match(term as RawTerm<Term> as RawTerm<T>);
        } else if (shape.type === 'literal') {
          const term = shape.language
            ? factory.literal(value, shape.language)
            : factory.literal(value, shape.datatype);
          return new Match(term as RawTerm<Literal> as RawTerm<T>);
        }
      }
      return undefined;
    },
  };
}

export function mapAsNumber(factory: DataFactory): ValueMapper<RawTerm<Literal>, number> {
  return {
    map: (value, shape) => {
      return new Match(Number(value.value));
    },
    unmap: (value, shape) => {
      if (typeof value === 'number') {
        const datatype = shape.type === 'literal' ? shape.datatype : undefined;
        const term = factory.literal(String(value), datatype);
        return new Match(term);
      }
      return undefined;
    },
  };
}

export function mapAsBoolean(factory: DataFactory): ValueMapper<RawTerm<Literal>, boolean> {
  return {
    map: (value, shape) => {
      return new Match(value.value !== 'false');
    },
    unmap: (value, shape) => {
      if (typeof value === 'boolean') {
        const datatype = shape.type === 'literal' ? shape.datatype : undefined;
        const term = factory.literal(value ? 'true' : 'false', datatype);
        return new Match(term);
      }
      return undefined;
    },
  };
}

export function mapVocabulary<T extends Vocabulary['terms']>(
  vocabulary: TypedVocabulary<T>
): ValueMapper<RawTerm<Term>, string> {
  const termToKey = makeTermToKeyVocabulary(vocabulary);
  const keyToTerm = makeKeyToTermVocabulary(vocabulary);
  return {
    map: (value, shape) => {
      if (!termToKey.has(value as Term)) {
        throw new Error(
          `Cannot find RDF term ${termToString(value as Term)} in vocabulary for shape ${termToString(shape.id)}`
        );
      }
      return new Match(termToKey.get(value as Term)!);
    },
    unmap: (value, shape) => {
      if (typeof value === 'string' && keyToTerm.has(value)) {
        const term = keyToTerm.get(value)!;
        return new Match(term);
      }
      return undefined;
    }
  };
}

export function mapInSequence<In, Out>(
  mappers: ReadonlyArray<ValueMapper<In, Out>>
): ValueMapper<In, Out> {
  return {
    map: (value, shape) => {
      for (const mapper of mappers) {
        const mapped = mapper.map(value, shape);
        if (mapped) {
          return mapped;
        }
      }
      return undefined;
    },
    unmap: (value, shape) => {
      for (const mapper of mappers) {
        const unmapped = mapper.unmap(value, shape);
        if (unmapped) {
          return unmapped;
        }
      }
      return undefined;
    },
  };
}

function makeTermToKeyVocabulary(vocab: Vocabulary): ReadonlyHashMap<Term, string> {
  const forward = makeTermMap<string>();
  for (const key in vocab.terms) {
    if (Object.hasOwnProperty.call(vocab.terms, key)) {
      const term = vocab.terms[key];
      forward.set(term, key);
    }
  }
  return forward;
}

function makeKeyToTermVocabulary(vocab: Vocabulary): Map<string, Term> {
  const reversed = new Map<string, Term>();
  for (const key in vocab.terms) {
    if (Object.hasOwnProperty.call(vocab.terms, key)) {
      const term = vocab.terms[key];
      reversed.set(key, term);
    }
  }
  return reversed;
}

type NativeType = 'string' | 'number' | 'bigint' | 'boolean';

export interface MapAsNativeTypeOptions {
  selectNativeType?: (datatype: NamedNode) => NativeType | undefined;
}

export function mapAsNativeType(
  factory: DataFactory,
  options?: MapAsNativeTypeOptions
): ValueMapper<
  RawTerm<NamedNode | BlankNode | Literal>,
  string | number | bigint | boolean
> {
  const {selectNativeType = defaultSelectNativeType} = options ?? {};
  const rdfLangString = factory.namedNode(rdf.langString);
  return {
    map: (value, shape) => {
      if (!looksLikeTerm(value)) {
        return undefined;
      }

      if (shape.type === 'resource') {
        if (value.termType === 'NamedNode') {
          return new Match(value.value);
        } else if (value.termType === 'BlankNode') {
          return new Match(termToString(value));
        }
      }

      if (shape.type === 'literal' && value.termType === 'Literal') {
        const datatype = effectiveDatatype(shape, rdfLangString);
        if (datatype) {
          const kind = selectNativeType(datatype);
          switch (kind) {
            case 'string': {
              return new Match(value.value);
            }
            case 'number': {
              return new Match(Number(value.value));
            }
            case 'bigint': {
              return new Match(BigInt(value.value));
            }
            case 'boolean': {
              return new Match(value.value !== 'false');
            }
          }
        }
      }

      return undefined;
    },
    unmap: (value, shape) => {
      if (shape.type === 'resource') {
        if (typeof value === 'string') {
          const term = value.startsWith('_:')
            ? factory.blankNode(value.substring(2))
            : factory.namedNode(value);
          return new Match(term);
        }
        return undefined;
      }

      if (shape.type === 'literal') {
        const datatype = effectiveDatatype(shape, rdfLangString);
        if (datatype) {
          const kind = selectNativeType(datatype);
          switch (kind) {
            case 'string': {
              if (typeof value === 'string') {
                if (datatype.value === rdf.langString && shape.language) {
                  return new Match(factory.literal(value, shape.language));
                } else {
                  return new Match(factory.literal(value, datatype));
                }
              }
              return undefined;
            }
            case 'number': {
              if (typeof value === 'number') {
                return new Match(factory.literal(String(value), datatype));
              }
              return undefined;
            }
            case 'bigint': {
              if (typeof value === 'bigint') {
                return new Match(factory.literal(String(value), datatype));
              }
              return undefined;
            }
            case 'boolean': {
              if (typeof value === 'boolean') {
                return new Match(factory.literal(value ? 'true' : 'false', datatype));
              }
              return undefined;
            }
          }
        }
      }
      return undefined;
    },
  };
}

function effectiveDatatype(shape: LiteralShape, rdfLangString: NamedNode): NamedNode | undefined {
  if (shape.datatype) {
    return shape.datatype;
  } else if (shape.language) {
    return rdfLangString;
  } else if (shape.value) {
    return shape.value.datatype;
  }
  return undefined;
}

export function defaultSelectNativeType(datatype: NamedNode): NativeType | undefined {
  switch (datatype.value) {
    case xsd.string:
    case rdf.langString: {
      return 'string';
    }
    case xsd.integer:
    case xsd.nonNegativeInteger:
    case xsd.decimal:
    case xsd.double: {
      return 'number';
    }
    case xsd.boolean: {
      return 'boolean';
    }
  }
}
