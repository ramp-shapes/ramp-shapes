import path from 'node:path';

import * as Ramp from '../../src/index.js';
import { readQuadsFromTurtle } from '../util.js';

const factory = Ramp.DefaultDataFactory;
const wikidataShapes = Ramp.frameShapes(Ramp.dataset(
  readQuadsFromTurtle(path.join(import.meta.dirname, 'wikidata-shapes.ttl'))
));

export const Prefixes = {
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  wd: 'http://www.wikidata.org/entity/',
  wdt: 'http://www.wikidata.org/prop/direct/',
} as const;

const schema = new Ramp.ShapeBuilder();
schema.addAll(wikidataShapes);

const WdAlexanderTheThird = Ramp.namespacedNode(factory, Prefixes.wd, 'Q120180');
const WdPerson = Ramp.namespacedNode(factory, Prefixes.wd, 'Q5');

const AlexanderTheThird = schema.record({
  id: WdAlexanderTheThird,
  properties: {
    target: Ramp.definesType(
      Ramp.self(schema.constant(WdAlexanderTheThird))
    ),
    result: Ramp.self(Ramp.typedShapeID(WdPerson))
  }
});

export const AlexanderTheThirdDescendants = schema.getShape(AlexanderTheThird)!;
