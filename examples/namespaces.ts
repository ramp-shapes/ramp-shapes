import * as Ramp from '../src/index.js';

const factory = Ramp.DefaultDataFactory;

export namespace rdf {
  export const NAMESPACE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  export const type = Ramp.namespacedNode(factory, NAMESPACE, 'type');
  export const value = Ramp.namespacedNode(factory, NAMESPACE, 'value');
  export const first = Ramp.namespacedNode(factory, NAMESPACE, 'first');
  export const rest = Ramp.namespacedNode(factory, NAMESPACE, 'rest');
  export const nil = Ramp.namespacedNode(factory, NAMESPACE, 'nil');
  export const langString = Ramp.namespacedNode(factory, NAMESPACE, 'langString');
}

export namespace xsd {
  export const NAMESPACE = 'http://www.w3.org/2001/XMLSchema#';
  export const string = Ramp.namespacedNode(factory, NAMESPACE, 'string');
  export const boolean = Ramp.namespacedNode(factory, NAMESPACE, 'boolean');
  export const integer = Ramp.namespacedNode(factory, NAMESPACE, 'integer');
  export const double = Ramp.namespacedNode(factory, NAMESPACE, 'double');
  export const decimal = Ramp.namespacedNode(factory, NAMESPACE, 'decimal');
  export const nonNegativeInteger = Ramp.namespacedNode(factory, NAMESPACE, 'nonNegativeInteger');
  export const dateTime = Ramp.namespacedNode(factory, NAMESPACE, 'dateTime');
}
