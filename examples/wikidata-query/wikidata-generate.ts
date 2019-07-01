import * as SparqlJs from 'sparqljs';
import * as Ram from '../../src/index';
import { Shapes, AlexanderTheThirdDescendants, Prefixes } from './wikidata-common';

const query = Ram.generateQuery({
  rootShape: AlexanderTheThirdDescendants,
  shapes: Shapes,
  prefixes: Prefixes,
  unstable_onEmit: (shape, subject, out) => {
    // Add FILTER(LANG(?var) = "en") to fetch only english labels
    if (shape.type === 'literal') {
      out.push({
        type: 'filter',
        expression: {
          type: 'operation',
          operator: '=',
          args: [
            {
              type: 'operation',
              operator: 'lang',
              args: [subject],
            },
            '"en"' as SparqlJs.Term
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
