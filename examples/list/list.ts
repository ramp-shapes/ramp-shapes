import { join } from 'path';
import * as Ramp from '../../src/index';
import { Rdf, property, inverseProperty, self } from '../../src/index';
import { rdf } from '../namespaces';
import { toJson, readQuadsFromTurtle, quadsToTurtleString } from '../util';

const factory = Rdf.DefaultDataFactory;
const dataset = Rdf.dataset(readQuadsFromTurtle(join(__dirname, 'list.ttl')));

const schema = new Ramp.ShapeBuilder();

const list = schema.list(schema.resource());

const listOwner = schema.object({
  properties: {
    list: property(factory.namedNode('example:hasList'), list)
  }
});

const listOfUnion = schema.object({
  properties: {
    list: property(factory.namedNode('example:hasList'), schema.list(
      schema.union([
        schema.constant(factory.namedNode('example:b1')),
        schema.constant(factory.namedNode('example:b2')),
      ])
    ))
  }
});

const listSelf = schema.object({
  properties: {
    owner: inverseProperty(factory.namedNode('example:hasList'), schema.resource()),
    list: self(list),
    rest: property(rdf.rest, list),
    restAsIri: property(rdf.rest, schema.resource()),
  }
});

const PREFIXES = {
  rdf: rdf.NAMESPACE,
};

(async function main() {
  const listShape = schema.shapes.get(list)!;
  for (const {value} of Ramp.frame({shape: listShape, dataset})) {
    console.log('FRAME list', toJson(value));
    const triples = Ramp.flatten({value, shape: listShape});
    console.log('FLATTEN:\n', await quadsToTurtleString(triples, PREFIXES));
  }

  const listOwnerShape = schema.shapes.get(listOwner)!;
  for (const {value} of Ramp.frame({shape: listOwnerShape, dataset})) {
    console.log('FRAME list owner', toJson(value));
    const triples = Ramp.flatten({value, shape: listOwnerShape});
    console.log('FLATTEN:\n', await quadsToTurtleString(triples, PREFIXES));
  }

  const listOfUnionShape = schema.shapes.get(listOfUnion)!;
  for (const {value} of Ramp.frame({shape: listOfUnionShape, dataset})) {
    console.log('FRAME list of union', toJson(value));
    const triples = Ramp.flatten({value, shape: listOfUnionShape});
    console.log('FLATTEN:\n', await quadsToTurtleString(triples, PREFIXES));
  }

  const listSelfShape = schema.shapes.get(listSelf)!;
  for (const {value} of Ramp.frame({shape: listSelfShape, dataset})) {
    console.log('FRAME list self', toJson(value));
    const triples = Ramp.flatten({value, shape: listSelfShape});
    console.log('FLATTEN:\n', await quadsToTurtleString(triples, PREFIXES));
  }
})();
