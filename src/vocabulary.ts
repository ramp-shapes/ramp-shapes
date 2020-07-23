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
    lenient: factory.namedNode(NAMESPACE + 'lenient'),

    // Object
    ObjectShape: factory.namedNode(NAMESPACE + 'ObjectShape'),
    typeProperty: factory.namedNode(NAMESPACE + 'typeProperty'),
    property: factory.namedNode(NAMESPACE + 'property'),

    // ObjectProperty
    ObjectProperty: factory.namedNode(NAMESPACE + 'ObjectProperty'),
    PathSequence: factory.namedNode(NAMESPACE + 'PathSequence'),
    PathElement: factory.namedNode(NAMESPACE + 'PathElement'),
    PathExpression: factory.namedNode(NAMESPACE + 'PathExpression'),
    PathSegment: factory.namedNode(NAMESPACE + 'PathSegment'),
    name: factory.namedNode(NAMESPACE + 'name'),
    shape: factory.namedNode(NAMESPACE + 'shape'),
    path: factory.namedNode(NAMESPACE + 'path'),
    operator: factory.namedNode(NAMESPACE + 'operator'),
    predicate: factory.namedNode(NAMESPACE + 'predicate'),

    // Resource and Literal
    ResourceShape: factory.namedNode(NAMESPACE + 'ResourceShape'),
    LiteralShape: factory.namedNode(NAMESPACE + 'LiteralShape'),
    termDatatype: factory.namedNode(NAMESPACE + 'termDatatype'),
    termLanguage: factory.namedNode(NAMESPACE + 'termLanguage'),
    termValue: factory.namedNode(NAMESPACE + 'termValue'),
    keepAsTerm: factory.namedNode(NAMESPACE + 'keepAsTerm'),

    // Union
    UnionShape: factory.namedNode(NAMESPACE + 'UnionShape'),
    variant: factory.namedNode(NAMESPACE + 'variant'),

    // Optional and Set
    OptionalShape: factory.namedNode(NAMESPACE + 'OptionalShape'),
    SetShape: factory.namedNode(NAMESPACE + 'SetShape'),
    item: factory.namedNode(NAMESPACE + 'item'),

    // List; also uses "item"
    ListShape: factory.namedNode(NAMESPACE + 'ListShape'),
    headPath: factory.namedNode(NAMESPACE + 'headPath'),
    tailPath: factory.namedNode(NAMESPACE + 'tailPath'),
    nil: factory.namedNode(NAMESPACE + 'nil'),

    // Map; also uses "item"
    MapShape: factory.namedNode(NAMESPACE + 'MapShape'),
    mapKey: factory.namedNode(NAMESPACE + 'mapKey'),
    mapValue: factory.namedNode(NAMESPACE + 'mapValue'),

    // ShapeReference
    ShapeReference: factory.namedNode(NAMESPACE + 'ShapeReference'),
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
