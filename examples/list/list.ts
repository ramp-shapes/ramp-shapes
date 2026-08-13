import path from 'node:path';

import * as Ramp from '../../src/index.js';
import { rdf } from '../namespaces.js';
import { toJson, readQuadsFromTurtle, quadsToTurtleString } from '../util.js';

const factory = Ramp.DefaultDataFactory;
const dataset = Ramp.dataset(readQuadsFromTurtle(
  path.join(import.meta.dirname, 'list.ttl')
));

const schema = new Ramp.ShapeBuilder();

const list = schema.list(schema.resource());

const listOwner = schema.record({
  properties: {
    list: Ramp.property(factory.namedNode('example:hasList'), list)
  }
});

const listOfUnion = schema.record({
  properties: {
    list: Ramp.property(factory.namedNode('example:hasList'), schema.list(
      schema.anyOf([
        schema.constant(factory.namedNode('example:b1')),
        schema.constant(factory.namedNode('example:b2')),
      ])
    ))
  }
});

const listSelf = schema.record({
  properties: {
    owner: Ramp.inverseProperty(factory.namedNode('example:hasList'), schema.resource()),
    list: Ramp.self(list),
    rest: Ramp.property(rdf.rest, list),
    restAsIri: Ramp.property(rdf.rest, schema.resource()),
  }
});

const PREFIXES = {
  rdf: rdf.NAMESPACE,
};

void (async function main() {
  const listShape = schema.getShape(list)!;
  for (const {value} of Ramp.frame({shape: listShape, dataset})) {
    console.log('FRAME list', toJson(value));
    const triples = Ramp.flatten({value, shape: listShape});
    console.log('FLATTEN:\n', await quadsToTurtleString(triples, PREFIXES));
  }

  const listOwnerShape = schema.getShape(listOwner)!;
  for (const {value} of Ramp.frame({shape: listOwnerShape, dataset})) {
    console.log('FRAME list owner', toJson(value));
    const triples = Ramp.flatten({value, shape: listOwnerShape});
    console.log('FLATTEN:\n', await quadsToTurtleString(triples, PREFIXES));
  }

  const listOfUnionShape = schema.getShape(listOfUnion)!;
  for (const {value} of Ramp.frame({shape: listOfUnionShape, dataset})) {
    console.log('FRAME list of union', toJson(value));
    const triples = Ramp.flatten({value, shape: listOfUnionShape});
    console.log('FLATTEN:\n', await quadsToTurtleString(triples, PREFIXES));
  }

  const listSelfShape = schema.getShape(listSelf)!;
  for (const {value} of Ramp.frame({shape: listSelfShape, dataset})) {
    console.log('FRAME list self', toJson(value));
    const triples = Ramp.flatten({value, shape: listSelfShape});
    console.log('FLATTEN:\n', await quadsToTurtleString(triples, PREFIXES));
  }
})();
