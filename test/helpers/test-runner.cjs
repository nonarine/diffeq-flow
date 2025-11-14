/**
 * Simple test runner with colored console output
 * No framework dependencies - just Node.js built-ins
 */

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
};

// Test results tracking
let testResults = {
    passed: 0,
    failed: 0,
    tests: []
};

/**
 * Assert that a condition is true
 * @param {boolean} condition - Condition to test
 * @param {string} message - Error message if assertion fails
 */
function assert(condition, message = 'Assertion failed') {
    if (!condition) {
        throw new Error(message);
    }
}

/**
 * Assert that two values are equal
 * @param {any} actual - Actual value
 * @param {any} expected - Expected value
 * @param {string} message - Optional error message
 */
function assertEqual(actual, expected, message) {
    const defaultMessage = `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
    assert(actual === expected, message || defaultMessage);
}

/**
 * Assert that two values are deeply equal (for objects/arrays)
 * @param {any} actual - Actual value
 * @param {any} expected - Expected value
 * @param {string} message - Optional error message
 */
function assertDeepEqual(actual, expected, message) {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    const defaultMessage = `Deep equality failed:\nExpected: ${expectedStr}\nActual: ${actualStr}`;
    assert(actualStr === expectedStr, message || defaultMessage);
}

/**
 * Assert that two numbers are approximately equal (within epsilon)
 * @param {number} actual - Actual value
 * @param {number} expected - Expected value
 * @param {number} epsilon - Maximum difference allowed (default: 0.0001)
 * @param {string} message - Optional error message
 */
function assertApproxEqual(actual, expected, epsilon = 0.0001, message) {
    const diff = Math.abs(actual - expected);
    const defaultMessage = `Expected ${expected} ± ${epsilon}, got ${actual} (diff: ${diff})`;
    assert(diff <= epsilon, message || defaultMessage);
}

/**
 * Assert that a function throws an error
 * @param {Function} fn - Function that should throw
 * @param {string} message - Optional error message
 */
function assertThrows(fn, message = 'Expected function to throw') {
    let thrown = false;
    try {
        fn();
    } catch (e) {
        thrown = true;
    }
    assert(thrown, message);
}

/**
 * Run a single test
 * @param {string} name - Test name
 * @param {Function} testFn - Test function (sync or async)
 */
async function test(name, testFn) {
    try {
        await testFn();
        testResults.passed++;
        testResults.tests.push({ name, passed: true });
        console.log(`${colors.green}✓${colors.reset} ${colors.dim}${name}${colors.reset}`);
    } catch (error) {
        testResults.failed++;
        testResults.tests.push({ name, passed: false, error: error.message });
        console.log(`${colors.red}✗${colors.reset} ${name}`);
        console.log(`  ${colors.red}${error.message}${colors.reset}`);
        if (error.stack) {
            const stackLines = error.stack.split('\n').slice(1, 3);
            stackLines.forEach(line => {
                console.log(`  ${colors.gray}${line.trim()}${colors.reset}`);
            });
        }
    }
}

/**
 * Run multiple tests in a group
 * @param {string} groupName - Name of the test group
 * @param {Function} testsFn - Function containing test() calls
 */
async function describe(groupName, testsFn) {
    console.log(`\n${colors.cyan}${colors.bright}${groupName}${colors.reset}`);
    await testsFn();
}

/**
 * Print test summary
 */
function printSummary() {
    const total = testResults.passed + testResults.failed;
    console.log(`\n${colors.bright}Test Results:${colors.reset}`);
    console.log(`  Total:  ${total}`);
    console.log(`  ${colors.green}Passed: ${testResults.passed}${colors.reset}`);
    if (testResults.failed > 0) {
        console.log(`  ${colors.red}Failed: ${testResults.failed}${colors.reset}`);
    }

    const success = testResults.failed === 0;
    if (success) {
        console.log(`\n${colors.green}${colors.bright}All tests passed!${colors.reset}`);
    } else {
        console.log(`\n${colors.red}${colors.bright}Some tests failed${colors.reset}`);
    }

    return success;
}

/**
 * Reset test results (useful when running multiple test files)
 */
function resetResults() {
    testResults = {
        passed: 0,
        failed: 0,
        tests: []
    };
}

/**
 * Get current test results
 */
function getResults() {
    return { ...testResults };
}

/**
 * Exit with appropriate code based on test results
 */
function exitWithResults() {
    const success = testResults.failed === 0;
    process.exit(success ? 0 : 1);
}

// Export all functions
module.exports = {
    assert,
    assertEqual,
    assertDeepEqual,
    assertApproxEqual,
    assertThrows,
    test,
    describe,
    printSummary,
    resetResults,
    getResults,
    exitWithResults,
    colors
};
