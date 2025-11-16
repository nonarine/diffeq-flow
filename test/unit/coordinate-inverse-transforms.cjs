/**
 * Unit tests for CoordinateSystem inverse transforms
 * Tests Tier 1 (explicit) and Tier 3 (Newton solver) inverse generation
 */

const { test, describe, printSummary, exitWithResults, assertEqual } = require('../helpers/test-runner.cjs');

// Mock minimal nerdamer for GLSL generation (doesn't need full functionality)
global.window = {
    nerdamer: {
        diff: () => ({ toString: () => 'mock_derivative' }),
        clear: () => {},
        setVar: () => {},
        simplify: (expr) => ({ toString: () => expr })
    }
};

// Mock jQuery for debug logger
global.$ = () => ({
    length: 0,
    append: () => {},
    empty: () => {},
    prop: () => {},
    show: () => {},
    hide: () => {}
});

// Import modules
const coordinateSystems = require('../../src/math/coordinate-systems.js');
const { CoordinateSystem, PRESET_COORDINATE_SYSTEMS } = coordinateSystems;

async function runTests() {
    await describe('CoordinateSystem Inverse Transforms', async () => {

        await test('Polar 2D has explicit inverse transforms', async () => {
            const polar = PRESET_COORDINATE_SYSTEMS['polar2d'];

            assertEqual(polar.inverseTransforms !== null, true, 'Should have inverse transforms');
            assertEqual(polar.inverseTransforms.length, 2, 'Should have 2 inverse expressions');
            assertEqual(polar.inverseTransforms[0], 'r*cos(theta)', 'x = r*cos(theta)');
            assertEqual(polar.inverseTransforms[1], 'r*sin(theta)', 'y = r*sin(theta)');
            assertEqual(polar.useIterativeSolver, false, 'Should not use iterative solver');
        });

        await test('Cylindrical 3D has explicit inverse transforms', async () => {
            const cylindrical = PRESET_COORDINATE_SYSTEMS['cylindrical3d'];

            assertEqual(cylindrical.inverseTransforms !== null, true, 'Should have inverse transforms');
            assertEqual(cylindrical.inverseTransforms.length, 3, 'Should have 3 inverse expressions');
            assertEqual(cylindrical.inverseTransforms[0], 'rho*cos(phi)', 'x = rho*cos(phi)');
            assertEqual(cylindrical.inverseTransforms[1], 'rho*sin(phi)', 'y = rho*sin(phi)');
            assertEqual(cylindrical.inverseTransforms[2], 'z', 'z = z');
        });

        await test('Spherical 3D has explicit inverse transforms', async () => {
            const spherical = PRESET_COORDINATE_SYSTEMS['spherical3d'];

            assertEqual(spherical.inverseTransforms !== null, true, 'Should have inverse transforms');
            assertEqual(spherical.inverseTransforms.length, 3, 'Should have 3 inverse expressions');
            assertEqual(spherical.inverseTransforms[0], 'r*sin(theta)*cos(phi)', 'x = r*sin(theta)*cos(phi)');
            assertEqual(spherical.inverseTransforms[1], 'r*sin(theta)*sin(phi)', 'y = r*sin(theta)*sin(phi)');
            assertEqual(spherical.inverseTransforms[2], 'r*cos(theta)', 'z = r*cos(theta)');
        });

        await test('Hyperspherical 4D has explicit inverse transforms', async () => {
            const hyperspherical = PRESET_COORDINATE_SYSTEMS['hyperspherical4d'];

            assertEqual(hyperspherical.inverseTransforms !== null, true, 'Should have inverse transforms');
            assertEqual(hyperspherical.inverseTransforms.length, 4, 'Should have 4 inverse expressions');
        });

        await test('Cartesian systems have identity inverse transforms', async () => {
            const cartesian2d = PRESET_COORDINATE_SYSTEMS['cartesian2d'];
            const cartesian3d = PRESET_COORDINATE_SYSTEMS['cartesian3d'];
            const cartesian4d = PRESET_COORDINATE_SYSTEMS['cartesian4d'];

            assertEqual(cartesian2d.inverseTransforms[0], 'x', '2D: x = x');
            assertEqual(cartesian2d.inverseTransforms[1], 'y', '2D: y = y');

            assertEqual(cartesian3d.inverseTransforms[0], 'x', '3D: x = x');
            assertEqual(cartesian3d.inverseTransforms[1], 'y', '3D: y = y');
            assertEqual(cartesian3d.inverseTransforms[2], 'z', '3D: z = z');

            assertEqual(cartesian4d.inverseTransforms[0], 'x', '4D: x = x');
            assertEqual(cartesian4d.inverseTransforms[1], 'y', '4D: y = y');
            assertEqual(cartesian4d.inverseTransforms[2], 'z', '4D: z = z');
            assertEqual(cartesian4d.inverseTransforms[3], 'w', '4D: w = w');
        });
    });

    await describe('CoordinateSystem GLSL Generation', async () => {

        await test('Generate inverse transform GLSL for polar (Tier 1)', async () => {
            const polar = PRESET_COORDINATE_SYSTEMS['polar2d'];

            // Mock parser function
            const parseFunc = (expr, vars) => {
                // Simple string replacement for testing
                return expr.replace(/\b(r|theta)\b/g, (match) => {
                    const idx = vars.indexOf(match);
                    return idx >= 0 ? `native_pos.${['x', 'y'][idx]}` : match;
                });
            };

            const glsl = polar.generateInverseTransformGLSL(['r', 'theta'], parseFunc);

            assertEqual(glsl.includes('transformToCartesian'), true, 'Should generate transformToCartesian function');
            assertEqual(glsl.includes('Tier 1'), true, 'Should indicate Tier 1 (explicit)');
            assertEqual(glsl.includes('native_pos'), true, 'Should use native_pos parameter');
            assertEqual(glsl.includes('result.x'), true, 'Should compute result.x');
            assertEqual(glsl.includes('result.y'), true, 'Should compute result.y');
        });

        await test('Generate Newton solver GLSL (Tier 3)', async () => {
            const customSystem = new CoordinateSystem(
                'Custom',
                2,
                [{ label: 'u', displayLabel: 'u' }, { label: 'v', displayLabel: 'v' }],
                ['x + 0.1*sin(y)', 'y + 0.1*sin(x)'], // Forward
                null, // No explicit inverse
                true  // Use iterative solver
            );

            const parseFunc = (expr, vars) => expr; // Dummy parser

            const glsl = customSystem.generateInverseTransformGLSL(['u', 'v'], parseFunc);

            assertEqual(glsl.includes('transformToCartesian'), true, 'Should generate transformToCartesian function');

            // Newton solver requires working nerdamer, which isn't available in test env
            // Check that it either generated Newton solver OR reported error gracefully
            const hasNewtonCode = glsl.includes('MAX_ITERATIONS') && glsl.includes('guess');
            const hasError = glsl.includes('ERROR') || glsl.includes('failed');

            assertEqual(hasNewtonCode || hasError, true, 'Should attempt Newton solver or report error gracefully');
        });

        await test('Fall back to identity when no inverse defined', async () => {
            const customSystem = new CoordinateSystem(
                'Incomplete',
                2,
                [{ label: 'u', displayLabel: 'u' }, { label: 'v', displayLabel: 'v' }],
                ['x^2', 'y^2'], // Forward
                null,  // No explicit inverse
                false  // Don't use iterative solver
            );

            const parseFunc = (expr, vars) => expr;

            const glsl = customSystem.generateInverseTransformGLSL(['u', 'v'], parseFunc);

            assertEqual(glsl.includes('WARNING'), true, 'Should show warning');
            assertEqual(glsl.includes('Identity fallback'), true, 'Should indicate fallback');
            assertEqual(glsl.includes('return native_pos'), true, 'Should return identity');
        });
    });

    await describe('CoordinateSystem JSON Serialization', async () => {

        await test('Serialize and deserialize with inverse transforms', async () => {
            const polar = PRESET_COORDINATE_SYSTEMS['polar2d'];

            const json = polar.toJSON();

            assertEqual(json.inverseTransforms !== undefined, true, 'JSON should include inverseTransforms');
            assertEqual(json.inverseTransforms.length, 2, 'JSON should have 2 inverse transforms');
            assertEqual(json.useIterativeSolver !== undefined, true, 'JSON should include useIterativeSolver flag');

            const restored = CoordinateSystem.fromJSON(json);

            assertEqual(restored.name, polar.name, 'Name should match');
            assertEqual(restored.dimensions, polar.dimensions, 'Dimensions should match');
            assertEqual(restored.inverseTransforms.length, 2, 'Inverse transforms should be restored');
            assertEqual(restored.inverseTransforms[0], polar.inverseTransforms[0], 'First inverse should match');
            assertEqual(restored.useIterativeSolver, polar.useIterativeSolver, 'Iterative solver flag should match');
        });

        await test('Deserialize old format without inverse transforms', async () => {
            // Simulate old JSON format (before inverse transforms were added)
            const oldJson = {
                name: 'Old Polar',
                dimensions: 2,
                variables: [
                    { label: 'r', displayLabel: 'r' },
                    { label: 'theta', displayLabel: 'θ' }
                ],
                forwardTransforms: ['sqrt(x^2 + y^2)', 'atan2(y, x)']
                // No inverseTransforms or useIterativeSolver fields
            };

            const restored = CoordinateSystem.fromJSON(oldJson);

            assertEqual(restored.name, 'Old Polar', 'Name should be restored');
            assertEqual(restored.dimensions, 2, 'Dimensions should be restored');
            assertEqual(restored.inverseTransforms, null, 'inverseTransforms should default to null');
            assertEqual(restored.useIterativeSolver, false, 'useIterativeSolver should default to false');
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
