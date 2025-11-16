/**
 * Numerical tests for coordinate system native-space integration
 *
 * Uses DIY GPGPU approach with Puppeteer to execute shaders and validate
 * that coordinate transforms produce correct numerical outputs.
 *
 * Test approach:
 * 1. Test forward transform (Cartesian → Native) accuracy
 * 2. Test inverse transform (Native → Cartesian) accuracy
 * 3. Test round-trip accuracy (Cartesian → Native → Cartesian)
 * 4. Test integration in native space produces correct results
 */

const { test, describe, printSummary, exitWithResults, assertApproxEqual, assertEqual } = require('../helpers/test-runner.cjs');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

const PORT = 8766;  // Use different port from smoke test
const HOST = 'localhost';

/**
 * Analytical test cases for coordinate transforms
 */
const TEST_CASES = {
    // Forward transform tests: Cartesian → Native
    forward_transform: {
        polar_at_x_axis: {
            cartesian: [1.0, 0.0],
            expected_native: [1.0, 0.0]  // r=1, θ=0
        },
        polar_at_y_axis: {
            cartesian: [0.0, 1.0],
            expected_native: [1.0, Math.PI / 2]  // r=1, θ=π/2
        },
        polar_at_45deg: {
            cartesian: [1.0, 1.0],
            expected_native: [Math.sqrt(2), Math.PI / 4]  // r=√2, θ=π/4
        },
        polar_negative_x: {
            cartesian: [-1.0, 0.0],
            expected_native: [1.0, Math.PI]  // r=1, θ=π
        }
    },

    // Inverse transform tests: Native → Cartesian
    inverse_transform: {
        polar_r1_theta0: {
            native: [1.0, 0.0],
            expected_cartesian: [1.0, 0.0]  // x=1, y=0
        },
        polar_r1_theta90: {
            native: [1.0, Math.PI / 2],
            expected_cartesian: [0.0, 1.0]  // x=0, y=1
        },
        polar_r2_theta45: {
            native: [2.0, Math.PI / 4],
            expected_cartesian: [Math.sqrt(2), Math.sqrt(2)]  // x=√2, y=√2
        },
        polar_r1_theta180: {
            native: [1.0, Math.PI],
            expected_cartesian: [-1.0, 0.0]  // x=-1, y=0
        }
    },

    // Round-trip tests: Cartesian → Native → Cartesian
    round_trip: [
        { cartesian: [1.0, 0.0] },
        { cartesian: [0.0, 1.0] },
        { cartesian: [1.0, 1.0] },
        { cartesian: [-1.0, 0.0] },
        { cartesian: [0.5, 0.5] },
        { cartesian: [2.0, 3.0] }
    ]
};

/**
 * Wait for server to be ready
 */
function waitForServer(port, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        const checkServer = () => {
            http.get(`http://${HOST}:${port}/test/fixtures/coordinate-transform-test.html`, (res) => {
                if (res.statusCode === 200) {
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
 * Run all coordinate Jacobian tests
 */
async function runTests() {
    let browser, page, serverProcess;
    const projectRoot = path.resolve(__dirname, '../..');

    // Create test HTML file first (mirror dependencies from index.html)
    const testPageContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Coordinate Transform Test</title>
    <!-- Load dependencies (same as index.html) -->
    <script src="https://cdn.jsdelivr.net/npm/nerdamer@latest/all.min.js"></script>
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
</head>
<body>
    <canvas id="test-canvas" width="256" height="256"></canvas>
    <script type="module">
        // Import modules and expose on window for testing
        import { CoordinateSystem, PRESET_COORDINATE_SYSTEMS, getCoordinateSystem } from '../../src/math/coordinate-systems.js';
        import { parseExpression } from '../../src/math/parser.js';

        window.CoordinateSystem = CoordinateSystem;
        window.PRESET_COORDINATE_SYSTEMS = PRESET_COORDINATE_SYSTEMS;
        window.getCoordinateSystem = getCoordinateSystem;
        window.parseExpression = parseExpression;
        window.modulesLoaded = true;
    </script>
</body>
</html>`;

    const fixturesDir = path.join(projectRoot, 'test/fixtures');
    if (!fs.existsSync(fixturesDir)) {
        fs.mkdirSync(fixturesDir, { recursive: true });
    }
    const testHtmlPath = path.join(fixturesDir, 'coordinate-transform-test.html');
    fs.writeFileSync(testHtmlPath, testPageContent);

    await describe('Coordinate System Jacobian Numerical Validation', async () => {

        // Setup: Start HTTP server
        await test('Setup: Start HTTP server', async () => {
            serverProcess = spawn('python3', ['-m', 'http.server', PORT.toString()], {
                cwd: projectRoot,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            // Suppress server output
            serverProcess.stdout.on('data', () => {});
            serverProcess.stderr.on('data', () => {});

            // Wait for server to be ready
            await waitForServer(PORT);
        });

        // Setup: Launch browser and create WebGL context
        await test('Setup: Launch Puppeteer with WebGL support', async () => {
            browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--use-gl=swiftshader',  // Software WebGL (SwiftShader)
                    '--disable-gpu',
                    '--no-sandbox'
                ]
            });

            page = await browser.newPage();

            // Set a reasonable viewport
            await page.setViewport({ width: 256, height: 256 });

            // Monitor browser console for debugging
            page.on('console', msg => console.log('  [Browser]:', msg.text()));
            page.on('pageerror', error => console.log('  [Error]:', error.message));

            // Navigate to test page via HTTP
            await page.goto(`http://${HOST}:${PORT}/test/fixtures/coordinate-transform-test.html`, {
                waitUntil: 'domcontentloaded'
            });

            // Wait for modules to load
            await page.waitForFunction(() => window.modulesLoaded === true, { timeout: 10000 });
        });

        // Helper function to test a coordinate transform
        async function testCoordinateTransform(coordSystemKey, testCase, testName) {
            const result = await page.evaluate((key, tc) => {

                const coordSystem = window.PRESET_COORDINATE_SYSTEMS[key];

                // Helper: parse expression to GLSL
                const parseFunc = (expr, vars) => {
                    // parseExpression returns a string directly, not an object
                    return window.parseExpression(expr, 2, vars);
                };

                // Generate velocity transform GLSL
                const velocityGLSL = coordSystem.generateVelocityTransformGLSL(['x', 'y'], parseFunc);

                console.log('Generated velocity GLSL:', velocityGLSL);

                // Create test shader (build without template literals to avoid eval issues)
                const fragmentShaderSource =
                    'precision highp float;\n\n' +
                    velocityGLSL + '\n\n' +
                    'void main() {\n' +
                    '    vec2 pos_cartesian = vec2(' + tc.pos[0] + ', ' + tc.pos[1] + ');\n' +
                    '    vec2 vel_native = vec2(' + tc.vel_native[0] + ', ' + tc.vel_native[1] + ');\n' +
                    '\n' +
                    '    vec2 vel_cartesian = transformVelocityToCartesian(vel_native, pos_cartesian);\n' +
                    '\n' +
                    '    // Encode velocity to [0,1] range (map [-10,10] to [0,1])\n' +
                    '    float scale = 20.0;\n' +
                    '    vec2 encoded = (vel_cartesian + scale/2.0) / scale;\n' +
                    '    gl_FragColor = vec4(encoded, 0.0, 1.0);\n' +
                    '}';

                const vertexShaderSource = `
                    attribute vec2 a_position;
                    void main() {
                        gl_Position = vec4(a_position, 0.0, 1.0);
                    }
                `;

                // Get WebGL context
                const canvas = document.getElementById('test-canvas');
                canvas.width = 1;
                canvas.height = 1;
                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

                if (!gl) {
                    throw new Error('WebGL not available');
                }

                // Compile vertex shader
                const vertexShader = gl.createShader(gl.VERTEX_SHADER);
                gl.shaderSource(vertexShader, vertexShaderSource);
                gl.compileShader(vertexShader);

                if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
                    throw new Error('Vertex shader error: ' + gl.getShaderInfoLog(vertexShader));
                }

                // Compile fragment shader
                const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
                gl.shaderSource(fragmentShader, fragmentShaderSource);
                gl.compileShader(fragmentShader);

                if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
                    throw new Error('Fragment shader error: ' + gl.getShaderInfoLog(fragmentShader));
                }

                // Link program
                const program = gl.createProgram();
                gl.attachShader(program, vertexShader);
                gl.attachShader(program, fragmentShader);
                gl.linkProgram(program);

                if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                    throw new Error('Program link error: ' + gl.getProgramInfoLog(program));
                }

                gl.useProgram(program);

                // Create fullscreen quad
                const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
                const positionBuffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

                const positionLocation = gl.getAttribLocation(program, 'a_position');
                gl.enableVertexAttribArray(positionLocation);
                gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

                // Draw
                gl.viewport(0, 0, 1, 1);
                gl.clearColor(0, 0, 0, 1);
                gl.clear(gl.COLOR_BUFFER_BIT);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

                // Read back result as bytes
                const pixels = new Uint8Array(4);
                gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

                // Decode: map [0, 255] to approximate float range
                // For velocity values around -10 to +10, use scale factor
                const scale = 20.0;  // Assume velocities in range [-10, 10]
                const vx = (pixels[0] / 255.0) * scale - scale/2;
                const vy = (pixels[1] / 255.0) * scale - scale/2;

                return { vx, vy };
            }, coordSystemKey, testCase);

            return result;
        }

        // Test Polar 2D coordinate system
        await test('Polar 2D: Radial velocity at x-axis (r=1, θ=0)', async () => {
            const testCase = ANALYTICAL_SOLUTIONS.polar_radial_at_x_axis;
            const result = await testCoordinateTransform('polar2d', testCase, 'polar_radial_at_x_axis');

            // Assert against analytical solution
            assertApproxEqual(result.vx, testCase.expected[0], 0.5, `vx should be ${testCase.expected[0]}, got ${result.vx}`);
            assertApproxEqual(result.vy, testCase.expected[1], 0.5, `vy should be ${testCase.expected[1]}, got ${result.vy}`);
        });

        await test('Polar 2D: Angular velocity at y-axis (r=2, θ=π/2)', async () => {
            const testCase = ANALYTICAL_SOLUTIONS.polar_angular_at_y_axis;
            const result = await testCoordinateTransform('polar2d', testCase, 'polar_angular_at_y_axis');

            assertApproxEqual(result.vx, testCase.expected[0], 0.5, `vx should be ${testCase.expected[0]}, got ${result.vx}`);
            assertApproxEqual(result.vy, testCase.expected[1], 0.5, `vy should be ${testCase.expected[1]}, got ${result.vy}`);
        });

        await test('Cartesian 2D: Identity transform', async () => {
            const testCase = ANALYTICAL_SOLUTIONS.cartesian_identity;
            const result = await testCoordinateTransform('cartesian2d', testCase, 'cartesian_identity');

            assertApproxEqual(result.vx, testCase.expected[0], 0.5, `vx should be ${testCase.expected[0]}, got ${result.vx}`);
            assertApproxEqual(result.vy, testCase.expected[1], 0.5, `vy should be ${testCase.expected[1]}, got ${result.vy}`);
        });

        // Cleanup
        await test('Cleanup: Close browser and server', async () => {
            if (browser) {
                await browser.close();
            }
            if (serverProcess) {
                serverProcess.kill();
            }
        });
    });
}

// Run tests
(async () => {
    try {
        await runTests();
        printSummary();
        exitWithResults();
    } catch (error) {
        console.error('\n❌ Test suite crashed:', error);
        console.error(error.stack);
        process.exit(1);
    }
})();
