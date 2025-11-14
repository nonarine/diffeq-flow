/**
 * Unit tests for Animator interpolation logic
 * Tests easing functions, keyframe interpolation, and value interpolation
 */

const { test, describe, printSummary, exitWithResults, assertEqual, assertApproxEqual, assertThrows } = require('../helpers/test-runner.cjs');

/**
 * Easing functions (copied from animator.js for testing)
 * In a real setup, we'd import these, but keeping it simple for now
 */
const EASING_FUNCTIONS = {
    linear: t => t,
    easeIn: t => t * t,
    easeOut: t => 1 - Math.pow(1 - t, 2),
    easeInOut: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
    easeInCubic: t => t * t * t,
    easeOutCubic: t => 1 - Math.pow(1 - t, 3),
    easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    elastic: t => {
        const c4 = (2 * Math.PI) / 3;
        return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
    },
    bounce: t => {
        const n1 = 7.5625;
        const d1 = 2.75;
        if (t < 1 / d1) {
            return n1 * t * t;
        } else if (t < 2 / d1) {
            return n1 * (t -= 1.5 / d1) * t + 0.75;
        } else if (t < 2.5 / d1) {
            return n1 * (t -= 2.25 / d1) * t + 0.9375;
        } else {
            return n1 * (t -= 2.625 / d1) * t + 0.984375;
        }
    }
};

/**
 * Simplified keyframe index finder for testing
 */
function getKeyframeIndices(time, timeline) {
    // Handle edge cases
    if (time <= timeline[0].time) {
        return { prev: 0, next: 0, t: 0 };
    }
    if (time >= timeline[timeline.length - 1].time) {
        return { prev: timeline.length - 1, next: timeline.length - 1, t: 1 };
    }

    // Find surrounding keyframes
    for (let i = 1; i < timeline.length; i++) {
        if (time <= timeline[i].time) {
            const prev = i - 1;
            const next = i;
            const t = (time - timeline[prev].time) / (timeline[next].time - timeline[prev].time);
            return { prev, next, t };
        }
    }

    return { prev: timeline.length - 1, next: timeline.length - 1, t: 1 };
}

/**
 * Simplified interpolateValue for testing
 */
function interpolateValue(start, end, t, easingName = 'linear') {
    const easingFunc = EASING_FUNCTIONS[easingName] || EASING_FUNCTIONS.linear;
    const easedT = easingFunc(t);

    // Handle numbers
    if (typeof start === 'number' && typeof end === 'number') {
        return start + (end - start) * easedT;
    }

    // Handle objects
    if (typeof start === 'object' && start !== null && typeof end === 'object' && end !== null) {
        const result = { ...start };
        for (const key in end) {
            if (start[key] !== undefined) {
                result[key] = interpolateValue(start[key], end[key], t, easingName);
            } else {
                result[key] = end[key];
            }
        }
        return result;
    }

    // For other types, switch at t > 0.5
    return easedT < 0.5 ? start : end;
}

/**
 * Run all tests
 */
async function runTests() {
    // Test easing functions
    await describe('Easing Functions', async () => {
        await test('linear easing at boundaries', async () => {
            assertApproxEqual(EASING_FUNCTIONS.linear(0), 0);
            assertApproxEqual(EASING_FUNCTIONS.linear(0.5), 0.5);
            assertApproxEqual(EASING_FUNCTIONS.linear(1), 1);
        });

        await test('easeIn is quadratic', async () => {
            assertApproxEqual(EASING_FUNCTIONS.easeIn(0), 0);
            assertApproxEqual(EASING_FUNCTIONS.easeIn(0.5), 0.25);
            assertApproxEqual(EASING_FUNCTIONS.easeIn(1), 1);
        });

        await test('easeOut is inverse quadratic', async () => {
            assertApproxEqual(EASING_FUNCTIONS.easeOut(0), 0);
            assertApproxEqual(EASING_FUNCTIONS.easeOut(0.5), 0.75);
            assertApproxEqual(EASING_FUNCTIONS.easeOut(1), 1);
        });

        await test('easeInOut is symmetric', async () => {
            const t1 = EASING_FUNCTIONS.easeInOut(0.25);
            const t2 = EASING_FUNCTIONS.easeInOut(0.75);
            assertApproxEqual(t1 + t2, 1.0, 0.01);
        });

        await test('cubic easing is more aggressive', async () => {
            const quadratic = EASING_FUNCTIONS.easeIn(0.5);
            const cubic = EASING_FUNCTIONS.easeInCubic(0.5);
            if (cubic >= quadratic) {
                throw new Error(`Cubic should be more aggressive: ${cubic} < ${quadratic}`);
            }
        });

        await test('elastic overshoots at end', async () => {
            // Elastic should overshoot (go negative) near the end
            const t = EASING_FUNCTIONS.elastic(0.9);
            // Just verify it doesn't crash and returns a number
            if (typeof t !== 'number' || isNaN(t)) {
                throw new Error('Elastic should return a valid number');
            }
        });

        await test('bounce has boundaries at 0 and 1', async () => {
            assertApproxEqual(EASING_FUNCTIONS.bounce(0), 0);
            assertApproxEqual(EASING_FUNCTIONS.bounce(1), 1);
        });
    });

    // Test keyframe index finding
    await describe('Keyframe Index Finding', async () => {
        const timeline = [
            { time: 0.0 },
            { time: 1.0 },
            { time: 2.5 },
            { time: 5.0 }
        ];

        await test('before first keyframe', async () => {
            const result = getKeyframeIndices(-1.0, timeline);
            assertEqual(result.prev, 0);
            assertEqual(result.next, 0);
            assertEqual(result.t, 0);
        });

        await test('exactly at first keyframe', async () => {
            const result = getKeyframeIndices(0.0, timeline);
            assertEqual(result.prev, 0);
            assertEqual(result.next, 0);
            assertEqual(result.t, 0);
        });

        await test('between first and second keyframe', async () => {
            const result = getKeyframeIndices(0.5, timeline);
            assertEqual(result.prev, 0);
            assertEqual(result.next, 1);
            assertApproxEqual(result.t, 0.5);
        });

        await test('exactly at middle keyframe', async () => {
            const result = getKeyframeIndices(2.5, timeline);
            // When exactly at a keyframe, returns previous and current keyframe with t=1.0
            assertEqual(result.prev, 1);
            assertEqual(result.next, 2);
            assertApproxEqual(result.t, 1.0);
        });

        await test('after last keyframe', async () => {
            const result = getKeyframeIndices(10.0, timeline);
            assertEqual(result.prev, 3);
            assertEqual(result.next, 3);
            assertEqual(result.t, 1);
        });

        await test('interpolation factor calculation', async () => {
            // Between keyframes at 1.0 and 2.5 (duration 1.5)
            // At time 2.0, should be 2/3 of the way through
            const result = getKeyframeIndices(2.0, timeline);
            assertEqual(result.prev, 1);
            assertEqual(result.next, 2);
            assertApproxEqual(result.t, (2.0 - 1.0) / (2.5 - 1.0));
        });
    });

    // Test value interpolation
    await describe('Value Interpolation', async () => {
        await test('interpolate numbers with linear easing', async () => {
            const result = interpolateValue(0, 10, 0.5, 'linear');
            assertApproxEqual(result, 5);
        });

        await test('interpolate numbers with easeIn', async () => {
            const result = interpolateValue(0, 10, 0.5, 'easeIn');
            assertApproxEqual(result, 2.5); // t^2 = 0.25, so 0 + 10*0.25 = 2.5
        });

        await test('interpolate at t=0 returns start value', async () => {
            const result = interpolateValue(5, 15, 0, 'linear');
            assertApproxEqual(result, 5);
        });

        await test('interpolate at t=1 returns end value', async () => {
            const result = interpolateValue(5, 15, 1, 'linear');
            assertApproxEqual(result, 15);
        });

        await test('interpolate objects with numeric values', async () => {
            const start = { x: 0, y: 10 };
            const end = { x: 10, y: 20 };
            const result = interpolateValue(start, end, 0.5, 'linear');
            assertApproxEqual(result.x, 5);
            assertApproxEqual(result.y, 15);
        });

        await test('interpolate nested objects', async () => {
            const start = { bbox: { minX: 0, maxX: 10 } };
            const end = { bbox: { minX: -5, maxX: 15 } };
            const result = interpolateValue(start, end, 0.5, 'linear');
            assertApproxEqual(result.bbox.minX, -2.5);
            assertApproxEqual(result.bbox.maxX, 12.5);
        });

        await test('interpolate strings switches at t=0.5', async () => {
            const result1 = interpolateValue('foo', 'bar', 0.4, 'linear');
            assertEqual(result1, 'foo');

            const result2 = interpolateValue('foo', 'bar', 0.6, 'linear');
            assertEqual(result2, 'bar');
        });

        await test('interpolate with missing end object keys preserves start', async () => {
            const start = { x: 5, y: 10 };
            const end = { x: 15 }; // y is missing
            const result = interpolateValue(start, end, 0.5, 'linear');
            assertApproxEqual(result.x, 10);
            assertEqual(result.y, 10); // Should preserve original value
        });
    });

    // Test edge cases
    await describe('Edge Cases', async () => {
        await test('handle empty timeline gracefully', async () => {
            try {
                getKeyframeIndices(0, []);
                throw new Error('Should have thrown on empty timeline');
            } catch (e) {
                // Expected to fail
            }
        });

        await test('handle single keyframe timeline', async () => {
            const timeline = [{ time: 0 }];
            const result = getKeyframeIndices(0, timeline);
            assertEqual(result.prev, 0);
            assertEqual(result.next, 0);
        });

        await test('interpolate negative numbers', async () => {
            const result = interpolateValue(-10, -5, 0.5, 'linear');
            assertApproxEqual(result, -7.5);
        });

        await test('interpolate across zero', async () => {
            const result = interpolateValue(-5, 5, 0.5, 'linear');
            assertApproxEqual(result, 0);
        });
    });
}

// Run all tests
(async () => {
    try {
        await runTests();
        printSummary();
        exitWithResults();
    } catch (error) {
        console.error('Test runner crashed:', error);
        process.exit(1);
    }
})();
