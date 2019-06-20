import { join } from 'path';
import * as Ram from '../../src/index';
import { readQuadsFromTurtle } from '../util';

const wikidataShapes = Ram.frameShapes(Ram.Rdf.dataset(
  readQuadsFromTurtle(join(__dirname, 'wikidata-shapes.ttl'))
));

export const Prefixes: { [prefix: string]: string } = {
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  wd: 'http://www.wikidata.org/entity/',
  wdt: 'http://www.wikidata.org/prop/direct/',
};
export namespace vocab {
  export const wd = (s: string) => Ram.Rdf.namedNode(Prefixes['wd'] + s);
}

const schema = new Ram.ShapeBuilder();
schema.shapes.push(...wikidataShapes);

export const PeterTheGreatDescendants = schema.object({
  id: vocab.wd('Q8479'),
  typeProperties: {
    target: Ram.self(schema.constant(vocab.wd('Q8479')))
  },
  properties: {
    result: Ram.self(vocab.wd('Q5'))
  }
});

export const Shapes = schema.shapes;
