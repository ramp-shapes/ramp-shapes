import chalk from 'chalk';
import { diffLines } from 'diff';
import { diffString } from 'json-diff';

import { TestResult } from './runner.js';
import { OperationTestCase, readOperationTestIndex, runOperationTest } from './operations.js';
import { breakReferenceCycles } from './util.js';

import { TestScriptContext, AssertEqualError } from './test-scripts/test-script-context.js';
import { registerAllTests } from './test-scripts/test-index.js';

interface TestCase {
  readonly name: string;
  readonly skip?: boolean;
  readonly run: () => Promise<TestResult>;
}

enum ExitCode {
  SyntaxHelp = 1,
  OperationTestIndexReadFailed = 2,
  TestCaseNotFound = 3,
  TestsFailed = 20,
  UnexpectedError = 21,
}

async function main() {
  if (process.argv.length === 3) {
    const [, scriptName, argument] = process.argv;
    if (argument === '--help') {
      console.error(
        `CLI syntax for ${scriptName}:\n` +
        `$ ${scriptName} (<test-case-name>)*`
      );
      process.exit(ExitCode.SyntaxHelp);
    }
  }

  const [, scriptName, ...namesToTest] = process.argv;

  const caseByName = new Map<string, TestCase>();
  addScriptTests(caseByName);
  addOperationTests(caseByName);

  if (namesToTest.length > 0) {
    for (const testCaseName of namesToTest) {
      if (!caseByName.has(testCaseName)) {
        console.error(`Test case "${testCaseName}" does not exists.`);
        process.exit(ExitCode.TestCaseNotFound);
      }
    }
  }

  const casesToTest = namesToTest.length > 0
    ? namesToTest.map(caseName => caseByName.get(caseName)!)
    : [...caseByName.values()];

  const results: TestResult[] = [];
  let successCount = 0;
  let failureCount = 0;

  console.log('Running tests...');
  for (const testCase of casesToTest) {
    let result: TestResult | undefined;
    if (!testCase.skip) {
      result = await testCase.run();
      if (result.type === 'success') {
        successCount++;
      }
      if (result.type === 'failure') {
        failureCount++;
      }
      results.push(result);
    }
    const resultIcon = (
      !result ? '-' :
      result.type === 'success' ? chalk.green('✓') :
      chalk.red('✗')
    );
    console.log(`  ${resultIcon} ${testCase.name}`);
  }

  // print new line
  console.log();

  for (const result of results) {
    if (result.type === 'failure') {
      console.error(`Failure in "${result.testCaseName}": ${result.message}`);
      if (result.error) {
        console.error(result.error);
      }
      if (result.expected || result.given) {
        if (typeof result.expected === 'string' && typeof result.given === 'string') {
          for (const change of diffLines(result.expected, result.given)) {
            const colored = (
              change.added ? chalk.green :
              change.removed ? chalk.red :
              chalk.grey
            );
            process.stderr.write(colored(change.value));
          }
          process.stderr.write('\n');
        } else {
          const expectedWithoutCycles = structuredClone(result.expected);
          const givenWithoutCycles = structuredClone(result.given);
          breakReferenceCycles(expectedWithoutCycles);
          breakReferenceCycles(givenWithoutCycles);
          console.log(diffString(expectedWithoutCycles, givenWithoutCycles));
        }
      } else {
        // print new line
        console.log();
      }
    }
  }

  const skippedCount = caseByName.size - (successCount + failureCount);
  console.log(
    `Test results: ${skippedCount} skipped, ` +
    `${successCount} success, ` +
    `${failureCount} failure`
  );
  if (failureCount > 0) {
    process.exit(ExitCode.TestsFailed);
  }
}

function addScriptTests(testCases: Map<string, TestCase>): void {
  const makeCase = (name: string, body: () => void | Promise<void>): TestCase => {
    return {
      name,
      run: async (): Promise<TestResult> => {
        try {
          await body();
        } catch (err) {
          if (err instanceof AssertEqualError) {
            return {
              type: 'failure',
              testCaseName: name,
              message: err.message,
              expected: err.expected,
              given: err.given,
              error: err.cause,
            };
          }
          return {
            type: 'failure',
            testCaseName: name,
            message: 'Unexpected error occured during the test',
            error: err,
          };
        }
        return {
          type: 'success',
          testCaseName: name,
        };
      },
    };
  };
  const context: TestScriptContext = {
    defineCase: (name, body) => {
      testCases.set(name, makeCase(name, body));
    },
    skipCase: (name, body) => {
      testCases.set(name, {
        ...makeCase(name, body),
        skip: true,
      });
    }
  };
  registerAllTests(context);
}

function addOperationTests(testCases: Map<string, TestCase>): void {
  let operationTests: OperationTestCase[];
  try {
    operationTests = readOperationTestIndex();
  } catch (err) {
    console.error('Error reading operation test index', err);
    process.exit(ExitCode.OperationTestIndexReadFailed);
  }

  for (const testCase of operationTests) {
    testCases.set(OperationTestCase.getFullName(testCase), {
      name: OperationTestCase.getFullName(testCase),
      skip: testCase.skip,
      run: () => runOperationTest(testCase),
    });
  }
}

// Run testing
main().catch(err => {
  console.error('Unexpected error during test evaluation', err);
  process.exit(ExitCode.UnexpectedError);
});
