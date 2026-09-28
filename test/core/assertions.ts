import * as Ramp from '../../src/index.js';

import { structurallySame } from './compare.js';

export type TestResult = TestSuccess | TestFailure;

export interface TestSuccess {
  readonly type: 'success';
  readonly testCaseName?: string;
}

export interface TestFailure {
  readonly type: 'failure';
  readonly testCaseName?: string;
  readonly message: string;
  readonly error?: unknown;
  readonly expected?: unknown;
  readonly given?: unknown;
}

export interface ExpectedError {
  readonly code: Ramp.ErrorCode;
  readonly stack?: ReadonlyArray<ExpectedStackFrame>;
}

interface ExpectedStackFrame {
  readonly edge?: Ramp.PropertyPath | string | number;
  readonly shape: string | { type: Ramp.Shape['type'] };
  readonly focus?: string;
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

export function assertEqualStructural(given: unknown, expected: unknown, message?: string): void {
  if (!structurallySame(given, expected)) {
    throw new AssertEqualError({message, expected, given});
  }
}

export function rampStackToTestStack(stack: ReadonlyArray<Ramp.StackFrame>) {
  return stack.map((frame): ExpectedStackFrame => ({
    edge: frame.edge,
    shape: frame.shape.id.termType === 'NamedNode'
      ? frame.shape.id.value
      : {type: frame.shape.type},
    focus: frame.focus
      ? (frame.focus.termType === 'BlankNode' ? '_:blank' : Ramp.termToString(frame.focus))
      : undefined,
  }));
}
