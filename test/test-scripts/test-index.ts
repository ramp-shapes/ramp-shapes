import { TestScriptContext } from './test-script-context.js';

import annotation from './annotation.test.js';
import builder from './builder.test.js';
import frameShapes from './frame-shapes.test.js';

export function registerAllTests(context: TestScriptContext): void {
  annotation(context);
  builder(context);
  frameShapes(context);
}
