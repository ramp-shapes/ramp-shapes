import * as Rdf from './rdf';

export namespace rdf {
  export const NAMESPACE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  export const first = Rdf.namedNode(NAMESPACE + 'first');
  export const langString = Rdf.namedNode(NAMESPACE + 'langString');
  export const nil = Rdf.namedNode(NAMESPACE + 'nil');
  export const rest = Rdf.namedNode(NAMESPACE + 'rest');
  export const type = Rdf.namedNode(NAMESPACE + 'type');
}

export namespace xsd {
  export const NAMESPACE = 'http://www.w3.org/2001/XMLSchema#';
  export const string = Rdf.namedNode(NAMESPACE + 'string');
  export const boolean = Rdf.namedNode(NAMESPACE + 'boolean');
  export const integer = Rdf.namedNode(NAMESPACE + 'integer');
  export const double = Rdf.namedNode(NAMESPACE + 'double');
  export const decimal = Rdf.namedNode(NAMESPACE + 'decimal');
  export const nonNegativeInteger = Rdf.namedNode(NAMESPACE + 'nonNegativeInteger');
  export const dateTime = Rdf.namedNode(NAMESPACE + 'dateTime');
}

export namespace ram {
  export const NAMESPACE = 'http://ram-shapes.github.io/schema#';

  export const Shape = Rdf.namedNode(NAMESPACE + 'Shape');
  export const ShapeID = Rdf.namedNode(NAMESPACE + 'ShapeID');

  // Object
  export const ObjectShape = Rdf.namedNode(NAMESPACE + 'ObjectShape');
  export const typeProperty = Rdf.namedNode(NAMESPACE + 'typeProperty');
  export const property = Rdf.namedNode(NAMESPACE + 'property');

  // ObjectProperty
  export const ObjectProperty = Rdf.namedNode(NAMESPACE + 'ObjectProperty');
  export const PropertyPathSegment = Rdf.namedNode(NAMESPACE + 'PropertyPathSegment');
  export const name = Rdf.namedNode(NAMESPACE + 'name');
  export const shape = Rdf.namedNode(NAMESPACE + 'shape');
  export const path = Rdf.namedNode(NAMESPACE + 'path');
  export const predicate = Rdf.namedNode(NAMESPACE + 'predicate');
  export const inverse = Rdf.namedNode(NAMESPACE + 'inverse');

  // Resource and Literal
  export const ResourceShape = Rdf.namedNode(NAMESPACE + 'ResourceShape');
  export const LiteralShape = Rdf.namedNode(NAMESPACE + 'LiteralShape');
  export const termDatatype = Rdf.namedNode(NAMESPACE + 'termDatatype');
  export const termLanguage = Rdf.namedNode(NAMESPACE + 'termLanguage');
  export const termValue = Rdf.namedNode(NAMESPACE + 'termValue');
  export const keepAsTerm = Rdf.namedNode(NAMESPACE + 'keepAsTerm');

  // Union
  export const UnionShape = Rdf.namedNode(NAMESPACE + 'UnionShape');
  export const variant = Rdf.namedNode(NAMESPACE + 'variant');

  // Optional and Set
  export const OptionalShape = Rdf.namedNode(NAMESPACE + 'OptionalShape');
  export const SetShape = Rdf.namedNode(NAMESPACE + 'SetShape');
  export const item = Rdf.namedNode(NAMESPACE + 'item');

  // List; also uses "item"
  export const ListShape = Rdf.namedNode(NAMESPACE + 'ListShape');
  export const headPath = Rdf.namedNode(NAMESPACE + 'headPath');
  export const tailPath = Rdf.namedNode(NAMESPACE + 'tailPath');
  export const nil = Rdf.namedNode(NAMESPACE + 'nil');

  // Map; also uses "item"
  export const MapShape = Rdf.namedNode(NAMESPACE + 'MapShape');
  export const mapKey = Rdf.namedNode(NAMESPACE + 'mapKey');
  export const mapValue = Rdf.namedNode(NAMESPACE + 'mapValue');

  // ShapeReference
  export const ShapeReference = Rdf.namedNode(NAMESPACE + 'ShapeReference');
  export const TermDatatype = Rdf.namedNode(NAMESPACE + 'TermDatatype');
  export const TermLanguage = Rdf.namedNode(NAMESPACE + 'TermLanguage');
  export const TermValue = Rdf.namedNode(NAMESPACE + 'TermValue');
  export const termPart = Rdf.namedNode(NAMESPACE + 'termPart');

  // Vocabulary; also uses "termValue"
  export const Vocabulary = Rdf.namedNode(NAMESPACE + 'Vocabulary');
  export const vocabulary = Rdf.namedNode(NAMESPACE + 'vocabulary');
  export const vocabItem = Rdf.namedNode(NAMESPACE + 'vocabItem');
  export const vocabKey = Rdf.namedNode(NAMESPACE + 'vocabKey');
}
