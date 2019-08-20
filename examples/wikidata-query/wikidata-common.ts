import { join } from 'path';
import * as Ramp from '../../src/index';
import { readQuadsFromTurtle } from '../util';

const wikidataShapes = Ramp.frameShapes(Ramp.Rdf.dataset(
  readQuadsFromTurtle(join(__dirname, 'wikidata-shapes.ttl'))
));

export const Prefixes: { [prefix: string]: string } = {
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  wd: 'http://www.wikidata.org/entity/',
  wdt: 'http://www.wikidata.org/prop/direct/',
};
export namespace vocab {
  export const wd = (s: string) => Ramp.Rdf.namedNode(Prefixes.wd + s);
}

const schema = new Ramp.ShapeBuilder();
schema.shapes.push(...wikidataShapes);

export const AlexanderTheThirdDescendants = schema.object({
  id: vocab.wd('Q120180'),
  typeProperties: {
    target: Ramp.self(schema.constant(vocab.wd('Q120180')))
  },
  properties: {
    result: Ramp.self(vocab.wd('Q5'))
  }
});

export const Shapes = schema.shapes;
