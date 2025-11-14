/**
 * Run smoke test with local HTTP server
 * Starts a server, runs the test, then cleans up
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 8765;
const HOST = 'localhost';

// ANSI colors
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m'
};

/**
 * Wait for server to be ready
 */
function waitForServer(port, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        const checkServer = () => {
            http.get(`http://${HOST}:${port}/index.html`, (res) => {
                if (res.statusCode === 200) {
                    // Add small delay to ensure server is fully ready
                    setTimeout(resolve, 500);
                } else if (Date.now() - startTime > timeout) {
                    reject(new Error(`Server returned status ${res.statusCode}`));
                } else {
                    setTimeout(checkServer, 100);
                }
            }).on('error', (err) => {
                if (Date.now() - startTime > timeout) {
                    reject(new Error('Server failed to start within timeout'));
                } else {
                    setTimeout(checkServer, 200);
                }
            });
        };

        checkServer();
    });
}

/**
 * Main function
 */
async function main() {
    const projectRoot = path.resolve(__dirname, '../..');
    console.log(`${colors.cyan}${colors.bright}Starting local HTTP server on port ${PORT}...${colors.reset}`);
    console.log(`${colors.cyan}Serving from: ${projectRoot}${colors.reset}`);

    // Start HTTP server
    const serverProcess = spawn('python3', ['-m', 'http.server', PORT.toString()], {
        cwd: projectRoot,
        stdio: ['ignore', 'inherit', 'inherit']  // Show server output for debugging
    });

    // Keep server alive
    serverProcess.stdout?.on('data', () => {});
    serverProcess.stderr?.on('data', () => {});

    try {
        // Wait for server to be ready
        await waitForServer(PORT);
        console.log(`${colors.green}✓ Server ready${colors.reset}\n`);

        // Run smoke test
        console.log(`${colors.cyan}${colors.bright}Running smoke test...${colors.reset}\n`);

        const testProcess = spawn('node', ['test/integration/smoke-test.cjs'], {
            cwd: path.resolve(__dirname, '../..'),
            stdio: 'inherit',
            env: {
                ...process.env,
                TEST_SERVER_URL: `http://${HOST}:${PORT}`
            }
        });

        // Wait for test to complete
        const exitCode = await new Promise((resolve) => {
            testProcess.on('close', resolve);
        });

        // Cleanup
        console.log(`\n${colors.cyan}Shutting down server...${colors.reset}`);
        serverProcess.kill();

        process.exit(exitCode);

    } catch (error) {
        console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
        serverProcess.kill();
        process.exit(1);
    }
}

// Handle cleanup on exit
process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, cleaning up...');
    process.exit(1);
});

main();
