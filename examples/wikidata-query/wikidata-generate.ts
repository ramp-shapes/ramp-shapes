import * as SparqlJs from 'sparqljs';
import * as Ramp from '../../src/index';
import { AlexanderTheThirdDescendants, Prefixes } from './wikidata-common';

const factory = Ramp.Rdf.DefaultDataFactory;

const query = Ramp.generateQuery({
  shape: AlexanderTheThirdDescendants,
  prefixes: Prefixes,
  onEmitShape: e => {
    // Add FILTER(LANG(?var) = "en") to fetch only english labels
    if (e.shape.type === 'literal' && e.shape.language) {
      e.emitPatterns.push({
        type: 'filter',
        expression: {
          type: 'operation',
          operator: '=',
          args: [
            {
              type: 'operation',
              operator: 'lang',
              args: [e.subject],
            },
            factory.literal(e.shape.language)
          ]
        }
      });
    }
  }
});

const generator = new SparqlJs.Generator();
const queryString = generator.stringify(query);

console.log('# Execute the following query at https://query.wikidata.org/');
console.log(queryString);
