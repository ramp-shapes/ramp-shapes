import * as Rdf from './rdf-model';

export namespace rdf {
  export const NAMESPACE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  export const langString = Rdf.namedNode(NAMESPACE + 'langString');
  export const first = Rdf.namedNode(NAMESPACE + 'first');
  export const rest = Rdf.namedNode(NAMESPACE + 'rest');
  export const nil = Rdf.namedNode(NAMESPACE + 'nil');
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
