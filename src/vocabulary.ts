import * as Rdf from './rdf-model';

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
  export const ListShape = Rdf.namedNode(NAMESPACE + 'ListShape');
  export const LiteralShape = Rdf.namedNode(NAMESPACE + 'LiteralShape');
  export const MapShape = Rdf.namedNode(NAMESPACE + 'MapShape');
  export const ObjectShape = Rdf.namedNode(NAMESPACE + 'ObjectShape');
  export const ObjectProperty = Rdf.namedNode(NAMESPACE + 'ObjectProperty');
  export const OptionalShape = Rdf.namedNode(NAMESPACE + 'OptionalShape');
  export const PropertyPathSegment = Rdf.namedNode(NAMESPACE + 'PropertyPathSegment');
  export const ResourceShape = Rdf.namedNode(NAMESPACE + 'ResourceShape');
  export const ShapeReference = Rdf.namedNode(NAMESPACE + 'ShapeReference');
  export const SetShape = Rdf.namedNode(NAMESPACE + 'SetShape');
  export const Shape = Rdf.namedNode(NAMESPACE + 'Shape');
  export const ShapeID = Rdf.namedNode(NAMESPACE + 'ShapeID');
  export const UnionShape = Rdf.namedNode(NAMESPACE + 'UnionShape');
  export const headPath = Rdf.namedNode(NAMESPACE + 'headPath');
  export const inverse = Rdf.namedNode(NAMESPACE + 'inverse');
  export const item = Rdf.namedNode(NAMESPACE + 'item');
  export const keepAsTerm = Rdf.namedNode(NAMESPACE + 'keepAsTerm');
  export const key = Rdf.namedNode(NAMESPACE + 'key');
  export const name = Rdf.namedNode(NAMESPACE + 'name');
  export const nil = Rdf.namedNode(NAMESPACE + 'nil');
  export const tailPath = Rdf.namedNode(NAMESPACE + 'tailPath');
  export const termDatatype = Rdf.namedNode(NAMESPACE + 'termDatatype');
  export const termLanguage = Rdf.namedNode(NAMESPACE + 'termLanguage');
  export const termPart = Rdf.namedNode(NAMESPACE + 'termPart');
  export const termValue = Rdf.namedNode(NAMESPACE + 'termValue');
  export const typeProperty = Rdf.namedNode(NAMESPACE + 'typeProperty');
  export const path = Rdf.namedNode(NAMESPACE + 'path');
  export const predicate = Rdf.namedNode(NAMESPACE + 'predicate');
  export const property = Rdf.namedNode(NAMESPACE + 'property');
  export const shape = Rdf.namedNode(NAMESPACE + 'shape');
  export const variant = Rdf.namedNode(NAMESPACE + 'variant');
}
