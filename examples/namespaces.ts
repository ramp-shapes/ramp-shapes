import { Rdf } from '../src/index';

const factory = Rdf.DefaultDataFactory;

export namespace rdf {
  export const NAMESPACE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  export const type = Rdf.namespacedNode(factory, NAMESPACE, 'type');
  export const value = Rdf.namespacedNode(factory, NAMESPACE, 'value');
  export const first = Rdf.namespacedNode(factory, NAMESPACE, 'first');
  export const rest = Rdf.namespacedNode(factory, NAMESPACE, 'rest');
  export const nil = Rdf.namespacedNode(factory, NAMESPACE, 'nil');
  export const langString = Rdf.namespacedNode(factory, NAMESPACE, 'langString');
}

export namespace rdfs {
  export const NAMESPACE = 'http://www.w3.org/2000/01/rdf-schema#';
  export const label = Rdf.namespacedNode(factory, NAMESPACE, 'label');
}

export namespace xsd {
  export const NAMESPACE = 'http://www.w3.org/2001/XMLSchema#';
  export const string = Rdf.namespacedNode(factory, NAMESPACE, 'string');
  export const boolean = Rdf.namespacedNode(factory, NAMESPACE, 'boolean');
  export const integer = Rdf.namespacedNode(factory, NAMESPACE, 'integer');
  export const double = Rdf.namespacedNode(factory, NAMESPACE, 'double');
  export const decimal = Rdf.namespacedNode(factory, NAMESPACE, 'decimal');
  export const nonNegativeInteger = Rdf.namespacedNode(factory, NAMESPACE, 'nonNegativeInteger');
  export const dateTime = Rdf.namespacedNode(factory, NAMESPACE, 'dateTime');
}

export namespace oa {
  export const NAMESPACE = 'http://www.w3.org/ns/oa#';
  export const Annotation = Rdf.namespacedNode(factory, NAMESPACE, 'Annotation');
  export const RangeSelector = Rdf.namespacedNode(factory, NAMESPACE, 'RangeSelector');
  export const XPathSelector = Rdf.namespacedNode(factory, NAMESPACE, 'XPathSelector');
  export const hasBody = Rdf.namespacedNode(factory, NAMESPACE, 'hasBody');
  export const hasTarget = Rdf.namespacedNode(factory, NAMESPACE, 'hasTarget');
  export const hasSource = Rdf.namespacedNode(factory, NAMESPACE, 'hasSource');
  export const hasSelector = Rdf.namespacedNode(factory, NAMESPACE, 'hasSelector');
  export const hasStartSelector = Rdf.namespacedNode(factory, NAMESPACE, 'hasStartSelector');
  export const hasEndSelector = Rdf.namespacedNode(factory, NAMESPACE, 'hasEndSelector');
  export const start = Rdf.namespacedNode(factory, NAMESPACE, 'start');
  export const end = Rdf.namespacedNode(factory, NAMESPACE, 'end');
  export const refinedBy = Rdf.namespacedNode(factory, NAMESPACE, 'refinedBy');
}
