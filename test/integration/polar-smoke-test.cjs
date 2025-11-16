/**
 * Smoke test for polar coordinate system with native-space integration
 * Tests that the system can render animations using polar coordinates
 * and that round-trip transformations work correctly
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { test, describe, printSummary, exitWithResults, assertApproxEqual } = require('../helpers/test-runner.cjs');

// Paths
const projectRoot = path.resolve(__dirname, '../..');
const serverUrl = process.env.TEST_SERVER_URL || `file://${projectRoot}`;
const indexPath = `${serverUrl}/index.html`;
const fixtureFile = path.join(__dirname, '../fixtures/polar-animation.json');

console.log(`Testing polar coordinates with URL: ${indexPath}`);

/**
 * Run polar coordinate smoke test
 */
async function runPolarSmokeTest() {
    await describe('Polar Coordinate System Smoke Test', async () => {
        let browser;
        let page;

        // Message deduplication tracker
        const messageCounts = new Map();
        const DEDUP_THRESHOLD = 5;

        // Setup: Launch browser
        await test('Setup: Launch puppeteer browser', async () => {
            browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--use-gl=swiftshader',
                    '--disable-gpu'
                ]
            });
            page = await browser.newPage();
            await page.setViewport({ width: 800, height: 600 });

            // Log console messages with deduplication
            page.on('console', msg => {
                const type = msg.type();
                const text = msg.text();
                const count = messageCounts.get(text) || 0;
                messageCounts.set(text, count + 1);

                if (count < DEDUP_THRESHOLD) {
                    console.log(`  [Browser ${type}]: ${text}`);
                } else if (count === DEDUP_THRESHOLD) {
                    console.log(`  [Suppressing repeated message after ${DEDUP_THRESHOLD} occurrences]`);
                }
            });

            page.on('pageerror', error => {
                console.log(`  [Browser Error]: ${error.message}`);
            });
        });

        // Test: Load index.html
        await test('Load index.html in headless browser', async () => {
            await page.goto(indexPath, {
                waitUntil: 'domcontentloaded',
                timeout: 10000
            });
        });

        // Test: Wait for renderer initialization
        await test('Wait for renderer and manager to initialize', async () => {
            const debugInfo = await page.evaluate(() => {
                return {
                    hasRenderer: !!window.renderer,
                    hasManager: !!window.manager,
                    hasJQuery: !!window.$,
                    isDocumentReady: document.readyState
                };
            });
            console.log('  Debug:', JSON.stringify(debugInfo));

            await page.waitForFunction(
                'window.renderer && window.manager',
                { timeout: 15000 }
            );

            // Enable shader dumping for debugging
            await page.evaluate(() => {
                window.renderer.dumpShadersOnCompile = true;
            });
        });

        // Test: Load polar coordinate animation fixture
        let animationData;
        await test('Load polar coordinate animation fixture', async () => {
            const fileContents = fs.readFileSync(fixtureFile, 'utf8');
            animationData = JSON.parse(fileContents);

            // Verify animation structure
            if (!animationData.baseSettings) {
                throw new Error('Animation missing baseSettings');
            }
            if (!animationData.baseSettings.coordinateSystem) {
                throw new Error('Animation missing coordinateSystem');
            }
            if (!animationData.timeline) {
                throw new Error('Animation missing timeline');
            }
            if (!animationData.frameConfig) {
                throw new Error('Animation missing frameConfig');
            }

            console.log(`  Coordinate system: ${animationData.baseSettings.coordinateSystem.name}`);
            console.log(`  Forward transforms: [${animationData.baseSettings.coordinateSystem.forwardTransforms.join(', ')}]`);
            console.log(`  Inverse transforms: [${animationData.baseSettings.coordinateSystem.inverseTransforms.join(', ')}]`);
            console.log(`  Velocity field: dr/dt = ${animationData.baseSettings.expressions[0]}, dθ/dt = ${animationData.baseSettings.expressions[1]}`);
        });

        // Note: Coordinate transform accuracy is tested in unit tests (coordinate-transform-accuracy.cjs)
        // This smoke test focuses on end-to-end animation workflow

        // Test: Import Animator module
        await test('Import Animator module in browser', async () => {
            await page.evaluate(async () => {
                const module = await import('./src/animation/animator.js');
                window.AnimatorClass = module.Animator;
            });
        });

        // Test: Create Animator instance
        await test('Create Animator instance', async () => {
            await page.evaluate(() => {
                window.animator = new window.AnimatorClass(
                    window.renderer,
                    window.manager
                );
            });
        });

        // Test: Load animation script
        await test('Load polar animation script into Animator', async () => {
            await page.evaluate((animData) => {
                window.animator.loadScript(animData);
            }, animationData);
        });

        // Test: Render animation frames
        let frames;
        await test('Render polar coordinate animation frames', async () => {
            frames = await page.evaluate(async () => {
                try {
                    const renderedFrames = await window.animator.run();

                    const firstFrame = renderedFrames[0];
                    const frameType = firstFrame ? firstFrame.constructor.name : 'null';
                    const frameSize = firstFrame && firstFrame.size !== undefined ? firstFrame.size : -1;

                    const firstFrameValid = firstFrame &&
                        firstFrame instanceof Blob &&
                        frameSize > 1000;

                    return {
                        success: true,
                        frameCount: renderedFrames.length,
                        firstFrameType: frameType,
                        firstFrameSize: frameSize,
                        firstFrameValid
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: error.message,
                        stack: error.stack
                    };
                }
            });

            if (!frames.success) {
                throw new Error(`Polar animation render failed: ${frames.error}\n${frames.stack}`);
            }

            console.log(`  ✓ Captured ${frames.frameCount} frames (first frame: ${frames.firstFrameSize} bytes)`);
        });

        // Test: Verify frame count
        await test('Verify correct number of frames rendered', async () => {
            const expectedFrames = Math.ceil(animationData.timeline[animationData.timeline.length - 1].time * animationData.fps);

            if (frames.frameCount !== expectedFrames) {
                throw new Error(`Expected ${expectedFrames} frames, got ${frames.frameCount}`);
            }
        });

        // Test: Verify coordinate system was set correctly (after animation runs)
        await test('Verify polar coordinate system is active', async () => {
            const coordInfo = await page.evaluate(() => {
                const cs = window.renderer.coordinateSystem;
                return {
                    name: cs.name,
                    dimensions: cs.dimensions,
                    hasInverseTransforms: !!cs.inverseTransforms,
                    inverseCount: cs.inverseTransforms ? cs.inverseTransforms.length : 0,
                    useIterativeSolver: cs.useIterativeSolver
                };
            });

            console.log('  Coordinate system info:', JSON.stringify(coordInfo));

            if (coordInfo.name !== 'Polar 2D') {
                throw new Error(`Expected Polar 2D coordinate system, got ${coordInfo.name}`);
            }
            if (!coordInfo.hasInverseTransforms) {
                throw new Error('Polar coordinate system missing inverse transforms');
            }
            if (coordInfo.inverseCount !== 2) {
                throw new Error(`Expected 2 inverse transforms, got ${coordInfo.inverseCount}`);
            }
        });

        // Test: Verify shader used native-space integration
        await test('Verify shader uses native-space integration', async () => {
            const shaderInfo = await page.evaluate(() => {
                // Check update shader for native-space integration markers
                const updateShader = window.renderer.shaderSource.updateFragment;

                return {
                    hasTransformToNative: updateShader.includes('transformToNative'),
                    hasTransformToCartesian: updateShader.includes('transformToCartesian'),
                    hasOldVelocityTransform: updateShader.includes('transformVelocityToCartesian'),
                    hasNativeIntegrationComment: updateShader.includes('NATIVE-SPACE INTEGRATION')
                };
            });

            console.log('  Shader analysis:', JSON.stringify(shaderInfo));

            if (!shaderInfo.hasTransformToNative) {
                throw new Error('Shader missing transformToNative function - not using coordinate system');
            }
            if (!shaderInfo.hasTransformToCartesian) {
                throw new Error('Shader missing transformToCartesian function - missing inverse transform');
            }
            if (shaderInfo.hasNativeIntegrationComment) {
                console.log('  ✓ Shader confirmed to use native-space integration approach');
            }
        });

        // Cleanup
        await test('Cleanup: Close browser', async () => {
            if (browser) {
                await browser.close();
            }

            // Print message deduplication summary
            const deduplicated = Array.from(messageCounts.entries())
                .filter(([msg, count]) => count > DEDUP_THRESHOLD)
                .sort((a, b) => b[1] - a[1]);

            if (deduplicated.length > 0) {
                console.log('\n========== MESSAGE DEDUPLICATION SUMMARY ==========');
                console.log(`Suppressed ${deduplicated.length} message types that exceeded ${DEDUP_THRESHOLD} occurrences:\n`);

                deduplicated.forEach(([message, count]) => {
                    const truncated = message.length > 80 ? message.substring(0, 77) + '...' : message;
                    console.log(`  ${count}x: ${truncated}`);
                });

                const totalSuppressed = deduplicated.reduce((sum, [msg, count]) => sum + (count - DEDUP_THRESHOLD), 0);
                console.log(`\nTotal messages suppressed: ${totalSuppressed}`);
                console.log('===================================================\n');
            }
        });
    });
}

// Run tests
(async () => {
    try {
        await runPolarSmokeTest();
        const success = printSummary();
        exitWithResults();
    } catch (error) {
        console.error('Test runner crashed:', error);
        process.exit(1);
    }
})();
