import type { DataFactory, BlankNode, NamedNode, Literal, Term } from '@rdfjs/types';
import { ReadonlyHashMap } from '@reactodia/hashmap';

import { type RawTerm, looksLikeTerm, termFromRaw, termToString } from './rdf/rdf-model.js';
import { makeTermMap } from './common.js';
import { formatDisplayShape } from './errors.js';
import {
  Shape, ValueMapper, ResourceShape, LiteralShape, Vocabulary, TypedVocabulary, ValueHole,
} from './shapes.js';
import { rdf, xsd } from './vocabulary.js';

const MAP_BY_DEFAULT: ValueMapper<unknown, unknown> = {
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
                propertyValue.setResolver(mapped => {
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
              item.setResolver(mapped => {
                value[i] = mapped;
              });
            }
          }
        }
        break;
      }
    }
    return value;
  },
  unmap: value => ({value}),
};

export function mapByDefault<T>(): ValueMapper<T, T> {
  return MAP_BY_DEFAULT as ValueMapper<T, T>;
}

export function mapAsTerm<T extends Term>(factory: DataFactory): ValueMapper<RawTerm<T>, T> {
  return {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    map: (value, shape) => factory.fromTerm(value as any) as T,
    unmap: (value, shape) => {
      if (looksLikeTerm(value)) {
        const mapped: unknown = 'toJSON' in value && typeof value.toJSON === 'function'
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          ? value.toJSON()
          : value;
        return {value: mapped as RawTerm<T>};
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
        return value.value;
      } else if (value.termType === 'BlankNode') {
        return termToString(value as BlankNode);
      } else if (value.termType === 'Literal') {
        return value.value;
      } else {
        throw new Error(`Unexpected term to map value as string: ${termToString(value)}`);
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
          return {value: term as RawTerm<Term> as RawTerm<T>};
        } else if (shape.type === 'literal') {
          const term = shape.language
            ? factory.literal(value, shape.language)
            : factory.literal(value, shape.datatype);
          return {value: term as RawTerm<Literal> as RawTerm<T>};
        }
      }
      return undefined;
    },
  };
}

export function mapAsNumber(factory: DataFactory): ValueMapper<RawTerm<Literal>, number> {
  return {
    map: (value, shape) => {
      return Number(value.value);
    },
    unmap: (value, shape) => {
      if (typeof value === 'number') {
        const datatype = shape.type === 'literal' ? shape.datatype : undefined;
        const term = factory.literal(String(value), datatype);
        return {value: term};
      }
      return undefined;
    },
  };
}

export function mapAsBoolean(factory: DataFactory): ValueMapper<RawTerm<Literal>, boolean> {
  return {
    map: (value, shape) => {
      return value.value !== 'false';
    },
    unmap: (value, shape) => {
      if (typeof value === 'boolean') {
        const datatype = shape.type === 'literal' ? shape.datatype : undefined;
        const term = factory.literal(value ? 'true' : 'false', datatype);
        return {value: term};
      }
      return undefined;
    },
  };
}

// export function mapVocabularies(): ValueMapper {
//   interface CachedVocabulary {
//     termToKey: ReadonlyHashMap<Term, string>;
//     keyToTerm: ReadonlyMap<string, Term>;
//   }

//   const cache = makeTermMap<CachedVocabulary>();

//   function getVocab(shape: Shape): CachedVocabulary | undefined {
//     if (!(shape.type === 'resource' && shape.vocabulary)) {
//       return undefined;
//     }
//     let vocab = cache.get(shape.id);
//     if (!vocab) {
//       vocab = {
        
//       };
//       cache.set(shape.id, vocab);
//     }
//     return vocab;
//   }
// }

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
      return termToKey.get(value as Term)!;
    },
    unmap: (value, shape) => {
      if (typeof value === 'string' && keyToTerm.has(value)) {
        const term = keyToTerm.get(value)!;
        return {value: term};
      }
      return undefined;
    }
  };
}

export function mapChain<T, U, R>(
  first: ValueMapper<T, U>,
  second: ValueMapper<U, R>
): ValueMapper<T, R> {
  return {
    map: (value, shape) => second.map(first.map(value, shape), shape),
    unmap: (value, shape) => {
      const unmappedBySecond = second.unmap(value, shape);
      return unmappedBySecond ? first.unmap(unmappedBySecond.value, shape) : undefined;
    },
  };
}

// export function mapByDefault(factory: DataFactory): ValueMapper {
//   return chainAsMappingFromRdf(
//     resolveVocabularies(),
//     convertToNativeTypes(factory)
//   );
// }

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

// export function tryConvertToNativeType(shape: ResourceShape | LiteralShape, value: unknown): unknown {
//   if (!looksLikeTerm(value)) {
//     return value;
//   }

//   if (shape.type === 'resource') {
//     if (value.termType === 'NamedNode') {
//       return value.value;
//     } else if (value.termType === 'BlankNode') {
//       return termToString(value);
//     }
//   }

//   if (shape.type === 'literal' && value.termType === 'Literal') {
//     const datatype = effectiveDatatype(shape);
//     if (typeof datatype === 'string') {
//       if (datatype === xsd.string) {
//         return value.value;
//       } else if (datatype === rdf.langString && shape.language) {
//         return value.value;
//       } else if (datatype === xsd.boolean) {
//         return value.value !== 'false';
//       } else if (isNumberType(datatype)) {
//         return Number(value.value);
//       }
//     }
//   }

//   return value;
// }

// export function tryConvertFromNativeType(
//   shape: ResourceShape | LiteralShape,
//   value: unknown,
//   factory: DataFactory
// ): unknown {
//   if (shape.type === 'resource' && typeof value === 'string') {
//     return value.startsWith('_:')
//       ? factory.blankNode(value.substring(2))
//       : factory.namedNode(value);
//   }

//   if (shape.type === 'literal') {
//     const datatype = effectiveDatatype(shape);
//     if (typeof datatype === 'string') {
//       if (datatype === xsd.string && typeof value === 'string') {
//         return factory.literal(value);
//       } else if (
//         datatype === rdf.langString
//         && shape.language
//         && typeof value === 'string'
//       ) {
//         return factory.literal(value, shape.language);
//       } else if (datatype === xsd.boolean && typeof value === 'boolean') {
//         return factory.literal(value ? 'true' : 'false', shape.datatype);
//       } else if (isNumberType(datatype) && typeof value === 'number') {
//         return factory.literal(value.toString(), shape.datatype);
//       }
//     }
//   }

//   return value;
// }

// function effectiveDatatype(shape: LiteralShape): string | undefined {
//   if (shape.datatype) {
//     return shape.datatype.value;
//   } else if (shape.language) {
//     return rdf.langString;
//   } else if (shape.value) {
//     return shape.value.datatype.value;
//   }
//   return undefined;
// }

// function isNumberType(datatype: string) {
//   return isIntegerType(datatype) || isFractionalType(datatype);
// }

// function isIntegerType(datatype: string) {
//   return (
//     datatype === xsd.integer ||
//     datatype === xsd.nonNegativeInteger
//   );
// }

// function isFractionalType(datatype: string) {
//   return (
//     datatype === xsd.decimal ||
//     datatype === xsd.double
//   );
// }
