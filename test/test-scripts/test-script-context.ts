import * as Ramp from '../../src/index.js';

export interface TestScriptContext {
  defineCase(name: string, body: () => void): void;
  skipCase(name: string, body: () => void): void;
  // readTestShape(bundleName: string, id: Ramp.ShapeID): Ramp.Shape;
}

export interface AssertEqualErrorOptions extends ErrorOptions {
  message?: string;
  expected: unknown;
  given: unknown;
}

export class AssertEqualError extends Error {
  readonly expected: unknown;
  readonly given: unknown;

  constructor(
    { message, given, expected, ...rest }: AssertEqualErrorOptions
  ) {
    super(message, rest);
    this.expected = expected;
    this.given = given;
  }
}

export function assertEqual(given: unknown, expected: unknown, message?: string): void {
  if (given !== expected) {
    throw new AssertEqualError({message, expected, given});
  }
}
