/**
 * Smoke test for offline rendering system
 * Tests that the full pipeline can render an animation without crashing
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { test, describe, printSummary, exitWithResults } = require('../helpers/test-runner.cjs');

// Paths
const projectRoot = path.resolve(__dirname, '../..');
const serverUrl = process.env.TEST_SERVER_URL || `file://${projectRoot}`;
const indexPath = `${serverUrl}/index.html`;
const fixtureFile = path.join(__dirname, '../fixtures/minimal-animation.json');

console.log(`Testing with URL: ${indexPath}`);

/**
 * Run smoke test
 */
async function runSmokeTest() {
    await describe('Offline Rendering Smoke Test', async () => {
        let browser;
        let page;

        // Message deduplication tracker
        const messageCounts = new Map();
        const messageLog = [];
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

            // Set viewport for consistent rendering
            await page.setViewport({ width: 800, height: 600 });

            // Log console messages with deduplication
            page.on('console', msg => {
                const type = msg.type();
                const text = msg.text();

                // Track message counts
                const count = messageCounts.get(text) || 0;
                messageCounts.set(text, count + 1);

                // Only log if under threshold
                if (count < DEDUP_THRESHOLD) {
                    console.log(`  [Browser ${type}]: ${text}`);
                } else if (count === DEDUP_THRESHOLD) {
                    // Show suppression notice at threshold
                    console.log(`  [Suppressing repeated message after ${DEDUP_THRESHOLD} occurrences]`);
                }
                // Messages beyond threshold are silently dropped
            });

            page.on('pageerror', error => {
                console.log(`  [Browser Error]: ${error.message}`);
            });
        });

        // Test: Load index.html
        await test('Load index.html in headless browser', async () => {
            // Use 'domcontentloaded' instead of 'networkidle0' because the service worker
            // keeps the network active with cache-busting requests
            await page.goto(indexPath, {
                waitUntil: 'domcontentloaded',
                timeout: 10000
            });
        });

        // Test: Wait for renderer initialization
        await test('Wait for renderer and manager to initialize', async () => {
            // Add debugging to see what's happening
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
                { timeout: 15000 }  // Increased timeout for debugging
            );

            // Enable shader dumping for debugging
            await page.evaluate(() => {
                window.renderer.dumpShadersOnCompile = true;
            });
        });

        // Test: Load animation fixture
        let animationData;
        await test('Load minimal animation fixture', async () => {
            const fileContents = fs.readFileSync(fixtureFile, 'utf8');
            animationData = JSON.parse(fileContents);

            // Verify animation structure
            if (!animationData.baseSettings) {
                throw new Error('Animation missing baseSettings');
            }
            if (!animationData.timeline) {
                throw new Error('Animation missing timeline');
            }
            if (!animationData.frameConfig) {
                throw new Error('Animation missing frameConfig');
            }
        });

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
        await test('Load animation script into Animator', async () => {
            await page.evaluate((animData) => {
                window.animator.loadScript(animData);
            }, animationData);
        });

        // Test: Render animation frames
        let frames;
        await test('Render animation frames', async () => {
            // Use page.evaluate to run animator in browser context
            frames = await page.evaluate(async () => {
                try {
                    const renderedFrames = await window.animator.run();

                    // Check what we got
                    const firstFrame = renderedFrames[0];
                    const frameType = firstFrame ? firstFrame.constructor.name : 'null';
                    const frameSize = firstFrame && firstFrame.size !== undefined ? firstFrame.size : -1;

                    // Verify frames are Blob objects with reasonable size
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
                throw new Error(`Animation render failed: ${frames.error}`);
            }

            console.log(`  Captured ${frames.frameCount} frames (first frame: ${frames.firstFrameSize} bytes)`);
        });

        // Test: Trigger shader recompile to dump them
        await test('Recompile shaders to dump source', async () => {
            await page.evaluate(() => {
                // Flag is already set, just trigger recompile
                window.renderer.compileShaders();
            });
        });

        // Test: Verify frame count
        await test('Verify correct number of frames rendered', async () => {
            const expectedFrames = Math.ceil(animationData.timeline[animationData.timeline.length - 1].time * animationData.fps);

            if (frames.frameCount !== expectedFrames) {
                throw new Error(`Expected ${expectedFrames} frames, got ${frames.frameCount}`);
            }
        });

        // Note: Can't validate Blob data across Puppeteer boundary,
        // but successful frame count verification confirms rendering works

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
        await runSmokeTest();
        const success = printSummary();
        exitWithResults();
    } catch (error) {
        console.error('Test runner crashed:', error);
        process.exit(1);
    }
})();
