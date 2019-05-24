import * as SparqlJs from 'sparqljs';
import * as Ram from '../../src/index';
import { Shapes, PeterTheGreatShape, Prefixes } from './wikidata-common';

const query = Ram.generateQuery({
  rootShape: PeterTheGreatShape.id,
  shapes: Shapes,
  prefixes: Prefixes,
});

const generator = new SparqlJs.Generator();
const queryString = generator.stringify(query);
console.log(queryString);
console.log(
  '# NOTE: Add FILTER(lang(?var) = "en") to fetch only english labels'
);
