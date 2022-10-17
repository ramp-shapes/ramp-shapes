import { makeTermMap } from './common';
import { ReadonlyHashMap } from './hash-map';
import * as Rdf from './rdf';
import { Shape, ResourceShape, LiteralShape, Vocabulary } from './shapes';
import { rdf, xsd } from './vocabulary';

export interface ValueMapper {
  fromRdf(value: unknown, shape: Shape): unknown;
  toRdf(value: unknown, shape: Shape): unknown;
}

export namespace ValueMapper {
  const IDENTITY_HANDLER: ValueMapper = {
    fromRdf: value => value,
    toRdf: value => value,
  };

  export function identity(): ValueMapper {
    return IDENTITY_HANDLER;
  }

  export function convertToNativeTypes(factory: Rdf.DataFactory): ValueMapper {
    return {
      fromRdf: (value, shape) => {
        if (shape.type === 'resource' && !shape.keepAsTerm && !shape.vocabulary) {
          return tryConvertToNativeType(shape, value);
        } else if (shape.type === 'literal' && !shape.keepAsTerm) {
          return tryConvertToNativeType(shape, value);
        }
        return value;
      },
      toRdf: (value, shape) => {
        if (shape.type === 'resource' && !shape.keepAsTerm && !shape.vocabulary) {
          return tryConvertFromNativeType(shape, value, factory);
        } else if (shape.type === 'literal' && !shape.keepAsTerm) {
          return tryConvertFromNativeType(shape, value, factory);
        }
        return value;
      },
    };
  }

  export function resolveVocabularies(): ValueMapper {
    interface CachedVocabulary {
      termToKey: ReadonlyHashMap<Rdf.Term, string>;
      keyToTerm: ReadonlyMap<string, Rdf.Term>;
    }

    const cache = makeTermMap<CachedVocabulary>();

    function getVocab(shape: Shape): CachedVocabulary | undefined {
      if (!(shape.type === 'resource' && shape.vocabulary)) {
        return undefined;
      }
      let vocab = cache.get(shape.id);
      if (!vocab) {
        vocab = {
          termToKey: makeTermToKeyVocabulary(shape.vocabulary),
          keyToTerm: makeKeyToTermVocabulary(shape.vocabulary),
        };
        cache.set(shape.id, vocab);
      }
      return vocab;
    }

    return {
      fromRdf: (value, shape) => {
        const vocab = getVocab(shape);
        if (vocab && Rdf.looksLikeTerm(value)) {
          if (!vocab.termToKey.has(value)) {
            throw new Error(
              `Cannot find RDF term ${Rdf.toString(value)} in vocabulary for shape ${Rdf.toString(shape.id)}`
            );
          }
          return vocab.termToKey.get(value);
        }
        return value;
      },
      toRdf: (value, shape) => {
        const vocab = getVocab(shape);
        if (vocab && typeof value === 'string') {
          if (!vocab.keyToTerm.has(value)) {
            throw new Error(
              `Cannot find string "${value}" in vocabulary for shape ${Rdf.toString(shape.id)}`
            );
          }
          return vocab.keyToTerm.get(value);
        }
        return value;
      }
    };
  }

  export function chainAsMappingFromRdf(first: ValueMapper, second: ValueMapper): ValueMapper {
    return {
      fromRdf: (value, shape) => {
        let result = value;
        result = first.fromRdf(result, shape);
        result = second.fromRdf(result, shape);
        return result;
      },
      toRdf: (value, shape) => {
        let result = value;
        result = second.toRdf(result, shape);
        result = first.toRdf(result, shape);
        return result;
      }
    };
  }

  export function mapByDefault(factory: Rdf.DataFactory): ValueMapper {
    return chainAsMappingFromRdf(
      resolveVocabularies(),
      convertToNativeTypes(factory)
    );
  }
}

function makeTermToKeyVocabulary(vocab: Vocabulary): ReadonlyHashMap<Rdf.Term, string> {
  const forward = makeTermMap<string>();
  if (vocab.terms) {
    for (const key in vocab.terms) {
      if (Object.hasOwnProperty.call(vocab.terms, key)) {
        const term = vocab.terms[key];
        forward.set(term, key);
      }
    }
  }
  return forward;
}

function makeKeyToTermVocabulary(vocab: Vocabulary): Map<string, Rdf.Term> {
  const reversed = new Map<string, Rdf.Term>();
  if (vocab.terms) {
    for (const key in vocab.terms) {
      if (Object.hasOwnProperty.call(vocab.terms, key)) {
        const term = vocab.terms[key];
        reversed.set(key, term);
      }
    }
  }
  return reversed;
}

export function tryConvertToNativeType(shape: ResourceShape | LiteralShape, value: unknown): unknown {
  if (!Rdf.looksLikeTerm(value)) {
    return value;
  }

  if (shape.type === 'resource') {
    if (value.termType === 'NamedNode') {
      return value.value;
    } else if (value.termType === 'BlankNode') {
      return Rdf.toString(value);
    }
  }

  if (shape.type === 'literal' && value.termType === 'Literal') {
    const datatype = effectiveDatatype(shape);
    if (typeof datatype === 'string') {
      if (datatype === xsd.string) {
        return value.value;
      } else if (datatype === rdf.langString && shape.language) {
        return value.value;
      } else if (datatype === xsd.boolean) {
        return value.value !== 'false';
      } else if (isNumberType(datatype)) {
        return Number(value.value);
      }
    }
  }

  return value;
}

export function tryConvertFromNativeType(
  shape: ResourceShape | LiteralShape,
  value: unknown,
  factory: Rdf.DataFactory
): unknown {
  if (shape.type === 'resource' && typeof value === 'string') {
    return value.startsWith('_:')
      ? factory.blankNode(value.substring(2))
      : factory.namedNode(value);
  }

  if (shape.type === 'literal') {
    const datatype = effectiveDatatype(shape);
    if (typeof datatype === 'string') {
      if (datatype === xsd.string && typeof value === 'string') {
        return factory.literal(value);
      } else if (
        datatype === rdf.langString
        && shape.language
        && typeof value === 'string'
      ) {
        return factory.literal(value, shape.language);
      } else if (datatype === xsd.boolean && typeof value === 'boolean') {
        return factory.literal(value ? 'true' : 'false', shape.datatype);
      } else if (isNumberType(datatype) && typeof value === 'number') {
        return factory.literal(value.toString(), shape.datatype);
      }
    }
  }

  return value;
}

function effectiveDatatype(shape: LiteralShape): string | undefined {
  if (shape.datatype) {
    return shape.datatype.value;
  } else if (shape.language) {
    return rdf.langString;
  } else if (shape.value) {
    return shape.value.datatype.value;
  }
  return undefined;
}

function isNumberType(datatype: string) {
  return isIntegerType(datatype) || isFractionalType(datatype);
}

function isIntegerType(datatype: string) {
  return (
    datatype === xsd.integer ||
    datatype === xsd.nonNegativeInteger
  );
}

function isFractionalType(datatype: string) {
  return (
    datatype === xsd.decimal ||
    datatype === xsd.double
  );
}
