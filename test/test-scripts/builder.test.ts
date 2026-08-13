import * as Ramp from '../../src/index.js';
import { TestScriptContext } from './test-script-context.js';

const factory = Ramp.DefaultDataFactory;

namespace ex {
  const NAMESPACE = 'http://example.com/schema#';
  export const address = Ramp.namespacedNode(factory, NAMESPACE, 'address');
  export const email = Ramp.namespacedNode(factory, NAMESPACE, 'email');
}

namespace xsd {
  export const NAMESPACE = 'http://www.w3.org/2001/XMLSchema#';
  export const string = Ramp.namespacedNode(factory, NAMESPACE, 'string');
  export const boolean = Ramp.namespacedNode(factory, NAMESPACE, 'boolean');
  export const integer = Ramp.namespacedNode(factory, NAMESPACE, 'integer');
  export const double = Ramp.namespacedNode(factory, NAMESPACE, 'double');
  export const decimal = Ramp.namespacedNode(factory, NAMESPACE, 'decimal');
  export const nonNegativeInteger = Ramp.namespacedNode(factory, NAMESPACE, 'nonNegativeInteger');
  export const dateTime = Ramp.namespacedNode(factory, NAMESPACE, 'dateTime');
}

export default (context: TestScriptContext): void => {
  context.defineCase('builder/complex-typed-shape', () => {
    const schema = new Ramp.ShapeBuilder();

    const PersonShape = schema.record({
      properties: {
        id: Ramp.self(schema.resourceTerm()),
        email: Ramp.property(ex.email, schema.optional(
          schema.literal({datatype: xsd.string})
        )),
        addresses: Ramp.property(ex.address, schema.set(
          schema.literal({datatype: xsd.string})
        )),
      }
    });
    type Person = Ramp.UnwrapShape<typeof PersonShape>;

    // test assignability to the typed shape
    const examplePerson: Person = {
      id: factory.blankNode(),
      addresses: [
        'Earth, somewhere on land',
        'Moon, somewhere between rocks'
      ]
    };
  });

  context.skipCase('builder/typed-frame-match', () => {
    // TODO: implement
  });
};
