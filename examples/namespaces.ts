import { Rdf } from '../src/index';

const factory = Rdf.DefaultDataFactory;

export namespace rdf {
  export const NAMESPACE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  export const type = factory.namedNode(NAMESPACE + 'type');
  export const value = factory.namedNode(NAMESPACE + 'value');
  export const first = factory.namedNode(NAMESPACE + 'first');
  export const rest = factory.namedNode(NAMESPACE + 'rest');
  export const nil = factory.namedNode(NAMESPACE + 'nil');
  export const langString = factory.namedNode(NAMESPACE + 'langString');
}

export namespace rdfs {
  export const NAMESPACE = 'http://www.w3.org/2000/01/rdf-schema#';
  export const label = factory.namedNode(NAMESPACE + 'label');
}

export namespace xsd {
  export const NAMESPACE = 'http://www.w3.org/2001/XMLSchema#';
  export const string = factory.namedNode(NAMESPACE + 'string');
  export const boolean = factory.namedNode(NAMESPACE + 'boolean');
  export const integer = factory.namedNode(NAMESPACE + 'integer');
  export const double = factory.namedNode(NAMESPACE + 'double');
  export const decimal = factory.namedNode(NAMESPACE + 'decimal');
  export const nonNegativeInteger = factory.namedNode(NAMESPACE + 'nonNegativeInteger');
  export const dateTime = factory.namedNode(NAMESPACE + 'dateTime');
}

export namespace oa {
  export const NAMESPACE = 'http://www.w3.org/ns/oa#';
  export const Annotation = factory.namedNode(NAMESPACE + 'Annotation');
  export const RangeSelector = factory.namedNode(NAMESPACE + 'RangeSelector');
  export const XPathSelector = factory.namedNode(NAMESPACE + 'XPathSelector');
  export const hasBody = factory.namedNode(NAMESPACE + 'hasBody');
  export const hasTarget = factory.namedNode(NAMESPACE + 'hasTarget');
  export const hasSource = factory.namedNode(NAMESPACE + 'hasSource');
  export const hasSelector = factory.namedNode(NAMESPACE + 'hasSelector');
  export const hasStartSelector = factory.namedNode(NAMESPACE + 'hasStartSelector');
  export const hasEndSelector = factory.namedNode(NAMESPACE + 'hasEndSelector');
  export const start = factory.namedNode(NAMESPACE + 'start');
  export const end = factory.namedNode(NAMESPACE + 'end');
  export const refinedBy = factory.namedNode(NAMESPACE + 'refinedBy');
}
