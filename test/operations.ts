import fs from 'fs';
import path from 'path';
import * as SparqlJs from 'sparqljs';

import * as Ramp from '../src/index';

import { structurallySame } from './compare';
import {
  TestResult, TestFailure, TestFailureError, ExpectedError,
  makeFailureError, readTestShapes, readTestGraph, rampStackToTestStack,
} from './runner';
import { readCyclicJson, readQuery } from './util';

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

export function runOperationTest(testCase: OperationTestCase): TestResult {
  let result: TestResult;
  try {
    switch (testCase.type) {
      case 'frame': {
        result = runFrameTest(testCase);
        break;
      }
      case 'flatten': {
        result = runFlattenTest(testCase);
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
  readonly matches?: ReadonlyArray<unknown>;
  readonly error?: ExpectedError;
}

interface FlattenTest {
  readonly shapes: string;
  readonly value: unknown;
  readonly error?: ExpectedError;
}

interface GenerateQueryTest {
  readonly shapes: string;
}

function runFrameTest(testCase: OperationTestCase): TestResult {
  const frameTest = readTestDefinition(testCase) as FrameTest;
  const shape = readTestShapes(frameTest.shapes);
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

function runFlattenTest(testCase: OperationTestCase): TestResult {
  const flattenTest = readTestDefinition(testCase) as FlattenTest;
  const shape = readTestShapes(flattenTest.shapes);

  let quads: Ramp.Rdf.Quad[] | undefined;
  try {
    let blankIndex = 1;
    quads = [...Ramp.flatten({
      shape,
      value: flattenTest.value,
      unstable_generateBlankNode: () => {
        const blankNode = Ramp.Rdf.DefaultDataFactory.blankNode(`b${blankIndex}`);
        blankIndex++;
        return blankNode;
      }
    })];
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
      if (!structurallySame(stack, flattenTest.error.stack)) {
        return {
          type: 'failure',
          message: 'Expected a different flatten error stack',
          error,
          expected: flattenTest.error.stack,
          given: stack,
        };
      }
    } else {
      return {
        type: 'failure',
        message: 'Unexpected error while flattening test value',
        error,
      };
    }
  }

  if (quads) {
    if (flattenTest.error) {
      return {
        type: 'failure',
        message: 'Framing expected to fail with error',
      };
    }

    const dataset = readTestGraph(OperationTestCase.getTestGraphName(testCase));
    return {
      type: 'failure',
      message: 'Flatten result graph comparison is not implemented yet',
    };
  }

  return {type: 'success'};
}

function runGenerateQueryTest(testCase: OperationTestCase): TestResult {
  const generateQueryTest = readTestDefinition(testCase) as GenerateQueryTest;
  const shape = readTestShapes(generateQueryTest.shapes);

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
