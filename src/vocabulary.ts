import * as Rdf from './rdf';

export namespace rdf {
  export const NAMESPACE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  export const first = Rdf.namespacedValue(NAMESPACE, 'first');
  export const langString = Rdf.namespacedValue(NAMESPACE, 'langString');
  export const nil = Rdf.namespacedValue(NAMESPACE, 'nil');
  export const rest = Rdf.namespacedValue(NAMESPACE, 'rest');
  export const type = Rdf.namespacedValue(NAMESPACE, 'type');
}

export namespace xsd {
  export const NAMESPACE = 'http://www.w3.org/2001/XMLSchema#';
  export const string = Rdf.namespacedValue(NAMESPACE, 'string');
  export const boolean = Rdf.namespacedValue(NAMESPACE, 'boolean');
  export const integer = Rdf.namespacedValue(NAMESPACE, 'integer');
  export const double = Rdf.namespacedValue(NAMESPACE, 'double');
  export const decimal = Rdf.namespacedValue(NAMESPACE, 'decimal');
  export const nonNegativeInteger = Rdf.namespacedValue(NAMESPACE, 'nonNegativeInteger');
  export const dateTime = Rdf.namespacedValue(NAMESPACE, 'dateTime');
}

export namespace ramp {
  export const NAMESPACE = 'http://ramp-shapes.github.io/schema#';
  export const Shape = Rdf.namespacedValue(NAMESPACE, 'Shape');
}

export function makeRampVocabulary(factory: Rdf.DataFactory) {
  const NAMESPACE = ramp.NAMESPACE;
  return {
    NAMESPACE,

    // JSON-based syntax
    NamespacedName: Rdf.namespacedNode(factory, NAMESPACE, 'NamespacedName'),
    Namespaces: Rdf.namespacedNode(factory, NAMESPACE, 'Namespaces'),
    Module: Rdf.namespacedNode(factory, NAMESPACE, 'Module'),
    PropertyName: Rdf.namespacedNode(factory, NAMESPACE, 'PropertyName'),
    ShapeOrRef: Rdf.namespacedNode(factory, NAMESPACE, 'ShapeOrRef'),
    ShapeRef: Rdf.namespacedNode(factory, NAMESPACE, 'ShapeRef'),
    containsShape: Rdf.namespacedNode(factory, NAMESPACE, 'containsShape'),

    // Common definitions
    Shape: Rdf.namespacedNode(factory, NAMESPACE, 'Shape'),
    ShapeID: Rdf.namespacedNode(factory, NAMESPACE, 'ShapeID'),
    ShapeTypeVocabulary: Rdf.namespacedNode(factory, NAMESPACE, 'ShapeTypeVocabulary'),
    lenient: Rdf.namespacedNode(factory, NAMESPACE, 'lenient'),

    // Record
    Record: Rdf.namespacedNode(factory, NAMESPACE, 'Record'),
    typeProperty: Rdf.namespacedNode(factory, NAMESPACE, 'typeProperty'),
    property: Rdf.namespacedNode(factory, NAMESPACE, 'property'),
    computedProperty: Rdf.namespacedNode(factory, NAMESPACE, 'computedProperty'),

    // Property and ComputedProperty
    Property: Rdf.namespacedNode(factory, NAMESPACE, 'Property'),
    ComputedProperty: Rdf.namespacedNode(factory, NAMESPACE, 'ComputedProperty'),
    PropertyPath: Rdf.namespacedNode(factory, NAMESPACE, 'PropertyPath'),
    PropertyPathVocabulary: Rdf.namespacedNode(factory, NAMESPACE, 'PropertyPathVocabulary'),
    PredicatePath: Rdf.namespacedNode(factory, NAMESPACE, 'PredicatePath'),
    SequencePath: Rdf.namespacedNode(factory, NAMESPACE, 'SequencePath'),
    InversePath: Rdf.namespacedNode(factory, NAMESPACE, 'InversePath'),
    AlternativePath: Rdf.namespacedNode(factory, NAMESPACE, 'AlternativePath'),
    ZeroOrMorePath: Rdf.namespacedNode(factory, NAMESPACE, 'ZeroOrMorePath'),
    ZeroOrOnePath: Rdf.namespacedNode(factory, NAMESPACE, 'ZeroOrOnePath'),
    OneOrMorePath: Rdf.namespacedNode(factory, NAMESPACE, 'OneOrMorePath'),
    name: Rdf.namespacedNode(factory, NAMESPACE, 'name'),
    shape: Rdf.namespacedNode(factory, NAMESPACE, 'shape'),
    path: Rdf.namespacedNode(factory, NAMESPACE, 'path'),
    transient: Rdf.namespacedNode(factory, NAMESPACE, 'transient'),
    inversePath: Rdf.namespacedNode(factory, NAMESPACE, 'inversePath'),
    alternativePath: Rdf.namespacedNode(factory, NAMESPACE, 'alternativePath'),
    zeroOrMorePath: Rdf.namespacedNode(factory, NAMESPACE, 'zeroOrMorePath'),
    zeroOrOnePath: Rdf.namespacedNode(factory, NAMESPACE, 'zeroOrOnePath'),
    oneOrMorePath: Rdf.namespacedNode(factory, NAMESPACE, 'oneOrMorePath'),

    // Resource and Literal
    Resource: Rdf.namespacedNode(factory, NAMESPACE, 'Resource'),
    Literal: Rdf.namespacedNode(factory, NAMESPACE, 'Literal'),
    onlyNamed: Rdf.namespacedNode(factory, NAMESPACE, 'onlyNamed'),
    termDatatype: Rdf.namespacedNode(factory, NAMESPACE, 'termDatatype'),
    termLanguage: Rdf.namespacedNode(factory, NAMESPACE, 'termLanguage'),
    termValue: Rdf.namespacedNode(factory, NAMESPACE, 'termValue'),
    keepAsTerm: Rdf.namespacedNode(factory, NAMESPACE, 'keepAsTerm'),

    // AnyOf
    AnyOf: Rdf.namespacedNode(factory, NAMESPACE, 'AnyOf'),
    variant: Rdf.namespacedNode(factory, NAMESPACE, 'variant'),

    // Optional and Set
    Optional: Rdf.namespacedNode(factory, NAMESPACE, 'Optional'),
    Set: Rdf.namespacedNode(factory, NAMESPACE, 'Set'),
    item: Rdf.namespacedNode(factory, NAMESPACE, 'item'),
    minCount: Rdf.namespacedNode(factory, NAMESPACE, 'minCount'),
    maxCount: Rdf.namespacedNode(factory, NAMESPACE, 'maxCount'),

    // List; also uses "item"
    List: Rdf.namespacedNode(factory, NAMESPACE, 'List'),
    headPath: Rdf.namespacedNode(factory, NAMESPACE, 'headPath'),
    tailPath: Rdf.namespacedNode(factory, NAMESPACE, 'tailPath'),
    nil: Rdf.namespacedNode(factory, NAMESPACE, 'nil'),

    // Map; also uses "item"
    Map: Rdf.namespacedNode(factory, NAMESPACE, 'Map'),
    mapKey: Rdf.namespacedNode(factory, NAMESPACE, 'mapKey'),
    mapValue: Rdf.namespacedNode(factory, NAMESPACE, 'mapValue'),

    // ShapeReference
    ShapeReference: Rdf.namespacedNode(factory, NAMESPACE, 'ShapeReference'),
    TermPartVocabulary: Rdf.namespacedNode(factory, NAMESPACE, 'TermPartVocabulary'),
    TermDatatype: Rdf.namespacedNode(factory, NAMESPACE, 'TermDatatype'),
    TermLanguage: Rdf.namespacedNode(factory, NAMESPACE, 'TermLanguage'),
    TermValue: Rdf.namespacedNode(factory, NAMESPACE, 'TermValue'),
    termPart: Rdf.namespacedNode(factory, NAMESPACE, 'termPart'),

    // Vocabulary; also uses "termValue"
    Vocabulary: Rdf.namespacedNode(factory, NAMESPACE, 'Vocabulary'),
    vocabulary: Rdf.namespacedNode(factory, NAMESPACE, 'vocabulary'),
    vocabItem: Rdf.namespacedNode(factory, NAMESPACE, 'vocabItem'),
    vocabKey: Rdf.namespacedNode(factory, NAMESPACE, 'vocabKey'),
  };
}


