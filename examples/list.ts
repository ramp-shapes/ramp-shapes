import { join } from 'path';
import { Rdf, ShapeBuilder, property, inverseProperty, self, lift, lower } from '../src/index';
import { rdf } from './namespaces';
import { toJson, readTriplesFromTurtle, triplesToTurtleString } from './util';

const triples = readTriplesFromTurtle(join(__dirname, 'list.ttl'));

const schema = new ShapeBuilder();

const list = schema.list(schema.resource());

const listOwner = schema.object({
  properties: {
    list: property(Rdf.namedNode('example:hasList'), list)
  }
});

const listOfUnion = schema.object({
  properties: {
    list: property(Rdf.namedNode('example:hasList'), schema.list(
      schema.union(
        schema.constant(Rdf.namedNode('example:b1')),
        schema.constant(Rdf.namedNode('example:b2')),
      )
    ))
  }
});

const listSelf = schema.object({
  properties: {
    owner: inverseProperty(Rdf.namedNode('example:hasList'), schema.resource()),
    list: self(list),
    rest: property(rdf.rest, list),
    restAsIri: property(rdf.rest, schema.resource()),
  }
});

const PREFIXES = {
  rdf: rdf.NAMESPACE,
};

(async function main() {
  for (const {value} of lift({rootShape: list, shapes: schema.shapes, triples})) {
    console.log('LIFT list', toJson(value));
    const triples = lower({value, rootShape: list, shapes: schema.shapes});
    console.log('LOWER:\n', await triplesToTurtleString(triples, PREFIXES));
  }

  for (const {value} of lift({rootShape: listOwner, shapes: schema.shapes, triples})) {
    console.log('LIFT list owner', toJson(value));
    const triples = lower({value, rootShape: listOwner, shapes: schema.shapes});
    console.log('LOWER:\n', await triplesToTurtleString(triples, PREFIXES));
  }

  for (const {value} of lift({rootShape: listOfUnion, shapes: schema.shapes, triples})) {
    console.log('LIFT list of union', toJson(value));
    const triples = lower({value, rootShape: listOfUnion, shapes: schema.shapes});
    console.log('LOWER:\n', await triplesToTurtleString(triples, PREFIXES));
  }

  for (const {value} of lift({rootShape: listSelf, shapes: schema.shapes, triples})) {
    console.log('LIFT list self', toJson(value));
    const triples = lower({value, rootShape: listSelf, shapes: schema.shapes});
    console.log('LOWER:\n', await triplesToTurtleString(triples, PREFIXES));
  }
})();
