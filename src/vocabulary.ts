import * as Rdf from './rdf-model';

export namespace rdf {
  export const NAMESPACE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  export const first = Rdf.iri(NAMESPACE + 'first');
  export const rest = Rdf.iri(NAMESPACE + 'rest');
  export const nil = Rdf.iri(NAMESPACE + 'nil');
}

export namespace xsd {
  export const NAMESPACE = 'http://www.w3.org/2001/XMLSchema#';
  export const string = Rdf.iri(NAMESPACE + 'string');
  export const boolean = Rdf.iri(NAMESPACE + 'boolean');
  export const integer = Rdf.iri(NAMESPACE + 'integer');
  export const double = Rdf.iri(NAMESPACE + 'double');
  export const decimal = Rdf.iri(NAMESPACE + 'decimal');
  export const nonNegativeInteger = Rdf.iri(NAMESPACE + 'nonNegativeInteger');
  export const dateTime = Rdf.iri(NAMESPACE + 'dateTime');
}
