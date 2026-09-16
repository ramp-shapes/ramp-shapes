import { TestScriptContext } from './test-script-context.js';

import builder from './builder.test.js';
import frameShapes from './frame-shapes.test.js';

export function registerAllTests(context: TestScriptContext): void {
  builder(context);
  frameShapes(context);
}
