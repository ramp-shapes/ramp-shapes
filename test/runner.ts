import path from 'path';

import * as Ramp from '../src/index';
import { readQuadsFromTurtle, findFirstShape } from './util';

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
  readonly edge?: string | number;
  readonly shape: string | { type: Ramp.Shape['type'] };
  readonly focus?: string;
}

export type TestFailureError = Error & {
  testFailure: TestFailure;
};

export function makeFailureError(failure: TestFailure): TestFailureError {
  const error = new Error(failure.message) as TestFailureError;
  error.testFailure = failure;
  return error;
}

export function readTestShapes(name: string, root?: Ramp.ShapeID): Ramp.Shape {
  let shapeQuads: Ramp.Rdf.Quad[];
  let shapes: Ramp.Shape[];
  try {
    shapeQuads = readQuadsFromTurtle(
      path.join('test-data', 'shapes', `${name}.ttl`)
    );
    shapes = Ramp.frameShapes(Ramp.Rdf.dataset(shapeQuads));
  } catch (error) {
    throw makeFailureError({
      type: 'failure',
      message: 'Failed to read test shapes',
      error,
    });
  }

  const rootShape = root
    ? shapes.find(shape => Ramp.Rdf.equalTerms(shape.id, root))
    : findFirstShape(shapeQuads, shapes);

  if (!rootShape) {
    throw makeFailureError({
      type: 'failure',
      message: root
        ? `Failed to find root shape ${Ramp.Rdf.toString(root)}`
        : `Failed to find root shape (should be the first one)`,
    });
  }

  return rootShape;
}

export function readTestGraph(relativePath: string): Ramp.Rdf.Dataset {
  try {
    return Ramp.Rdf.dataset(readQuadsFromTurtle(
      path.join('test-data', relativePath)
    ));
  } catch (error) {
    throw makeFailureError({
      type: 'failure',
      message: 'Failed to read test graph',
      error,
    });
  }
}

export function rampStackToTestStack(stack: ReadonlyArray<Ramp.StackFrame>) {
  return stack.map((frame): ExpectedStackFrame => ({
    edge: frame.edge,
    shape: frame.shape.id.termType === 'NamedNode'
      ? frame.shape.id.value
      : {type: frame.shape.type},
    focus: frame.focus
      ? (frame.focus.termType === 'BlankNode' ? '_:blank' : Ramp.Rdf.toString(frame.focus))
      : undefined,
  }));
}
