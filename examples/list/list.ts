import { join } from 'path';
import * as Ramp from '../../src/index';
import { Rdf, property, inverseProperty, self } from '../../src/index';
import { rdf } from '../namespaces';
import { toJson, readQuadsFromTurtle, quadsToTurtleString } from '../util';

const dataset = Rdf.dataset(readQuadsFromTurtle(join(__dirname, 'list.ttl')));

const schema = new Ramp.ShapeBuilder();

const list = schema.list(schema.resource());

const listOwner = schema.object({
  properties: {
    list: property(Rdf.namedNode('example:hasList'), list)
  }
});

const listOfUnion = schema.object({
  properties: {
    list: property(Rdf.namedNode('example:hasList'), schema.list(
      schema.union([
        schema.constant(Rdf.namedNode('example:b1')),
        schema.constant(Rdf.namedNode('example:b2')),
      ])
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
  for (const {value} of Ramp.frame({rootShape: list, shapes: schema.shapes, dataset})) {
    console.log('FRAME list', toJson(value));
    const triples = Ramp.flatten({value, rootShape: list, shapes: schema.shapes});
    console.log('FLATTEN:\n', await quadsToTurtleString(triples, PREFIXES));
  }

  for (const {value} of Ramp.frame({rootShape: listOwner, shapes: schema.shapes, dataset})) {
    console.log('FRAME list owner', toJson(value));
    const triples = Ramp.flatten({value, rootShape: listOwner, shapes: schema.shapes});
    console.log('FLATTEN:\n', await quadsToTurtleString(triples, PREFIXES));
  }

  for (const {value} of Ramp.frame({rootShape: listOfUnion, shapes: schema.shapes, dataset})) {
    console.log('FRAME list of union', toJson(value));
    const triples = Ramp.flatten({value, rootShape: listOfUnion, shapes: schema.shapes});
    console.log('FLATTEN:\n', await quadsToTurtleString(triples, PREFIXES));
  }

  for (const {value} of Ramp.frame({rootShape: listSelf, shapes: schema.shapes, dataset})) {
    console.log('FRAME list self', toJson(value));
    const triples = Ramp.flatten({value, rootShape: listSelf, shapes: schema.shapes});
    console.log('FLATTEN:\n', await quadsToTurtleString(triples, PREFIXES));
  }
})();
