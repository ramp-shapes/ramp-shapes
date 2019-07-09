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
  readonly matches: ReadonlyArray<unknown>;
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
      if (matchIndex >= frameTest.matches.length) {
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
  } catch (error) {
    return {
      type: 'failure',
      testCase,
      message: 'Failed to frame test graph',
      error,
    };
  }

  return {type: 'success', testCase};
}

function runGenerateQueryTest(testCase: TestCase): TestResult {
  return {
    type: 'failure',
    testCase,
    message: 'Not implemented',
  };
}
