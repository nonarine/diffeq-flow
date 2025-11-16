/**
 * Numerical accuracy tests for coordinate system transforms
 *
 * Tests the new native-space integration approach by validating:
 * 1. Forward transform accuracy (Cartesian → Native)
 * 2. Inverse transform accuracy (Native → Cartesian)
 * 3. Round-trip accuracy (Cartesian → Native → Cartesian)
 */

const { test, describe, printSummary, exitWithResults, assertApproxEqual, assertEqual } = require('../helpers/test-runner.cjs');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

const PORT = 8767;  // Different port
const HOST = 'localhost';

/**
 * Test cases with analytical solutions
 */
const TEST_CASES = {
    polar_forward: [
        { cartesian: [1.0, 0.0], native: [1.0, 0.0] },  // r=1, θ=0
        { cartesian: [0.0, 1.0], native: [1.0, Math.PI / 2] },  // r=1, θ=π/2
        { cartesian: [1.0, 1.0], native: [Math.sqrt(2), Math.PI / 4] },  // r=√2, θ=π/4
        { cartesian: [-1.0, 0.0], native: [1.0, Math.PI] }  // r=1, θ=π
    ],
    polar_inverse: [
        { native: [1.0, 0.0], cartesian: [1.0, 0.0] },  // x=1, y=0
        { native: [1.0, Math.PI / 2], cartesian: [0.0, 1.0] },  // x=0, y=1
        { native: [Math.sqrt(2), Math.PI / 4], cartesian: [1.0, 1.0] },  // x=1, y=1
        { native: [1.0, Math.PI], cartesian: [-1.0, 0.0] }  // x=-1, y=0
    ],
    polar_roundtrip: [
        [1.0, 0.0],
        [0.0, 1.0],
        [1.0, 1.0],
        [-1.0, 0.0],
        [0.5, 0.5],
        [2.0, 3.0]
    ]
};

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

async function runTests() {
    let browser, page, serverProcess;
    const projectRoot = path.resolve(__dirname, '../..');

    // Create test HTML (same as before)
    const testPageContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Coordinate Transform Test</title>
    <script src="https://cdn.jsdelivr.net/npm/nerdamer@latest/all.min.js"></script>
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
</head>
<body>
    <canvas id="test-canvas" width="256" height="256"></canvas>
    <script type="module">
        import { CoordinateSystem, PRESET_COORDINATE_SYSTEMS } from '../../src/math/coordinate-systems.js';
        import { parseExpression } from '../../src/math/parser.js';
        window.CoordinateSystem = CoordinateSystem;
        window.PRESET_COORDINATE_SYSTEMS = PRESET_COORDINATE_SYSTEMS;
        window.parseExpression = parseExpression;
        window.modulesLoaded = true;
    </script>
</body>
</html>`;

    const fixturesDir = path.join(projectRoot, 'test/fixtures');
    if (!fs.existsSync(fixturesDir)) {
        fs.mkdirSync(fixturesDir, { recursive: true });
    }
    fs.writeFileSync(path.join(fixturesDir, 'coordinate-transform-test.html'), testPageContent);

    await describe('Coordinate Transform Accuracy Tests', async () => {

        await test('Setup: Start HTTP server', async () => {
            serverProcess = spawn('python3', ['-m', 'http.server', PORT.toString()], {
                cwd: projectRoot,
                stdio: ['ignore', 'pipe', 'pipe']
            });
            serverProcess.stdout.on('data', () => {});
            serverProcess.stderr.on('data', () => {});
            await waitForServer(PORT);
        });

        await test('Setup: Launch Puppeteer with WebGL', async () => {
            browser = await puppeteer.launch({
                headless: true,
                args: ['--use-gl=swiftshader', '--disable-gpu', '--no-sandbox']
            });
            page = await browser.newPage();
            await page.setViewport({ width: 256, height: 256 });
            page.on('console', msg => console.log('  [Browser]:', msg.text()));
            page.on('pageerror', error => console.log('  [Error]:', error.message));
            await page.goto(`http://${HOST}:${PORT}/test/fixtures/coordinate-transform-test.html`, {
                waitUntil: 'domcontentloaded'
            });
            await page.waitForFunction(() => window.modulesLoaded === true, { timeout: 10000 });
        });

        // Test forward transform: Cartesian → Native
        for (const tc of TEST_CASES.polar_forward) {
            await test(`Forward: (${tc.cartesian[0]}, ${tc.cartesian[1]}) → (r=${tc.native[0].toFixed(2)}, θ=${tc.native[1].toFixed(2)})`, async () => {
                const result = await page.evaluate((testCase) => {
                    const coordSystem = window.PRESET_COORDINATE_SYSTEMS['polar2d'];
                    const parseFunc = (expr, vars) => window.parseExpression(expr, 2, vars);
                    const forwardGLSL = coordSystem.generateForwardTransformGLSL(['x', 'y'], parseFunc);

                    const shader = `
                        precision highp float;
                        ${forwardGLSL}
                        void main() {
                            vec2 pos_cartesian = vec2(${testCase.cartesian[0]}, ${testCase.cartesian[1]});
                            vec2 pos_native = transformToNative(pos_cartesian);
                            float scale = 10.0;
                            vec2 encoded = (pos_native + scale/2.0) / scale;
                            gl_FragColor = vec4(encoded, 0.0, 1.0);
                        }
                    `;

                    const canvas = document.getElementById('test-canvas');
                    canvas.width = 1; canvas.height = 1;
                    const gl = canvas.getContext('webgl');

                    const vs = gl.createShader(gl.VERTEX_SHADER);
                    gl.shaderSource(vs, 'attribute vec2 a_position; void main() { gl_Position = vec4(a_position, 0, 1); }');
                    gl.compileShader(vs);

                    const fs = gl.createShader(gl.FRAGMENT_SHADER);
                    gl.shaderSource(fs, shader);
                    gl.compileShader(fs);
                    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
                        throw new Error('Shader compile error: ' + gl.getShaderInfoLog(fs));
                    }

                    const program = gl.createProgram();
                    gl.attachShader(program, vs);
                    gl.attachShader(program, fs);
                    gl.linkProgram(program);
                    gl.useProgram(program);

                    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
                    const buffer = gl.createBuffer();
                    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
                    const loc = gl.getAttribLocation(program, 'a_position');
                    gl.enableVertexAttribArray(loc);
                    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

                    gl.viewport(0, 0, 1, 1);
                    gl.clearColor(0, 0, 0, 1);
                    gl.clear(gl.COLOR_BUFFER_BIT);
                    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

                    const pixels = new Uint8Array(4);
                    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

                    const scale = 10.0;
                    const r = (pixels[0] / 255.0) * scale - scale/2;
                    const theta = (pixels[1] / 255.0) * scale - scale/2;
                    return { r, theta };
                }, tc);

                // Use 0.05 tolerance due to 8-bit quantization error
                assertApproxEqual(result.r, tc.native[0], 0.05, `r should be ${tc.native[0]}, got ${result.r}`);
                assertApproxEqual(result.theta, tc.native[1], 0.05, `theta should be ${tc.native[1]}, got ${result.theta}`);
            });
        }

        // Test inverse transform: Native → Cartesian
        for (const tc of TEST_CASES.polar_inverse) {
            await test(`Inverse: (r=${tc.native[0].toFixed(2)}, θ=${tc.native[1].toFixed(2)}) → (${tc.cartesian[0].toFixed(2)}, ${tc.cartesian[1].toFixed(2)})`, async () => {
                const result = await page.evaluate((testCase) => {
                    const coordSystem = window.PRESET_COORDINATE_SYSTEMS['polar2d'];
                    const parseFunc = (expr, vars) => window.parseExpression(expr, 2, vars);
                    const inverseGLSL = coordSystem.generateInverseTransformGLSL(['r', 'theta'], parseFunc);

                    console.log('=== INVERSE GLSL ===');
                    console.log(inverseGLSL);
                    console.log('=== END GLSL ===');

                    const shader = `
                        precision highp float;
                        ${inverseGLSL}
                        void main() {
                            vec2 pos_native = vec2(${testCase.native[0]}, ${testCase.native[1]});
                            vec2 pos_cartesian = transformToCartesian(pos_native);
                            float scale = 10.0;
                            vec2 encoded = (pos_cartesian + scale/2.0) / scale;
                            gl_FragColor = vec4(encoded, 0.0, 1.0);
                        }
                    `;

                    const canvas = document.getElementById('test-canvas');
                    canvas.width = 1; canvas.height = 1;
                    const gl = canvas.getContext('webgl');

                    const vs = gl.createShader(gl.VERTEX_SHADER);
                    gl.shaderSource(vs, 'attribute vec2 a_position; void main() { gl_Position = vec4(a_position, 0, 1); }');
                    gl.compileShader(vs);

                    const fs = gl.createShader(gl.FRAGMENT_SHADER);
                    gl.shaderSource(fs, shader);
                    gl.compileShader(fs);
                    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
                        throw new Error('Shader compile error: ' + gl.getShaderInfoLog(fs));
                    }

                    const program = gl.createProgram();
                    gl.attachShader(program, vs);
                    gl.attachShader(program, fs);
                    gl.linkProgram(program);
                    gl.useProgram(program);

                    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
                    const buffer = gl.createBuffer();
                    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
                    const loc = gl.getAttribLocation(program, 'a_position');
                    gl.enableVertexAttribArray(loc);
                    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

                    gl.viewport(0, 0, 1, 1);
                    gl.clearColor(0, 0, 0, 1);
                    gl.clear(gl.COLOR_BUFFER_BIT);
                    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

                    const pixels = new Uint8Array(4);
                    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

                    const scale = 10.0;
                    const x = (pixels[0] / 255.0) * scale - scale/2;
                    const y = (pixels[1] / 255.0) * scale - scale/2;
                    return { x, y };
                }, tc);

                // Use 0.05 tolerance due to 8-bit quantization error
                assertApproxEqual(result.x, tc.cartesian[0], 0.05, `x should be ${tc.cartesian[0]}, got ${result.x}`);
                assertApproxEqual(result.y, tc.cartesian[1], 0.05, `y should be ${tc.cartesian[1]}, got ${result.y}`);
            });
        }

        // Test round-trip: Cartesian → Native → Cartesian
        for (const cartesian of TEST_CASES.polar_roundtrip) {
            await test(`Round-trip: (${cartesian[0]}, ${cartesian[1]}) → native → back`, async () => {
                const result = await page.evaluate((testCase) => {
                    const coordSystem = window.PRESET_COORDINATE_SYSTEMS['polar2d'];
                    const parseFunc = (expr, vars) => window.parseExpression(expr, 2, vars);
                    const forwardGLSL = coordSystem.generateForwardTransformGLSL(['x', 'y'], parseFunc);
                    const inverseGLSL = coordSystem.generateInverseTransformGLSL(['r', 'theta'], parseFunc);

                    const shader = `
                        precision highp float;
                        ${forwardGLSL}
                        ${inverseGLSL}
                        void main() {
                            vec2 pos_cartesian_orig = vec2(${testCase[0]}, ${testCase[1]});
                            vec2 pos_native = transformToNative(pos_cartesian_orig);
                            vec2 pos_cartesian_final = transformToCartesian(pos_native);
                            float scale = 10.0;
                            vec2 encoded = (pos_cartesian_final + scale/2.0) / scale;
                            gl_FragColor = vec4(encoded, 0.0, 1.0);
                        }
                    `;

                    const canvas = document.getElementById('test-canvas');
                    canvas.width = 1; canvas.height = 1;
                    const gl = canvas.getContext('webgl');

                    const vs = gl.createShader(gl.VERTEX_SHADER);
                    gl.shaderSource(vs, 'attribute vec2 a_position; void main() { gl_Position = vec4(a_position, 0, 1); }');
                    gl.compileShader(vs);

                    const fs = gl.createShader(gl.FRAGMENT_SHADER);
                    gl.shaderSource(fs, shader);
                    gl.compileShader(fs);
                    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
                        throw new Error('Shader compile error: ' + gl.getShaderInfoLog(fs));
                    }

                    const program = gl.createProgram();
                    gl.attachShader(program, vs);
                    gl.attachShader(program, fs);
                    gl.linkProgram(program);
                    gl.useProgram(program);

                    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
                    const buffer = gl.createBuffer();
                    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
                    const loc = gl.getAttribLocation(program, 'a_position');
                    gl.enableVertexAttribArray(loc);
                    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

                    gl.viewport(0, 0, 1, 1);
                    gl.clearColor(0, 0, 0, 1);
                    gl.clear(gl.COLOR_BUFFER_BIT);
                    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

                    const pixels = new Uint8Array(4);
                    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

                    const scale = 10.0;
                    const x = (pixels[0] / 255.0) * scale - scale/2;
                    const y = (pixels[1] / 255.0) * scale - scale/2;
                    return { x, y };
                }, cartesian);

                // Use 0.05 tolerance due to 8-bit quantization error
                assertApproxEqual(result.x, cartesian[0], 0.05, `x round-trip failed: expected ${cartesian[0]}, got ${result.x}`);
                assertApproxEqual(result.y, cartesian[1], 0.05, `y round-trip failed: expected ${cartesian[1]}, got ${result.y}`);
            });
        }

        await test('Cleanup: Close browser and server', async () => {
            if (browser) await browser.close();
            if (serverProcess) serverProcess.kill();
        });
    });
}

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
