import { join } from 'path';
import * as Ramp from '../../src/index';
import { readQuadsFromTurtle } from '../util';

const factory = Ramp.Rdf.DefaultDataFactory;
const wikidataShapes = Ramp.frameShapes(Ramp.Rdf.dataset(
  readQuadsFromTurtle(join(__dirname, 'wikidata-shapes.ttl'))
));

export const Prefixes: { [prefix: string]: string } = {
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  wd: 'http://www.wikidata.org/entity/',
  wdt: 'http://www.wikidata.org/prop/direct/',
};
export namespace vocab {
  export const wd = (s: string) => factory.namedNode(Prefixes.wd + s);
}

const schema = new Ramp.ShapeBuilder();
schema.addAll(wikidataShapes);

const AlexanderTheThird = vocab.wd('Q120180');
schema.record({
  id: AlexanderTheThird,
  typeProperties: {
    target: Ramp.self(schema.constant(AlexanderTheThird))
  },
  properties: {
    result: Ramp.self(vocab.wd('Q5'))
  }
});

export const AlexanderTheThirdDescendants = schema.shapes.get(AlexanderTheThird)!;
