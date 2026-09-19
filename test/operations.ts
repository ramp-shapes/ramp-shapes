import fs from 'node:fs';
import path from 'node:path';
import type { Quad } from '@rdfjs/types';
import * as SparqlJs from 'sparqljs';

import * as Ramp from '../src/index.js';

import { quadsToTurtleString } from './core/turtle-blank.js';
import { structurallySame } from './compare.js';
import {
  TestResult, TestFailure, TestFailureError, ExpectedError,
  makeFailureError, readTestShapes, readTestGraph, rampStackToTestStack,
} from './runner.js';
import { readCyclicJson, readQuery } from './util.js';

export interface OperationTestCase {
  readonly type: 'frame' | 'flatten' | 'generateQuery';
  readonly name: string;
  readonly skip?: boolean;
}
export const OperationTestCase = {
  getFullName(testCase: OperationTestCase): string {
    return `${testCase.type}/${testCase.name}`;
  },
  getTestGraphName(testCase: OperationTestCase): string {
    return path.join(testCase.type, `${testCase.name}.ttl`);
  }
};

export function readOperationTestIndex(): OperationTestCase[] {
  const json = fs.readFileSync('test-data/index.json', {encoding: 'utf-8'});
  const testDataIndex = JSON.parse(json) as OperationTestCase[];
  return testDataIndex;
}

export async function runOperationTest(testCase: OperationTestCase): Promise<TestResult> {
  let result: TestResult;
  try {
    switch (testCase.type) {
      case 'frame': {
        result = runFrameTest(testCase);
        break;
      }
      case 'flatten': {
        result = await runFlattenTest(testCase);
        break;
      }
      case 'generateQuery': {
        result = runGenerateQueryTest(testCase);
        break;
      }
      default:
        throw new Error(`Unknown test type: ${(testCase as OperationTestCase).type}`);
    }
  } catch (error) {
    const testError = error as TestFailureError;
    let failure: TestFailure;
    if (testError && testError.testFailure) {
      failure = {
        ...testError.testFailure,
        testCaseName: OperationTestCase.getFullName(testCase),
      };
      return failure;
    } else {
      failure = {
        type: 'failure',
        testCaseName: OperationTestCase.getFullName(testCase),
        message: 'Unexpected error while running test',
        error,
      };
    }
    return failure;
  }

  result = {
    ...result,
    testCaseName: OperationTestCase.getFullName(testCase),
  };
  return result;
}

interface FrameTest {
  readonly shapes: string;
  readonly rootShape?: string;
  readonly matches?: ReadonlyArray<unknown>;
  readonly error?: ExpectedError;
}

interface FlattenTest {
  readonly shapes: string;
  readonly rootShape?: string;
  readonly value: unknown;
  readonly error?: ExpectedError;
}

interface GenerateQueryTest {
  readonly shapes: string;
  readonly rootShape?: string;
}

function runFrameTest(testCase: OperationTestCase): TestResult {
  const frameTest = readTestDefinition(testCase) as FrameTest;
  const rootShape = frameTest.rootShape
    ? Ramp.DefaultDataFactory.namedNode(frameTest.rootShape) : undefined;
  const shape = readTestShapes(frameTest.shapes, rootShape);
  const dataset = readTestGraph(OperationTestCase.getTestGraphName(testCase));

  try {
    const matches = Ramp.frame({shape, dataset});

    let matchIndex = 0;
    for (const match of matches) {
      if (!frameTest.matches || matchIndex >= frameTest.matches.length) {
        return {
          type: 'failure',
          message: 'Framing found too many matches',
          expected: undefined,
          given: match.value,
        };
      }
      const corresponding = frameTest.matches[matchIndex];
      if (!structurallySame(match.value, corresponding)) {
        return {
          type: 'failure',
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
        message: 'Framing expected to fail with error',
      };
    }
  } catch (error) {
    if (Ramp.isRampError(error) && frameTest.error) {
      if (error.rampErrorCode !== frameTest.error.code) {
        return {
          type: 'failure',
          message: 'Expected a different framing error code',
          error,
          expected: frameTest.error.code,
          given: error.rampErrorCode,
        };
      }
      const stack = error.rampStack ? rampStackToTestStack(error.rampStack) : undefined;
      if (!structurallySame(stack, frameTest.error.stack)) {
        return {
          type: 'failure',
          message: 'Expected a different frame error stack',
          error,
          expected: frameTest.error.stack,
          given: stack,
        };
      }
    } else {
      return {
        type: 'failure',
        message: 'Unexpected error while framing test graph',
        error,
      };
    }
  }

  return {type: 'success'};
}

async function runFlattenTest(testCase: OperationTestCase): Promise<TestResult> {
  const flattenTest = readTestDefinition(testCase) as FlattenTest;
  const rootShape = flattenTest.rootShape
    ? Ramp.DefaultDataFactory.namedNode(flattenTest.rootShape) : undefined;
  const shape = readTestShapes(flattenTest.shapes, rootShape);

  let quads: Quad[];
  try {
    let blankIndex = 1;
    quads = Array.from(Ramp.flatten({
      shape,
      value: flattenTest.value,
      unstable_generateBlankNode: () => {
        const blankNode = Ramp.DefaultDataFactory.blankNode(`b${blankIndex}`);
        blankIndex++;
        return blankNode;
      }
    }));
  } catch (error) {
    if (Ramp.isRampError(error) && flattenTest.error) {
      if (error.rampErrorCode !== flattenTest.error.code) {
        return {
          type: 'failure',
          message: 'Expected a different flatten error code',
          error,
          expected: flattenTest.error.code,
          given: error.rampErrorCode,
        };
      }
      const stack = error.rampStack ? rampStackToTestStack(error.rampStack) : undefined;
      if (structurallySame(stack, flattenTest.error.stack)) {
        return {type: 'success'};
      } else {
        return {
          type: 'failure',
          message: 'Expected a different flatten error stack',
          error,
          expected: flattenTest.error.stack,
          given: stack,
        };
      }
    }
    return {
      type: 'failure',
      message: 'Unexpected error while flattening test value',
      error,
    };
  }

  if (flattenTest.error) {
    return {
      type: 'failure',
      message: 'Framing expected to fail with error',
    };
  }

  const dataset = readTestGraph(OperationTestCase.getTestGraphName(testCase));
  if (!structurallySame(quads, Array.from(dataset))) {
    const givenTurtle = await quadsToTurtleString(quads, {});
    const expectedTurle = await quadsToTurtleString(dataset, {});
    return {
      type: 'failure',
      message: 'Flatten produced different result graph',
      expected: expectedTurle,
      given: givenTurtle,
    };
  }

  return {type: 'success'};
}

function runGenerateQueryTest(testCase: OperationTestCase): TestResult {
  const generateQueryTest = readTestDefinition(testCase) as GenerateQueryTest;
  const rootShape = generateQueryTest.rootShape
    ? Ramp.DefaultDataFactory.namedNode(generateQueryTest.rootShape) : undefined;
  const shape = readTestShapes(generateQueryTest.shapes, rootShape);

  let expectedQuery: SparqlJs.SparqlQuery;
  try {
    expectedQuery = readQuery(
      path.join('test-data', testCase.type, `${testCase.name}.sparql`)
    );
  } catch (error) {
    return {
      type: 'failure',
      message: 'Failed to read expected query',
      error,
    };
  }

  let generatedQuery: SparqlJs.ConstructQuery | undefined;
  try {
    generatedQuery = Ramp.generateQuery({
      shape,
      prefixes: expectedQuery.prefixes,
    });
  } catch (error) {
    return {
      type: 'failure',
      message: 'Failed to generate query for shapes',
      error,
    };
  }

  const parser = new SparqlJs.Parser();
  const generator = new SparqlJs.Generator();

  const normalizedQuery = parser.parse(generator.stringify(generatedQuery));
  const generatedQueryString = generator.stringify(normalizedQuery);
  const expectedQueryString = generator.stringify(expectedQuery);

  if (generatedQueryString !== expectedQueryString) {
    return {
      type: 'failure',
      message: 'Generated query does not match expected query',
      expected: generatedQueryString,
      given: expectedQueryString,
    };
  }

  return {type: 'success'};
}

function readTestDefinition(testCase: OperationTestCase): unknown {
  try {
    return readCyclicJson(
      path.join('test-data', testCase.type, `${testCase.name}.json`)
    );
  } catch (error) {
    throw makeFailureError({
      type: 'failure',
      message: 'Failed to read test definition',
      error,
    });
  }
}
