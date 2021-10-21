import path from 'path';
import * as SparqlJs from 'sparqljs';

import * as Ramp from '../src/index';
import { structurallySame } from './compare';
import { readQuadsFromTurtle, readCyclicJson, readQuery, findFirstShape } from './util';

export interface TestCase {
  readonly type: 'frame' | 'flatten' | 'generateQuery';
  readonly name: string;
  readonly skip?: boolean;
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

interface ExpectedError {
  readonly code: Ramp.ErrorCode;
  readonly stack?: ReadonlyArray<ExpectedStackFrame>;
}

interface ExpectedStackFrame {
  readonly edge?: string | number;
  readonly shape: string | { type: Ramp.Shape['type'] };
  readonly focus?: string;
}

type TestFailureError = Error & {
  testFailure: TestFailure;
};

export function runTest(testCase: TestCase): TestResult {
  try {
    switch (testCase.type) {
      case 'frame':
        return runFrameTest(testCase);
      case 'flatten':
        return runFlattenTest(testCase);
      case 'generateQuery':
        return runGenerateQueryTest(testCase);
      default:
        throw new Error(`Unknown test type: ${testCase.type}`);
    }
  } catch (error) {
    const testError = error as TestFailureError;
    if (testError && testError.testFailure) {
      return testError.testFailure;
    } else {
      return {
        type: 'failure',
        message: 'Unexpected error while running test',
        testCase,
        error,
      };
    }
  }
}

function makeFailureError(failure: TestFailure) {
  const error = new Error(failure.message) as TestFailureError;
  error.testFailure = failure;
  return error;
}

function runFrameTest(testCase: TestCase): TestResult {
  const frameTest = readTestDefinition(testCase) as FrameTest;
  const shape = readTestShapes(frameTest.shapes, testCase);
  const dataset = readTestGraph(testCase.name, testCase);

  try {
    const matches = Ramp.frame({shape, dataset});

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
    if (Ramp.isRampError(error) && frameTest.error) {
      if (error.rampErrorCode !== frameTest.error.code) {
        return {
          type: 'failure',
          testCase,
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

function runFlattenTest(testCase: TestCase): TestResult {
  const flattenTest = readTestDefinition(testCase) as FlattenTest;
  const shape = readTestShapes(flattenTest.shapes, testCase);

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
          testCase,
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
          testCase,
          message: 'Expected a different flatten error stack',
          error,
          expected: flattenTest.error.stack,
          given: stack,
        };
      }
    } else {
      return {
        type: 'failure',
        testCase,
        message: 'Unexpected error while flattening test value',
        error,
      };
    }
  }

  if (quads) {
    if (flattenTest.error) {
      return {
        type: 'failure',
        testCase,
        message: 'Framing expected to fail with error',
      };
    }

    const dataset = readTestGraph(testCase.name, testCase);
    return {
      type: 'failure',
      testCase,
      message: 'Flatten result graph comparison is not implemented yet',
    };
  }

  return {type: 'success', testCase};
}

function runGenerateQueryTest(testCase: TestCase): TestResult {
  const generateQueryTest = readTestDefinition(testCase) as GenerateQueryTest;
  const shape = readTestShapes(generateQueryTest.shapes, testCase);

  let expectedQuery: SparqlJs.SparqlQuery;
  try {
    expectedQuery = readQuery(
      path.join('test-data', testCase.type, `${testCase.name}.sparql`)
    );
  } catch (error) {
    return {
      type: 'failure',
      testCase,
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
      testCase,
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
      testCase,
      message: 'Generated query does not match expected query',
      expected: generatedQueryString,
      given: expectedQueryString,
    };
  }

  return {type: 'success', testCase};
}

function readTestDefinition(testCase: TestCase): unknown {
  try {
    return readCyclicJson(
      path.join('test-data', testCase.type, `${testCase.name}.json`)
    ) as FrameTest;
  } catch (error) {
    throw makeFailureError({
      type: 'failure',
      testCase,
      message: 'Failed to read test definition',
      error,
    });
  }
}

function readTestShapes(name: string, testCase: TestCase): Ramp.Shape {
  let rootShape: Ramp.Shape | undefined;
  try {
    const shapeQuads = readQuadsFromTurtle(
      path.join('test-data', 'shapes', `${name}.ttl`)
    );
    const shapes = Ramp.frameShapes(Ramp.Rdf.dataset(shapeQuads));
    rootShape = findFirstShape(shapeQuads, shapes);
  } catch (error) {
    throw makeFailureError({
      type: 'failure',
      testCase,
      message: 'Failed to read test shapes',
      error,
    });
  }

  if (!rootShape) {
    throw makeFailureError({
      type: 'failure',
      testCase,
      message: 'Failed to find root shape (should be the first one)',
    });
  }

  return rootShape;
}

function readTestGraph(name: string, testCase: TestCase) {
  try {
    return Ramp.Rdf.dataset(readQuadsFromTurtle(
      path.join('test-data', testCase.type, `${name}.ttl`)
    ));
  } catch (error) {
    throw makeFailureError({
      type: 'failure',
      testCase,
      message: 'Failed to read test graph',
      error,
    });
  }
}

function rampStackToTestStack(stack: ReadonlyArray<Ramp.StackFrame>) {
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
