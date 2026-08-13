import * as Ramp from '../../src/index.js';

export interface TestScriptContext {
  defineCase(name: string, body: () => void): void;
  skipCase(name: string, body: () => void): void;
  // readTestShape(bundleName: string, id: Ramp.ShapeID): Ramp.Shape;
}
