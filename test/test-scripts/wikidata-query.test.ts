import path from 'node:path';
import * as SparqlJs from 'sparqljs';

import * as Ramp from '../../src/index.js';

import { assertEqual } from '../core/assertions.js';
import { SequentialDataFactory, readTurtle, readQuery } from '../core/data-util.js';
import { TestScriptContext } from '../core/test-script-context.js';

const factory = Ramp.DefaultDataFactory;

export default (context: TestScriptContext): void => {
  context.defineCase('wikidata-query/generate-with-filter', () => {
    const shapeQuads = readTurtle(
      path.join(import.meta.dirname, '../../test-data/shapes/wikidata-people.ttl'),
      new SequentialDataFactory(factory)
    ).quads;
    const shapes = Ramp.frameShapes(Ramp.dataset(shapeQuads));
    const alexanderShape = shapes.find(
      s => s.id.value === 'http://www.wikidata.org/entity/Q120180'
    )!;

    let expectedQueryAst: SparqlJs.SparqlQuery;
    try {
      expectedQueryAst = readQuery(
        path.join(import.meta.dirname, './wikidata-query-with-filter.sparql')
      );
    } catch (err) {
      throw new Error('Failed to read expected query', {cause: err});
    }

    const generatedQueryAst = Ramp.generateQuery({
      shape: alexanderShape,
      prefixes: expectedQueryAst.prefixes,
      onEmitShape: e => {
        // Add FILTER(LANG(?var) = "en") to fetch only english labels
        if (e.subject.termType === 'Variable' && e.shape.type === 'literal' && e.shape.language) {
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

    const generatedQuery = new SparqlJs.Generator().stringify(generatedQueryAst);
    const expectedQuery = new SparqlJs.Generator().stringify(expectedQueryAst);
    assertEqual(generatedQuery, expectedQuery, 'Expected to correctly generate query');
  });
};
