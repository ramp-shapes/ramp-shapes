export interface TestScriptContext {
  defineCase(name: string, body: () => void | Promise<void>): void;
  skipCase(name: string, body: () => void | Promise<void>): void;
  // readTestShape(bundleName: string, id: Ramp.ShapeID): Ramp.Shape;
}
