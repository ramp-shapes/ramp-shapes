import { join } from 'path';
import { Rdf, ShapeBuilder, property, inverseProperty, self, unifyTriplesToShape } from '../src/index';
import { rdf } from './namespaces';
import { toJson, readTriplesFromTurtle } from './util';

const triples = readTriplesFromTurtle(join(__dirname, 'list.ttl'));

const schema = new ShapeBuilder();

const list = schema.list(schema.node());

const listOwner = schema.object({
  properties: {
    list: property(Rdf.iri('example:hasList'), list)
  }
});

const listOfUnion = schema.object({
  properties: {
    list: property(Rdf.iri('example:hasList'), schema.list(
      schema.union(
        schema.constant(Rdf.iri('example:b1')),
        schema.constant(Rdf.iri('example:b2')),
      )
    ))
  }
});

const listSelf = schema.object({
  properties: {
    owner: inverseProperty(Rdf.iri('example:hasList'), schema.node()),
    list: self(list),
    rest: property(rdf.rest, list),
    restAsIri: property(rdf.rest, schema.node()),
  }
});

for (const {value} of unifyTriplesToShape({rootShape: list, shapes: schema.shapes, triples})) {
  console.log('FOUND list', toJson(value));
}

for (const {value} of unifyTriplesToShape({rootShape: listOwner, shapes: schema.shapes, triples})) {
  console.log('FOUND list owner', toJson(value));
}

for (const {value} of unifyTriplesToShape({rootShape: listOfUnion, shapes: schema.shapes, triples})) {
  console.log('FOUND list of union', toJson(value));
}

for (const {value} of unifyTriplesToShape({rootShape: listSelf, shapes: schema.shapes, triples})) {
  console.log('FOUND list self', toJson(value));
}
