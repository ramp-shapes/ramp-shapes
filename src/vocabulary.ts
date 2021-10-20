import * as Rdf from './rdf';

export namespace rdf {
  export const NAMESPACE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  export const first = NAMESPACE + 'first';
  export const langString = NAMESPACE + 'langString';
  export const nil = NAMESPACE + 'nil';
  export const rest = NAMESPACE + 'rest';
  export const type = NAMESPACE + 'type';
}

export namespace xsd {
  export const NAMESPACE = 'http://www.w3.org/2001/XMLSchema#';
  export const string = NAMESPACE + 'string';
  export const boolean = NAMESPACE + 'boolean';
  export const integer = NAMESPACE + 'integer';
  export const double = NAMESPACE + 'double';
  export const decimal = NAMESPACE + 'decimal';
  export const nonNegativeInteger = NAMESPACE + 'nonNegativeInteger';
  export const dateTime = NAMESPACE + 'dateTime';
}

export namespace ramp {
  export const NAMESPACE = 'http://ramp-shapes.github.io/schema#';
  export const Shape = NAMESPACE + 'Shape';
}

export function makeRampVocabulary(factory: Rdf.DataFactory) {
  const NAMESPACE = ramp.NAMESPACE;
  return {
    NAMESPACE,
    Shape: factory.namedNode(NAMESPACE + 'Shape'),
    ShapeID: factory.namedNode(NAMESPACE + 'ShapeID'),
    ShapeTypeVocabulary: factory.namedNode(NAMESPACE + 'ShapeTypeVocabulary'),
    lenient: factory.namedNode(NAMESPACE + 'lenient'),

    // Record
    Record: factory.namedNode(NAMESPACE + 'Record'),
    typeProperty: factory.namedNode(NAMESPACE + 'typeProperty'),
    property: factory.namedNode(NAMESPACE + 'property'),
    computedProperty: factory.namedNode(NAMESPACE + 'computedProperty'),

    // Property and ComputedProperty
    Property: factory.namedNode(NAMESPACE + 'Property'),
    ComputedProperty: factory.namedNode(NAMESPACE + 'ComputedProperty'),
    PropertyPath: factory.namedNode(NAMESPACE + 'PropertyPath'),
    PropertyPathVocabulary: factory.namedNode(NAMESPACE + 'PropertyPathVocabulary'),
    PredicatePath: factory.namedNode(NAMESPACE + 'PredicatePath'),
    SequencePath: factory.namedNode(NAMESPACE + 'SequencePath'),
    InversePath: factory.namedNode(NAMESPACE + 'InversePath'),
    AlternativePath: factory.namedNode(NAMESPACE + 'AlternativePath'),
    ZeroOrMorePath: factory.namedNode(NAMESPACE + 'ZeroOrMorePath'),
    ZeroOrOnePath: factory.namedNode(NAMESPACE + 'ZeroOrOnePath'),
    OneOrMorePath: factory.namedNode(NAMESPACE + 'OneOrMorePath'),
    name: factory.namedNode(NAMESPACE + 'name'),
    shape: factory.namedNode(NAMESPACE + 'shape'),
    path: factory.namedNode(NAMESPACE + 'path'),
    transient: factory.namedNode(NAMESPACE + 'transient'),
    inversePath: factory.namedNode(NAMESPACE + 'inversePath'),
    alternativePath: factory.namedNode(NAMESPACE + 'alternativePath'),
    zeroOrMorePath: factory.namedNode(NAMESPACE + 'zeroOrMorePath'),
    zeroOrOnePath: factory.namedNode(NAMESPACE + 'zeroOrOnePath'),
    oneOrMorePath: factory.namedNode(NAMESPACE + 'oneOrMorePath'),

    // Resource and Literal
    Resource: factory.namedNode(NAMESPACE + 'Resource'),
    Literal: factory.namedNode(NAMESPACE + 'Literal'),
    onlyNamed: factory.namedNode(NAMESPACE + 'onlyNamed'),
    termDatatype: factory.namedNode(NAMESPACE + 'termDatatype'),
    termLanguage: factory.namedNode(NAMESPACE + 'termLanguage'),
    termValue: factory.namedNode(NAMESPACE + 'termValue'),
    keepAsTerm: factory.namedNode(NAMESPACE + 'keepAsTerm'),

    // AnyOf
    AnyOf: factory.namedNode(NAMESPACE + 'AnyOf'),
    variant: factory.namedNode(NAMESPACE + 'variant'),

    // Optional and Set
    Optional: factory.namedNode(NAMESPACE + 'Optional'),
    Set: factory.namedNode(NAMESPACE + 'Set'),
    item: factory.namedNode(NAMESPACE + 'item'),
    minCount: factory.namedNode(NAMESPACE + 'minCount'),
    maxCount: factory.namedNode(NAMESPACE + 'maxCount'),

    // List; also uses "item"
    List: factory.namedNode(NAMESPACE + 'List'),
    headPath: factory.namedNode(NAMESPACE + 'headPath'),
    tailPath: factory.namedNode(NAMESPACE + 'tailPath'),
    nil: factory.namedNode(NAMESPACE + 'nil'),

    // Map; also uses "item"
    Map: factory.namedNode(NAMESPACE + 'Map'),
    mapKey: factory.namedNode(NAMESPACE + 'mapKey'),
    mapValue: factory.namedNode(NAMESPACE + 'mapValue'),

    // ShapeReference
    ShapeReference: factory.namedNode(NAMESPACE + 'ShapeReference'),
    TermPartVocabulary: factory.namedNode(NAMESPACE + 'TermPartVocabulary'),
    TermDatatype: factory.namedNode(NAMESPACE + 'TermDatatype'),
    TermLanguage: factory.namedNode(NAMESPACE + 'TermLanguage'),
    TermValue: factory.namedNode(NAMESPACE + 'TermValue'),
    termPart: factory.namedNode(NAMESPACE + 'termPart'),

    // Vocabulary; also uses "termValue"
    Vocabulary: factory.namedNode(NAMESPACE + 'Vocabulary'),
    vocabulary: factory.namedNode(NAMESPACE + 'vocabulary'),
    vocabItem: factory.namedNode(NAMESPACE + 'vocabItem'),
    vocabKey: factory.namedNode(NAMESPACE + 'vocabKey'),
  };
}
