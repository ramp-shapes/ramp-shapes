import { TestScriptContext } from '../core/test-script-context.js';

import annotation from './annotation.test.js';
import builder from './builder.test.js';
import frameShapes from './frame-shapes.test.js';
import shapesForShapes from './shapes-for-shapes.test.js';
import wikidataQuery from './wikidata-query.test.js';

export function registerAllTests(context: TestScriptContext): void {
  annotation(context);
  builder(context);
  frameShapes(context);
  shapesForShapes(context);
  wikidataQuery(context);
}
