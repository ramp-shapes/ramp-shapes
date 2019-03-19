import { Rdf } from '../src/index';

export namespace rdf {
  export const NAMESPACE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  export const type = Rdf.iri(NAMESPACE + 'type');
  export const value = Rdf.iri(NAMESPACE + 'value');
  export const first = Rdf.iri(NAMESPACE + 'first');
  export const rest = Rdf.iri(NAMESPACE + 'rest');
  export const nil = Rdf.iri(NAMESPACE + 'nil');
}

export namespace rdfs {
  export const NAMESPACE = 'http://www.w3.org/2000/01/rdf-schema#';
  export const label = Rdf.iri(NAMESPACE + 'label');
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

export namespace oa {
  export const NAMESPACE = 'http://www.w3.org/ns/oa#';
  export const Annotation = Rdf.iri(NAMESPACE + 'Annotation');
  export const RangeSelector = Rdf.iri(NAMESPACE + 'RangeSelector');
  export const XPathSelector = Rdf.iri(NAMESPACE + 'XPathSelector');
  export const hasBody = Rdf.iri(NAMESPACE + 'hasBody');
  export const hasTarget = Rdf.iri(NAMESPACE + 'hasTarget');
  export const hasSource = Rdf.iri(NAMESPACE + 'hasSource');
  export const hasSelector = Rdf.iri(NAMESPACE + 'hasSelector');
  export const hasStartSelector = Rdf.iri(NAMESPACE + 'hasStartSelector');
  export const hasEndSelector = Rdf.iri(NAMESPACE + 'hasEndSelector');
  export const start = Rdf.iri(NAMESPACE + 'start');
  export const end = Rdf.iri(NAMESPACE + 'end');
  export const refinedBy = Rdf.iri(NAMESPACE + 'refinedBy');
}
