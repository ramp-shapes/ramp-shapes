// tslint:disable-next-line: no-reference
/// <reference path="./json-diff.d.ts" />

import { diffString } from 'json-diff';

import { TestCase, TestResult, runTest } from './runner';

const testDataIndex = require('../test-data/index.json') as TestDataIndex;
type TestDataIndex = ReadonlyArray<TestCase>;

enum ExitCode {
  SyntaxHelp = 1,
  TestCaseNotFound = 2,
  TestsFailed = 20,
}

if (process.argv.length === 3) {
  const [, scriptName, argument] = process.argv;
  if (argument === 'help' || argument === '--help') {
    console.error(
      `CLI syntax for ${scriptName}:\n` +
      `$ ${scriptName} (<test-case-name>)*`
    );
    process.exit(ExitCode.SyntaxHelp);
  }
}

const [, scriptName, ...namesToTest] = process.argv;

const caseByFullName = new Map<string, TestCase>();
for (const testCase of testDataIndex) {
  caseByFullName.set(TestCase.getFullName(testCase), testCase);
}

if (namesToTest.length > 0) {
  for (const testCaseName of namesToTest) {
    if (!caseByFullName.has(testCaseName)) {
      console.error(`Test case "${testCaseName}" does not exists.`);
      process.exit(ExitCode.TestCaseNotFound);
    }
  }
}

const casesToTest = namesToTest.length > 0
  ? namesToTest.map(caseName => caseByFullName.get(caseName)!)
  : [...caseByFullName.values()];

const results: TestResult[] = [];
let successCount = 0;
let failureCount = 0;

console.log('Running tests...');
for (const testCase of casesToTest) {
  const result = runTest(testCase);
  if (result.type === 'success') {
    successCount++;
  }
  if (result.type === 'failure') {
    failureCount++;
  }
  results.push(result);
  console.log(`  ${result.type === 'success' ? '✓' : '✗'} ${TestCase.getFullName(testCase)}`);
}

// print new line
console.log();

for (const result of results) {
  if (result.type === 'failure') {
    console.error(`Failure in "${result.testCase.name}": ${result.message}`);
    if (result.error) {
      console.error(result.error);
    }
    if (result.expected || result.given) {
      console.log(diffString(result.expected, result.given));
    } else {
      // print new line
      console.log();
    }
  }
}

const skippedCount = caseByFullName.size - (successCount + failureCount);
console.log(
  `Test results: ${skippedCount} skipped, ` +
  `${successCount} success, ` +
  `${failureCount} failure`
);
if (failureCount > 0) {
  process.exit(ExitCode.TestsFailed);
}
