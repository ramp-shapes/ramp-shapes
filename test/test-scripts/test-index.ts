import { TestScriptContext } from './test-script-context.js';

import builder from './builder.test.js';

export function registerAllTests(context: TestScriptContext): void {
  builder(context);
}
