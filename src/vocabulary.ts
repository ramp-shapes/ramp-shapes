import type { DataFactory } from '@rdfjs/types';
import { namespacedNode, namespacedValue } from './rdf/rdf-model.js';

export namespace rdf {
  export const NAMESPACE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  export const first = namespacedValue(NAMESPACE, 'first');
  export const langString = namespacedValue(NAMESPACE, 'langString');
  export const nil = namespacedValue(NAMESPACE, 'nil');
  export const rest = namespacedValue(NAMESPACE, 'rest');
  export const type = namespacedValue(NAMESPACE, 'type');
}

export namespace xsd {
  export const NAMESPACE = 'http://www.w3.org/2001/XMLSchema#';
  export const string = namespacedValue(NAMESPACE, 'string');
  export const boolean = namespacedValue(NAMESPACE, 'boolean');
  export const integer = namespacedValue(NAMESPACE, 'integer');
  export const double = namespacedValue(NAMESPACE, 'double');
  export const decimal = namespacedValue(NAMESPACE, 'decimal');
  export const nonNegativeInteger = namespacedValue(NAMESPACE, 'nonNegativeInteger');
  export const dateTime = namespacedValue(NAMESPACE, 'dateTime');
}

export namespace ramp {
  export const NAMESPACE = 'http://ramp-shapes.github.io/schema#';
  export const Shape = namespacedValue(NAMESPACE, 'Shape');
}

export function makeRampVocabulary(factory: DataFactory) {
  const NAMESPACE = ramp.NAMESPACE;
  return {
    NAMESPACE,
    Shape: namespacedNode(factory, NAMESPACE, 'Shape'),
    ShapeID: namespacedNode(factory, NAMESPACE, 'ShapeID'),
    ShapeTypeVocabulary: namespacedNode(factory, NAMESPACE, 'ShapeTypeVocabulary'),
    lenient: namespacedNode(factory, NAMESPACE, 'lenient'),

    // Record
    Record: namespacedNode(factory, NAMESPACE, 'Record'),
    typeProperty: namespacedNode(factory, NAMESPACE, 'typeProperty'),
    property: namespacedNode(factory, NAMESPACE, 'property'),
    computedProperty: namespacedNode(factory, NAMESPACE, 'computedProperty'),

    // Property and ComputedProperty
    Property: namespacedNode(factory, NAMESPACE, 'Property'),
    ComputedProperty: namespacedNode(factory, NAMESPACE, 'ComputedProperty'),
    PropertyPath: namespacedNode(factory, NAMESPACE, 'PropertyPath'),
    PropertyPathVocabulary: namespacedNode(factory, NAMESPACE, 'PropertyPathVocabulary'),
    PredicatePath: namespacedNode(factory, NAMESPACE, 'PredicatePath'),
    SequencePath: namespacedNode(factory, NAMESPACE, 'SequencePath'),
    InversePath: namespacedNode(factory, NAMESPACE, 'InversePath'),
    AlternativePath: namespacedNode(factory, NAMESPACE, 'AlternativePath'),
    ZeroOrMorePath: namespacedNode(factory, NAMESPACE, 'ZeroOrMorePath'),
    ZeroOrOnePath: namespacedNode(factory, NAMESPACE, 'ZeroOrOnePath'),
    OneOrMorePath: namespacedNode(factory, NAMESPACE, 'OneOrMorePath'),
    name: namespacedNode(factory, NAMESPACE, 'name'),
    shape: namespacedNode(factory, NAMESPACE, 'shape'),
    path: namespacedNode(factory, NAMESPACE, 'path'),
    transient: namespacedNode(factory, NAMESPACE, 'transient'),
    inversePath: namespacedNode(factory, NAMESPACE, 'inversePath'),
    alternativePath: namespacedNode(factory, NAMESPACE, 'alternativePath'),
    zeroOrMorePath: namespacedNode(factory, NAMESPACE, 'zeroOrMorePath'),
    zeroOrOnePath: namespacedNode(factory, NAMESPACE, 'zeroOrOnePath'),
    oneOrMorePath: namespacedNode(factory, NAMESPACE, 'oneOrMorePath'),

    // Resource and Literal
    Resource: namespacedNode(factory, NAMESPACE, 'Resource'),
    Literal: namespacedNode(factory, NAMESPACE, 'Literal'),
    onlyNamed: namespacedNode(factory, NAMESPACE, 'onlyNamed'),
    termDatatype: namespacedNode(factory, NAMESPACE, 'termDatatype'),
    termLanguage: namespacedNode(factory, NAMESPACE, 'termLanguage'),
    termValue: namespacedNode(factory, NAMESPACE, 'termValue'),
    keepAsTerm: namespacedNode(factory, NAMESPACE, 'keepAsTerm'),

    // AnyOf
    AnyOf: namespacedNode(factory, NAMESPACE, 'AnyOf'),
    variant: namespacedNode(factory, NAMESPACE, 'variant'),

    // Optional and Set
    Optional: namespacedNode(factory, NAMESPACE, 'Optional'),
    Set: namespacedNode(factory, NAMESPACE, 'Set'),
    item: namespacedNode(factory, NAMESPACE, 'item'),
    minCount: namespacedNode(factory, NAMESPACE, 'minCount'),
    maxCount: namespacedNode(factory, NAMESPACE, 'maxCount'),

    // List; also uses "item"
    List: namespacedNode(factory, NAMESPACE, 'List'),
    headPath: namespacedNode(factory, NAMESPACE, 'headPath'),
    tailPath: namespacedNode(factory, NAMESPACE, 'tailPath'),
    nil: namespacedNode(factory, NAMESPACE, 'nil'),

    // Map; also uses "item"
    Map: namespacedNode(factory, NAMESPACE, 'Map'),
    mapKey: namespacedNode(factory, NAMESPACE, 'mapKey'),
    mapValue: namespacedNode(factory, NAMESPACE, 'mapValue'),

    // ShapeReference
    ShapeReference: namespacedNode(factory, NAMESPACE, 'ShapeReference'),
    TermPartVocabulary: namespacedNode(factory, NAMESPACE, 'TermPartVocabulary'),
    TermDatatype: namespacedNode(factory, NAMESPACE, 'TermDatatype'),
    TermLanguage: namespacedNode(factory, NAMESPACE, 'TermLanguage'),
    TermValue: namespacedNode(factory, NAMESPACE, 'TermValue'),
    termPart: namespacedNode(factory, NAMESPACE, 'termPart'),

    // Vocabulary; also uses "termValue"
    Vocabulary: namespacedNode(factory, NAMESPACE, 'Vocabulary'),
    vocabulary: namespacedNode(factory, NAMESPACE, 'vocabulary'),
    vocabItem: namespacedNode(factory, NAMESPACE, 'vocabItem'),
    vocabKey: namespacedNode(factory, NAMESPACE, 'vocabKey'),
  };
}


