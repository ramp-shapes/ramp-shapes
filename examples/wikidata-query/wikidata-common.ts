import { join } from 'path';
import * as Ram from '../../src/index';
import { readTriplesFromTurtle } from '../util';

const triples = readTriplesFromTurtle(join(__dirname, 'wikidata-shapes.ttl'));
const shapes = Ram.frameShapes(triples);

export const Prefixes: { [prefix: string]: string } = {
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  wd: 'http://www.wikidata.org/entity/',
  wdt: 'http://www.wikidata.org/prop/direct/',
};
export namespace vocab {
  export const wd = (s: string) => Ram.Rdf.namedNode(Prefixes['wd'] + s);
}

const humanShape = shapes.find(s => Ram.Rdf.equals(s.id, vocab.wd('Q5')));
if (!(humanShape && humanShape.type === 'object')) {
  throw new Error('Cannot find Human object shape');
}

const peterTheGreatIriShape: Ram.ResourceShape = {
  id: vocab.wd('Q8479_iri'),
  type: 'resource',
  value: vocab.wd('Q8479'),
};
export const PeterTheGreatShape: Ram.ObjectShape = {
  id: vocab.wd('Q8479'),
  type: 'object',
  typeProperties: [
    ...humanShape.typeProperties,
    {
      name: "iri",
      path: [],
      valueShape: peterTheGreatIriShape.id,
    },
  ],
  properties: humanShape.properties.filter(p => p.name !== 'iri'),
};

export const Shapes = [
  ...shapes,
  PeterTheGreatShape,
  peterTheGreatIriShape,
];
