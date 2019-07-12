import path from 'path';

import * as Ram from '../src/index';
import { structurallySame } from './compare';
import { readQuadsFromTurtle, readJson, findFirstShape } from './util';

export interface TestCase {
  readonly type: 'frame' | 'generateQuery';
  readonly name: string;
}
export namespace TestCase {
  export function getFullName(testCase: TestCase): string {
    return `${testCase.type}/${testCase.name}`;
  }
}

export type TestResult = TestSuccess | TestFailure;

export interface TestSuccess {
  readonly type: 'success';
  readonly testCase: TestCase;
}

export interface TestFailure {
  readonly type: 'failure';
  readonly testCase: TestCase;
  readonly message: string;
  readonly error?: unknown;
  readonly expected?: unknown;
  readonly given?: unknown;
}

interface FrameTest {
  readonly shapes: string;
  readonly graph: string;
  readonly matches?: ReadonlyArray<unknown>;
  readonly error?: FrameErrorTest;
}

interface FrameErrorTest {
  readonly code: Ram.ErrorCode;
  readonly stack?: ReadonlyArray<TestStackFrame>;
}

interface TestStackFrame {
  readonly edge?: string | number;
  readonly shape: string | { type: Ram.Shape['type'] };
}

export function runTest(testCase: TestCase): TestResult {
  switch (testCase.type) {
    case 'frame':
      return runFrameTest(testCase);
    case 'generateQuery':
      return runGenerateQueryTest(testCase);
  }
}

function runFrameTest(testCase: TestCase): TestResult {
  let frameTest: FrameTest;
  try {
    frameTest = readJson(
      path.join('test-data', 'frame', `${testCase.name}.json`)
    ) as FrameTest;
  } catch (error) {
    return {
      type: 'failure',
      testCase,
      message: 'Failed to read frame test data',
      error,
    };
  }

  let shapes: Ram.Shape[];
  let rootShape: Ram.ShapeID | undefined;
  try {
    const shapeQuads = readQuadsFromTurtle(
      path.join('test-data', 'shapes', `${frameTest.shapes}.ttl`)
    );
    shapes = Ram.frameShapes(Ram.Rdf.dataset(shapeQuads));
    rootShape = findFirstShape(shapeQuads, shapes);
  } catch (error) {
    return {
      type: 'failure',
      testCase,
      message: 'Failed to read test shapes',
      error,
    };
  }

  if (!rootShape) {
    return {
      type: 'failure',
      testCase,
      message: 'Failed to find root shape (should be the first one)',
    };
  }

  let graph: Ram.Rdf.Dataset;
  try {
    graph = Ram.Rdf.dataset(readQuadsFromTurtle(
      path.join('test-data', 'graph', `${frameTest.graph}.ttl`)
    ));
  } catch (error) {
    return {
      type: 'failure',
      testCase,
      message: 'Failed to read test graph',
      error,
    };
  }

  try {
    const matches = Ram.frame({shapes, rootShape, dataset: graph});
    let matchIndex = 0;
    for (const match of matches) {
      if (!frameTest.matches || matchIndex >= frameTest.matches.length) {
        return {
          type: 'failure',
          testCase,
          message: 'Framing found too many matches',
          expected: undefined,
          given: match.value,
        };
      }
      const corresponding = frameTest.matches[matchIndex];
      if (!structurallySame(match.value, corresponding)) {
        return {
          type: 'failure',
          testCase,
          message: 'Framing produced different match',
          expected: corresponding,
          given: match.value,
        };
      }
      matchIndex++;
    }
    if (frameTest.error) {
      return {
        type: 'failure',
        testCase,
        message: 'Framing expected to fail with error',
      };
    }
  } catch (error) {
    if (Ram.isRamError(error) && frameTest.error) {
      if (error.ramErrorCode !== frameTest.error.code) {
        return {
          type: 'failure',
          testCase,
          message: 'Expected a different framing error code',
          error,
          expected: frameTest.error.code,
          given: error.ramErrorCode,
        };
      }
      const stack = error.ramStack ? ramStackToTestStack(error.ramStack) : undefined;
      if (!structurallySame(stack, frameTest.error.stack)) {
        return {
          type: 'failure',
          testCase,
          message: 'Expected a different frame error stack',
          error,
          expected: frameTest.error.stack,
          given: stack,
        };
      }
    } else {
      return {
        type: 'failure',
        testCase,
        message: 'Unexpected error while framing test graph',
        error,
      };
    }
  }

  return {type: 'success', testCase};
}

function ramStackToTestStack(stack: ReadonlyArray<Ram.StackFrame>) {
  return stack.map((frame): TestStackFrame => ({
    edge: frame.edge,
    shape: frame.shape.id.termType === 'NamedNode'
      ? frame.shape.id.value
      : {type: frame.shape.type}
  }));
}

function runGenerateQueryTest(testCase: TestCase): TestResult {
  return {
    type: 'failure',
    testCase,
    message: 'Not implemented',
  };
}
