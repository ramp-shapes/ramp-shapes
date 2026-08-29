import fs from 'node:fs';
import path from 'node:path';
import type { Quad } from '@rdfjs/types';
import * as SparqlJs from 'sparqljs';

import * as Ramp from '../src/index.js';

import {
  TestResult, ExpectedError, rampStackToTestStack,
  assertEqual,
  AssertEqualError,
} from './core/assertions.js';
import { structurallySame } from './core/compare.js';
import {
  SequentialDataFactory, readCyclicJson, readTurtle, readQuery,
  readTestShapes, readTestGraph,
} from './core/data-util.js';
import { quadsToTurtleString } from './core/turtle-blank.js';

export interface OperationTestCase {
  readonly type: 'frame' | 'flatten' | 'generateQuery';
  readonly name: string;
  readonly skip?: boolean;
}
export const OperationTestCase = {
  getFullName(testCase: OperationTestCase): string {
    return `${testCase.type}/${testCase.name}`;
  },
  getTestGraphPath(testCase: OperationTestCase): string {
    return path.join(
      import.meta.dirname,
      `../test-data/${testCase.type}/${testCase.name}.ttl`
    );
  },
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
    if (error instanceof AssertEqualError) {
      return {
        type: 'failure',
        testCaseName: OperationTestCase.getFullName(testCase),
        message: error.message,
        expected: error.expected,
        given: error.given,
      };
    }

    return {
      type: 'failure',
      testCaseName: OperationTestCase.getFullName(testCase),
      message: 'Unexpected error while running test',
      error,
    };
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
  const shape = readShapes(frameTest);
  const dataset = readTestGraph(OperationTestCase.getTestGraphPath(testCase));

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
  const shape = readShapes(flattenTest);

  let quads: Quad[];
  try {
    const sequentialFactory = new SequentialDataFactory(Ramp.DefaultDataFactory);
    quads = Array.from(Ramp.flatten({
      shape,
      value: flattenTest.value,
      unstable_generateBlankNode: prefix => sequentialFactory.blankNode(),
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

  const expected = readTurtle(
    OperationTestCase.getTestGraphPath(testCase),
    new SequentialDataFactory(Ramp.DefaultDataFactory)
  );
  const givenTurtle = await quadsToTurtleString(quads, expected.prefixes);
  assertEqual(givenTurtle, expected.turtle, 'Flatten produced different result graph');

  return {type: 'success'};
}

function runGenerateQueryTest(testCase: OperationTestCase): TestResult {
  const generateQueryTest = readTestDefinition(testCase) as GenerateQueryTest;
  const shape = readShapes(generateQueryTest);

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
      path.join(
        import.meta.dirname,
        `../test-data/${testCase.type}/${testCase.name}.json`
      )
    );
  } catch (err) {
    throw new Error('Failed to read test definition', {cause: err});
  }
}

function readShapes(test: FrameTest | FlattenTest | GenerateQueryTest): Ramp.Shape {
  const shapePath = path.join(
    import.meta.dirname,
    `../test-data/shapes/${test.shapes}.ttl`
  );
  const rootShape = test.rootShape
    ? Ramp.DefaultDataFactory.namedNode(test.rootShape) : undefined;
  return readTestShapes(shapePath, rootShape);
}
