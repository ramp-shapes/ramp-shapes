import { TestScriptContext } from './test-script-context';

import builder from './builder.test';

export function registerAllTests(context: TestScriptContext): void {
  builder(context);
}
