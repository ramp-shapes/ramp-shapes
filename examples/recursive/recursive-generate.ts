import { join } from 'path';
import * as SparqlJs from 'sparqljs';
import * as Ram from '../../src/index';
import { readQuadsFromTurtle } from '../util';

const shapes = Ram.frameShapes(Ram.Rdf.dataset(
  readQuadsFromTurtle(join(__dirname, 'recursive-shapes.ttl'))
));

const PREFIXES: { [prefix: string]: string } = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  ex: 'http://example.com/schema',
  ram: Ram.vocabulary.NAMESPACE,
};

const query = Ram.generateQuery({
  rootShape: Ram.Rdf.namedNode(PREFIXES.ex + 'Selector'),
  shapes,
  prefixes: PREFIXES,
});

const generator = new SparqlJs.Generator();
const queryString = generator.stringify(query);
console.log(queryString);
