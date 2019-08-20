import { join } from 'path';
import * as SparqlJs from 'sparqljs';
import * as Ramp from '../../src/index';
import { readQuadsFromTurtle } from '../util';

const shapes = Ramp.frameShapes(Ramp.Rdf.dataset(
  readQuadsFromTurtle(join(__dirname, 'recursive-shapes.ttl'))
));

const PREFIXES: { [prefix: string]: string } = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  ex: 'http://example.com/schema',
  ramp: Ramp.vocabulary.NAMESPACE,
};

const query = Ramp.generateQuery({
  rootShape: Ramp.Rdf.namedNode(PREFIXES.ex + 'Selector'),
  shapes,
  prefixes: PREFIXES,
});

const generator = new SparqlJs.Generator();
const queryString = generator.stringify(query);
console.log(queryString);
