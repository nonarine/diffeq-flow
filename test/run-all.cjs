/**
 * Run all tests (unit + integration)
 * Provides overall pass/fail summary and exits with appropriate code
 */

const { spawn } = require('child_process');
const path = require('path');

// ANSI colors
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    gray: '\x1b[90m'
};

/**
 * Run a test file and return results
 */
function runTest(testPath) {
    return new Promise((resolve) => {
        const testName = path.basename(testPath, '.js');
        console.log(`${colors.cyan}${colors.bright}Running ${testName}...${colors.reset}`);

        const child = spawn('node', [testPath], {
            stdio: 'inherit',
            cwd: path.resolve(__dirname, '..')
        });

        child.on('close', (code) => {
            resolve({
                name: testName,
                path: testPath,
                passed: code === 0
            });
        });

        child.on('error', (error) => {
            console.error(`${colors.red}Failed to run ${testName}: ${error.message}${colors.reset}`);
            resolve({
                name: testName,
                path: testPath,
                passed: false
            });
        });
    });
}

/**
 * Main test runner
 */
async function runAllTests() {
    console.log(`${colors.bright}${colors.cyan}========================================${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}Running All Tests${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}========================================${colors.reset}\n`);

    const testFiles = [
        // Unit tests
        'test/unit/animator-interpolation.cjs',
        'test/unit/parser.cjs',
        'test/unit/coordinate-systems.cjs',
        // Integration tests (run via wrapper that starts HTTP server)
        'test/integration/run-with-server.cjs'
    ];

    const results = [];

    // Run each test file sequentially
    for (const testFile of testFiles) {
        const result = await runTest(path.resolve(__dirname, '..', testFile));
        results.push(result);
        console.log(''); // Blank line between tests
    }

    // Print overall summary
    console.log(`${colors.bright}${colors.cyan}========================================${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}Overall Test Summary${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}========================================${colors.reset}\n`);

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const total = results.length;

    results.forEach(result => {
        const status = result.passed
            ? `${colors.green}✓ PASS${colors.reset}`
            : `${colors.red}✗ FAIL${colors.reset}`;
        console.log(`  ${status} ${result.name}`);
    });

    console.log(`\n${colors.bright}Total:${colors.reset}  ${total}`);
    console.log(`${colors.green}Passed:${colors.reset} ${passed}`);
    if (failed > 0) {
        console.log(`${colors.red}Failed:${colors.reset} ${failed}`);
    }

    if (failed === 0) {
        console.log(`\n${colors.green}${colors.bright}All test suites passed!${colors.reset}`);
        process.exit(0);
    } else {
        console.log(`\n${colors.red}${colors.bright}Some test suites failed${colors.reset}`);
        process.exit(1);
    }
}

// Run all tests
runAllTests().catch(error => {
    console.error(`${colors.red}Test runner crashed: ${error.message}${colors.reset}`);
    process.exit(1);
});
