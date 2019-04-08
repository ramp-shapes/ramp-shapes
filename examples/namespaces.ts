import { Rdf } from '../src/index';

export namespace rdf {
  export const NAMESPACE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  export const type = Rdf.namedNode(NAMESPACE + 'type');
  export const value = Rdf.namedNode(NAMESPACE + 'value');
  export const first = Rdf.namedNode(NAMESPACE + 'first');
  export const rest = Rdf.namedNode(NAMESPACE + 'rest');
  export const nil = Rdf.namedNode(NAMESPACE + 'nil');
}

export namespace rdfs {
  export const NAMESPACE = 'http://www.w3.org/2000/01/rdf-schema#';
  export const label = Rdf.namedNode(NAMESPACE + 'label');
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

export namespace oa {
  export const NAMESPACE = 'http://www.w3.org/ns/oa#';
  export const Annotation = Rdf.namedNode(NAMESPACE + 'Annotation');
  export const RangeSelector = Rdf.namedNode(NAMESPACE + 'RangeSelector');
  export const XPathSelector = Rdf.namedNode(NAMESPACE + 'XPathSelector');
  export const hasBody = Rdf.namedNode(NAMESPACE + 'hasBody');
  export const hasTarget = Rdf.namedNode(NAMESPACE + 'hasTarget');
  export const hasSource = Rdf.namedNode(NAMESPACE + 'hasSource');
  export const hasSelector = Rdf.namedNode(NAMESPACE + 'hasSelector');
  export const hasStartSelector = Rdf.namedNode(NAMESPACE + 'hasStartSelector');
  export const hasEndSelector = Rdf.namedNode(NAMESPACE + 'hasEndSelector');
  export const start = Rdf.namedNode(NAMESPACE + 'start');
  export const end = Rdf.namedNode(NAMESPACE + 'end');
  export const refinedBy = Rdf.namedNode(NAMESPACE + 'refinedBy');
}
