import { join } from 'path';
import * as SparqlJs from 'sparqljs';
import * as Ram from '../../src/index';
import { toJson, readTriplesFromTurtle, triplesToTurtleString } from '../util';

const triples = readTriplesFromTurtle(join(__dirname, 'recursive-shapes.ttl'));
const shapes = Ram.frameShapes(triples);

const PREFIXES: { [prefix: string]: string } = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  ex: 'http://example.com/schema',
  ram: Ram.vocabulary.NAMESPACE,
};

const query = Ram.generateQuery({
  rootShape: Ram.Rdf.namedNode(PREFIXES['ex'] + 'Selector'),
  shapes: shapes,
  prefixes: PREFIXES,
});

const generator = new SparqlJs.Generator();
const queryString = generator.stringify(query);
console.log(queryString);
