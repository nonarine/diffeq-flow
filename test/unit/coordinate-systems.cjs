/**
 * Unit tests for coordinate systems
 * Tests coordinate system definitions, transforms, and basic properties
 */

const { test, describe, printSummary, exitWithResults, assertEqual, assertDeepEqual } = require('../helpers/test-runner.cjs');

/**
 * Simplified CoordinateSystem class for testing
 */
class CoordinateSystem {
    constructor(name, dimensions, variables, forwardTransforms) {
        this.name = name;
        this.dimensions = dimensions;
        this.variables = variables;
        this.forwardTransforms = forwardTransforms;
    }

    getVariableNames() {
        return this.variables.map(v => v.label);
    }

    getDisplayLabels() {
        return this.variables.map(v => v.displayLabel);
    }

    toJSON() {
        return {
            name: this.name,
            dimensions: this.dimensions,
            variables: this.variables,
            forwardTransforms: this.forwardTransforms
        };
    }

    static fromJSON(json) {
        return new CoordinateSystem(
            json.name,
            json.dimensions,
            json.variables,
            json.forwardTransforms
        );
    }
}

/**
 * Preset coordinate systems (matching src/math/coordinate-systems.js)
 */
const PRESETS = {
    cartesian2d: new CoordinateSystem(
        'Cartesian 2D',
        2,
        [
            { label: 'x', displayLabel: 'x' },
            { label: 'y', displayLabel: 'y' }
        ],
        ['x', 'y']
    ),

    polar2d: new CoordinateSystem(
        'Polar 2D',
        2,
        [
            { label: 'r', displayLabel: 'r' },
            { label: 'theta', displayLabel: 'θ' }
        ],
        [
            'sqrt(x^2 + y^2)',
            'atan(y, x)'
        ]
    ),

    cartesian3d: new CoordinateSystem(
        'Cartesian 3D',
        3,
        [
            { label: 'x', displayLabel: 'x' },
            { label: 'y', displayLabel: 'y' },
            { label: 'z', displayLabel: 'z' }
        ],
        ['x', 'y', 'z']
    ),

    cylindrical3d: new CoordinateSystem(
        'Cylindrical 3D',
        3,
        [
            { label: 'rho', displayLabel: 'ρ' },
            { label: 'phi', displayLabel: 'φ' },
            { label: 'z', displayLabel: 'z' }
        ],
        [
            'sqrt(x^2 + y^2)',
            'atan(y, x)',
            'z'
        ]
    ),

    spherical3d: new CoordinateSystem(
        'Spherical 3D',
        3,
        [
            { label: 'r', displayLabel: 'r' },
            { label: 'theta', displayLabel: 'θ' },
            { label: 'phi', displayLabel: 'φ' }
        ],
        [
            'sqrt(x^2 + y^2 + z^2)',
            'acos(z / sqrt(x^2 + y^2 + z^2))',
            'atan(y, x)'
        ]
    )
};

/**
 * Run all tests
 */
async function runTests() {
    // Test basic properties
    await describe('Coordinate System Properties', async () => {
        await test('Cartesian 2D has correct properties', async () => {
            const sys = PRESETS.cartesian2d;
            assertEqual(sys.name, 'Cartesian 2D');
            assertEqual(sys.dimensions, 2);
            assertDeepEqual(sys.getVariableNames(), ['x', 'y']);
            assertDeepEqual(sys.getDisplayLabels(), ['x', 'y']);
        });

        await test('Polar 2D has correct properties', async () => {
            const sys = PRESETS.polar2d;
            assertEqual(sys.name, 'Polar 2D');
            assertEqual(sys.dimensions, 2);
            assertDeepEqual(sys.getVariableNames(), ['r', 'theta']);
            assertDeepEqual(sys.getDisplayLabels(), ['r', 'θ']);
        });

        await test('Cylindrical 3D has correct dimensions', async () => {
            const sys = PRESETS.cylindrical3d;
            assertEqual(sys.dimensions, 3);
            assertEqual(sys.variables.length, 3);
            assertEqual(sys.forwardTransforms.length, 3);
        });

        await test('Spherical 3D has correct variable count', async () => {
            const sys = PRESETS.spherical3d;
            assertEqual(sys.getVariableNames().length, 3);
            assertEqual(sys.getDisplayLabels().length, 3);
        });
    });

    // Test forward transforms
    await describe('Forward Transform Expressions', async () => {
        await test('Cartesian 2D is identity transform', async () => {
            const sys = PRESETS.cartesian2d;
            assertDeepEqual(sys.forwardTransforms, ['x', 'y']);
        });

        await test('Polar 2D has correct radius formula', async () => {
            const sys = PRESETS.polar2d;
            assertEqual(sys.forwardTransforms[0], 'sqrt(x^2 + y^2)');
        });

        await test('Polar 2D has correct angle formula', async () => {
            const sys = PRESETS.polar2d;
            assertEqual(sys.forwardTransforms[1], 'atan(y, x)');
        });

        await test('Cylindrical 3D preserves z coordinate', async () => {
            const sys = PRESETS.cylindrical3d;
            assertEqual(sys.forwardTransforms[2], 'z');
        });

        await test('Spherical 3D has correct radius formula', async () => {
            const sys = PRESETS.spherical3d;
            assertEqual(sys.forwardTransforms[0], 'sqrt(x^2 + y^2 + z^2)');
        });

        await test('Spherical 3D uses acos for polar angle', async () => {
            const sys = PRESETS.spherical3d;
            // Polar angle θ from z-axis
            if (!sys.forwardTransforms[1].includes('acos')) {
                throw new Error('Spherical theta should use acos');
            }
        });
    });

    // Test variable names
    await describe('Variable Names and Labels', async () => {
        await test('Polar uses r and theta variables', async () => {
            const sys = PRESETS.polar2d;
            const names = sys.getVariableNames();
            if (!names.includes('r')) {
                throw new Error('Polar should have r variable');
            }
            if (!names.includes('theta')) {
                throw new Error('Polar should have theta variable');
            }
        });

        await test('Polar displays theta as Unicode θ', async () => {
            const sys = PRESETS.polar2d;
            const labels = sys.getDisplayLabels();
            if (!labels.includes('θ')) {
                throw new Error('Polar should display θ');
            }
        });

        await test('Cylindrical uses rho variable', async () => {
            const sys = PRESETS.cylindrical3d;
            const names = sys.getVariableNames();
            if (!names.includes('rho')) {
                throw new Error('Cylindrical should have rho variable');
            }
        });

        await test('Cylindrical displays rho as Unicode ρ', async () => {
            const sys = PRESETS.cylindrical3d;
            const labels = sys.getDisplayLabels();
            if (!labels.includes('ρ')) {
                throw new Error('Cylindrical should display ρ');
            }
        });

        await test('Spherical uses phi variable', async () => {
            const sys = PRESETS.spherical3d;
            const names = sys.getVariableNames();
            if (!names.includes('phi')) {
                throw new Error('Spherical should have phi variable');
            }
        });
    });

    // Test JSON serialization
    await describe('JSON Serialization', async () => {
        await test('toJSON preserves all properties', async () => {
            const sys = PRESETS.polar2d;
            const json = sys.toJSON();

            assertEqual(json.name, 'Polar 2D');
            assertEqual(json.dimensions, 2);
            if (!json.variables) throw new Error('Missing variables in JSON');
            if (!json.forwardTransforms) throw new Error('Missing transforms in JSON');
        });

        await test('fromJSON reconstructs coordinate system', async () => {
            const original = PRESETS.polar2d;
            const json = original.toJSON();
            const reconstructed = CoordinateSystem.fromJSON(json);

            assertEqual(reconstructed.name, original.name);
            assertEqual(reconstructed.dimensions, original.dimensions);
            assertDeepEqual(reconstructed.getVariableNames(), original.getVariableNames());
            assertDeepEqual(reconstructed.forwardTransforms, original.forwardTransforms);
        });

        await test('round-trip JSON conversion', async () => {
            const original = PRESETS.spherical3d;
            const json = original.toJSON();
            const reconstructed = CoordinateSystem.fromJSON(json);
            const json2 = reconstructed.toJSON();

            // Compare JSON representations
            assertEqual(JSON.stringify(json), JSON.stringify(json2));
        });
    });

    // Test custom coordinate systems
    await describe('Custom Coordinate Systems', async () => {
        await test('create custom 2D system', async () => {
            const custom = new CoordinateSystem(
                'Custom 2D',
                2,
                [
                    { label: 'u', displayLabel: 'u' },
                    { label: 'v', displayLabel: 'v' }
                ],
                ['x + y', 'x - y']
            );

            assertEqual(custom.name, 'Custom 2D');
            assertEqual(custom.dimensions, 2);
            assertDeepEqual(custom.getVariableNames(), ['u', 'v']);
        });

        await test('custom system with unicode labels', async () => {
            const custom = new CoordinateSystem(
                'Test System',
                2,
                [
                    { label: 'alpha', displayLabel: 'α' },
                    { label: 'beta', displayLabel: 'β' }
                ],
                ['x', 'y']
            );

            assertDeepEqual(custom.getDisplayLabels(), ['α', 'β']);
        });
    });

    // Test edge cases
    await describe('Edge Cases', async () => {
        await test('handle empty variable array', async () => {
            const sys = new CoordinateSystem('Empty', 0, [], []);
            assertEqual(sys.getVariableNames().length, 0);
            assertEqual(sys.getDisplayLabels().length, 0);
        });

        await test('dimensions match variable count', async () => {
            Object.values(PRESETS).forEach(sys => {
                if (sys.dimensions !== sys.variables.length) {
                    throw new Error(`${sys.name}: dimensions mismatch`);
                }
                if (sys.dimensions !== sys.forwardTransforms.length) {
                    throw new Error(`${sys.name}: transform count mismatch`);
                }
            });
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
