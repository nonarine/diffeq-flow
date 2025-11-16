/**
 * Coordinate Systems Module
 *
 * Defines alternate coordinate systems (polar, spherical, etc.) and handles
 * conversion between user-defined coordinates and Cartesian coordinates.
 *
 * Flow:
 * 1. User defines vector field in alternate coordinates (e.g., dr/dt, dθ/dt)
 * 2. System converts position from Cartesian to native coordinates
 * 3. Evaluates velocity in native coordinates
 * 4. Converts velocity back to Cartesian using Jacobian
 * 5. Integration happens in Cartesian space (all existing integrators work)
 */

import { computeSymbolicJacobian, invertJacobian } from './jacobian.js';
import { generateCharts, generateGLSLCondition } from './coordinate-charts.js';

/**
 * Base class for coordinate systems
 */
class CoordinateSystem {
    constructor(name, dimensions, variables, forwardTransforms, inverseTransforms = null, useIterativeSolver = false, charts = null) {
        this.name = name;
        this.dimensions = dimensions;
        this.variables = variables; // Array of { label: "r", displayLabel: "r" }
        this.forwardTransforms = forwardTransforms; // Array of expressions: Cartesian → Native
        this.inverseTransforms = inverseTransforms; // Array of expressions: Native → Cartesian (optional)
        this.useIterativeSolver = useIterativeSolver; // Use Newton's method in GLSL to compute inverse

        // Auto-generate charts to handle singularities if not explicitly provided
        // Charts allow us to use different coordinate representations in different regions
        // NOTE: Charts will be deprecated once we switch to native-space integration
        this.charts = charts || generateCharts(forwardTransforms, dimensions);
    }

    /**
     * Get variable names for this coordinate system
     * @returns {Array<string>} - Variable names (e.g., ['r', 'theta'])
     */
    getVariableNames() {
        return this.variables.map(v => v.label);
    }

    /**
     * Get display labels (may include unicode symbols)
     * @returns {Array<string>} - Display labels (e.g., ['r', 'θ'])
     */
    getDisplayLabels() {
        return this.variables.map(v => v.displayLabel);
    }

    /**
     * Generate GLSL code for forward transform (Cartesian → Native)
     * @param {Array<string>} cartesianVars - Cartesian variable names (e.g., ['x', 'y'])
     * @returns {string} - GLSL function code
     */
    generateForwardTransformGLSL(cartesianVars, parseFunc) {
        const nativeVars = this.getVariableNames();
        const dimType = `vec${this.dimensions}`;

        // Parse each transform expression to GLSL
        const transformCode = this.forwardTransforms.map((expr, i) => {
            const glsl = parseFunc(expr, cartesianVars);
            return `    result.${['x', 'y', 'z', 'w'][i]} = ${glsl};`;
        }).join('\n');

        return `
// Forward transform: Cartesian → ${this.name}
${dimType} transformToNative(${dimType} pos) {
    ${dimType} result;
    float ${cartesianVars.map((v, i) => `${v} = pos.${['x', 'y', 'z', 'w'][i]}`).join(', ')};
${transformCode}
    return result;
}`;
    }

    /**
     * Generate GLSL code for velocity transform using Jacobian
     * @param {Array<string>} cartesianVars - Cartesian variable names
     * @param {Function} parseFunc - Parser function
     * @returns {string} - GLSL function code
     */
    generateVelocityTransformGLSL(cartesianVars, parseFunc) {
        // If we have multiple charts, use chart-aware generation
        if (this.charts && this.charts.length > 1) {
            return this.generateMultiChartVelocityTransformGLSL(cartesianVars, parseFunc);
        }

        // Single chart - use original logic
        const forwardTransforms = this.charts && this.charts.length === 1
            ? this.charts[0].forwardTransforms
            : this.forwardTransforms;

        // Compute forward Jacobian matrix: J_forward = ∂(native)/∂(cartesian)
        const jacobian = computeSymbolicJacobian(forwardTransforms, this.dimensions);

        if (!jacobian) {
            console.error('Failed to compute Jacobian for coordinate system:', this.name);
            // Fallback: identity transform (incorrect but prevents crashes)
            return `
// Velocity transform: ${this.name} → Cartesian (IDENTITY FALLBACK - ERROR)
// WARNING: Jacobian computation failed, using identity transform
vec${this.dimensions} transformVelocityToCartesian(vec${this.dimensions} vel_native, vec${this.dimensions} pos) {
    return vel_native; // INCORRECT: Should use inverse Jacobian
}`;
        }

        // CRITICAL FIX: Invert the Jacobian matrix
        // By chain rule: vel_cartesian = J_inverse * vel_native
        // where J_inverse = (J_forward)^(-1)
        const inverseJacobian = invertJacobian(jacobian);

        if (!inverseJacobian) {
            console.error('Failed to invert Jacobian for coordinate system:', this.name);
            console.error('Forward Jacobian was:', jacobian);
            // Fallback: identity transform (incorrect but prevents crashes)
            return `
// Velocity transform: ${this.name} → Cartesian (IDENTITY FALLBACK - ERROR)
// WARNING: Jacobian inversion failed, using identity transform
// This will produce INCORRECT results for non-Cartesian coordinates!
vec${this.dimensions} transformVelocityToCartesian(vec${this.dimensions} vel_native, vec${this.dimensions} pos) {
    return vel_native; // INCORRECT: Jacobian inversion failed
}`;
        }

        const dimType = `vec${this.dimensions}`;
        const swizzles = ['x', 'y', 'z', 'w'];

        // Generate matrix multiplication code: vel_cartesian = J_inverse * vel_native
        const matrixMultCode = [];
        for (let i = 0; i < this.dimensions; i++) {
            const row = inverseJacobian[i];
            const terms = row.map((entry, j) => {
                const parsedEntry = parseFunc(entry, cartesianVars);
                return `(${parsedEntry}) * vel_native.${swizzles[j]}`;
            });
            matrixMultCode.push(`    result.${swizzles[i]} = ${terms.join(' + ')};`);
        }

        return `
// Velocity transform: ${this.name} → Cartesian via Inverse Jacobian
// J_forward = [${jacobian.map(row => '[' + row.join(', ') + ']').join(',\n//             ')}]
// J_inverse = [${inverseJacobian.map(row => '[' + row.join(', ') + ']').join(',\n//             ')}]
${dimType} transformVelocityToCartesian(${dimType} vel_native, ${dimType} pos) {
    ${dimType} result;
    float ${cartesianVars.map((v, i) => `${v} = pos.${swizzles[i]}`).join(', ')};
${matrixMultCode.join('\n')}
    return result;
}`;
    }

    /**
     * Generate GLSL code for velocity transform using multiple charts
     * Each chart has different coordinate singularities, allowing robust computation
     * @param {Array<string>} cartesianVars - Cartesian variable names
     * @param {Function} parseFunc - Parser function
     * @returns {string} - GLSL function code with chart selection
     */
    generateMultiChartVelocityTransformGLSL(cartesianVars, parseFunc) {
        const dimType = `vec${this.dimensions}`;
        const swizzles = ['x', 'y', 'z', 'w'];

        // Compute Jacobian and inverse for each chart
        const chartData = this.charts.map((chart, index) => {
            const jacobian = computeSymbolicJacobian(chart.forwardTransforms, this.dimensions);

            if (!jacobian) {
                console.warn(`Failed to compute Jacobian for chart ${index} of ${this.name}`);
                return null;
            }

            const inverseJacobian = invertJacobian(jacobian);

            if (!inverseJacobian) {
                console.warn(`Failed to invert Jacobian for chart ${index} of ${this.name}`);
                return null;
            }

            // Generate matrix multiplication code for this chart
            const matrixMultCode = [];
            for (let i = 0; i < this.dimensions; i++) {
                const row = inverseJacobian[i];
                const terms = row.map((entry, j) => {
                    const parsedEntry = parseFunc(entry, cartesianVars);
                    return `(${parsedEntry}) * vel_native.${swizzles[j]}`;
                });
                matrixMultCode.push(`        result.${swizzles[i]} = ${terms.join(' + ')};`);
            }

            return {
                condition: chart.condition,
                jacobian,
                inverseJacobian,
                matrixMultCode
            };
        }).filter(data => data !== null);

        if (chartData.length === 0) {
            console.error('All charts failed for coordinate system:', this.name);
            return `
// Velocity transform: ${this.name} → Cartesian (ERROR: All charts failed)
${dimType} transformVelocityToCartesian(${dimType} vel_native, ${dimType} pos) {
    return vel_native; // FALLBACK: All charts failed
}`;
        }

        // Generate GLSL with if/else chain for chart selection
        const chartCases = chartData.map((data, index) => {
            const glslCondition = generateGLSLCondition(data.condition, cartesianVars);
            const keyword = index === 0 ? 'if' : 'else if';
            const condPart = glslCondition === 'true' ? '' : ` (${glslCondition})`;

            return `    ${keyword}${condPart} {
        // Chart ${index + 1}: Avoid singularities when ${data.condition}
${data.matrixMultCode.join('\n')}
    }`;
        }).join(' ');

        // Add documentation comments
        const chartDocs = chartData.map((data, index) => {
            return `// Chart ${index + 1}: condition=${data.condition}
//   J_forward = [${data.jacobian.map(row => '[' + row.join(', ') + ']').join(',\n//               ')}]
//   J_inverse = [${data.inverseJacobian.map(row => '[' + row.join(', ') + ']').join(',\n//               ')}]`;
        }).join('\n');

        return `
// Velocity transform: ${this.name} → Cartesian via Multiple Charts
// Using ${chartData.length} charts to handle coordinate singularities
${chartDocs}
${dimType} transformVelocityToCartesian(${dimType} vel_native, ${dimType} pos) {
    ${dimType} result;
    float ${cartesianVars.map((v, i) => `${v} = pos.${swizzles[i]}`).join(', ')};
${chartCases}
    return result;
}`;
    }

    /**
     * Generate GLSL code for inverse transform (Native → Cartesian)
     * Uses three-tier strategy:
     *   Tier 1: Explicit inverse transforms (if provided)
     *   Tier 3: Newton's method iterative solver (if useIterativeSolver is true)
     * @param {Array<string>} nativeVars - Native variable names (e.g., ['r', 'theta'])
     * @param {Function} parseFunc - Parser function
     * @returns {string} - GLSL function code
     */
    generateInverseTransformGLSL(nativeVars, parseFunc) {
        const dimType = `vec${this.dimensions}`;
        const swizzles = ['x', 'y', 'z', 'w'];
        const cartesianVars = ['x', 'y', 'z', 'w', 'u', 'v'].slice(0, this.dimensions);

        // Tier 1: Use explicit inverse transforms if provided
        if (this.inverseTransforms && this.inverseTransforms.length === this.dimensions) {
            const transformCode = this.inverseTransforms.map((expr, i) => {
                // Inverse transforms are simple expressions using native variable names
                // Don't parse them - use directly since we extract variables first
                return `    result.${swizzles[i]} = ${expr};`;
            }).join('\n');

            return `
// Inverse transform: ${this.name} (Native → Cartesian)
// Using explicit inverse transform (Tier 1)
${dimType} transformToCartesian(${dimType} native_pos) {
    ${dimType} result;
    float ${nativeVars.map((v, i) => `${v} = native_pos.${swizzles[i]}`).join(', ')};
${transformCode}
    return result;
}`;
        }

        // Tier 3: Use Newton's method iterative solver
        if (this.useIterativeSolver) {
            return this.generateNewtonSolverGLSL(cartesianVars, nativeVars, parseFunc);
        }

        // Fallback: Identity transform (should not reach here in production)
        console.warn(`No inverse transform defined for ${this.name}, using identity`);
        return `
// Inverse transform: ${this.name} (Native → Cartesian)
// WARNING: Using identity fallback - no inverse defined!
${dimType} transformToCartesian(${dimType} native_pos) {
    return native_pos; // INCORRECT: Identity fallback
}`;
    }

    /**
     * Generate GLSL code for Newton's method iterative solver
     * Solves: F(cartesian) = native_target
     * Using: cartesian_new = cartesian_old - inverse(J) * (F(cartesian_old) - native_target)
     * @param {Array<string>} cartesianVars - Cartesian variable names
     * @param {Array<string>} nativeVars - Native variable names
     * @param {Function} parseFunc - Parser function
     * @returns {string} - GLSL function code
     */
    generateNewtonSolverGLSL(cartesianVars, nativeVars, parseFunc) {
        const dimType = `vec${this.dimensions}`;
        const matType = `mat${this.dimensions}`;
        const swizzles = ['x', 'y', 'z', 'w'];

        // Generate forward transform code (used inside Newton iteration)
        const forwardTransformCode = this.forwardTransforms.map((expr, i) => {
            const glsl = parseFunc(expr, cartesianVars);
            return `        native.${swizzles[i]} = ${glsl};`;
        }).join('\n');

        // Compute Jacobian for Newton's method
        const jacobian = computeSymbolicJacobian(this.forwardTransforms, this.dimensions);

        if (!jacobian) {
            console.error('Failed to compute Jacobian for Newton solver:', this.name);
            return `
// Newton solver failed: could not compute Jacobian
${dimType} transformToCartesian(${dimType} native_pos) {
    return native_pos; // ERROR FALLBACK
}`;
        }

        // Generate Jacobian matrix construction code
        const jacobianCode = [];
        for (let i = 0; i < this.dimensions; i++) {
            for (let j = 0; j < this.dimensions; j++) {
                const parsedEntry = parseFunc(jacobian[i][j], cartesianVars);
                jacobianCode.push(`        J[${i}][${j}] = ${parsedEntry};`);
            }
        }

        return `
// Inverse transform: ${this.name} (Native → Cartesian)
// Using Newton's method iterative solver (Tier 3)
${dimType} transformToCartesian(${dimType} native_target) {
    // Use previous position as initial guess (stored in global)
    ${dimType} guess = vec${this.dimensions}(0.0); // TODO: Use previous frame position

    const int MAX_ITERATIONS = 10;
    const float TOLERANCE = 1e-6;

    for(int iter = 0; iter < MAX_ITERATIONS; iter++) {
        // Evaluate forward transform at current guess
        ${dimType} native;
        float ${cartesianVars.map((v, i) => `${v} = guess.${swizzles[i]}`).join(', ')};
${forwardTransformCode}

        // Compute error
        ${dimType} error = native - native_target;
        if(length(error) < TOLERANCE) {
            break; // Converged
        }

        // Build Jacobian matrix J = ∂(native)/∂(cartesian)
        ${matType} J;
${jacobianCode.join('\n')}

        // Newton step: guess -= inverse(J) * error
        guess -= inverse(J) * error;
    }

    return guess;
}`;
    }

    /**
     * Serialize to JSON for storage
     */
    toJSON() {
        return {
            name: this.name,
            dimensions: this.dimensions,
            variables: this.variables,
            forwardTransforms: this.forwardTransforms,
            inverseTransforms: this.inverseTransforms,
            useIterativeSolver: this.useIterativeSolver
        };
    }

    /**
     * Deserialize from JSON
     */
    static fromJSON(json) {
        return new CoordinateSystem(
            json.name,
            json.dimensions,
            json.variables,
            json.forwardTransforms,
            json.inverseTransforms || null,
            json.useIterativeSolver || false
        );
    }
}

/**
 * Preset coordinate systems
 */
const PRESET_COORDINATE_SYSTEMS = {
    // 2D Systems
    'cartesian2d': new CoordinateSystem(
        'Cartesian 2D',
        2,
        [
            { label: 'x', displayLabel: 'x' },
            { label: 'y', displayLabel: 'y' }
        ],
        ['x', 'y'], // Forward: Identity transform
        ['x', 'y']  // Inverse: Identity transform
    ),

    'polar2d': new CoordinateSystem(
        'Polar 2D',
        2,
        [
            { label: 'r', displayLabel: 'r' },
            { label: 'theta', displayLabel: 'θ' }
        ],
        [
            'sqrt(x^2 + y^2)',  // r = √(x² + y²)
            'atan2(y, x)'       // θ = atan2(y, x)
        ],
        [
            'r*cos(theta)',     // x = r·cos(θ)
            'r*sin(theta)'      // y = r·sin(θ)
        ]
    ),

    // 3D Systems
    'cartesian3d': new CoordinateSystem(
        'Cartesian 3D',
        3,
        [
            { label: 'x', displayLabel: 'x' },
            { label: 'y', displayLabel: 'y' },
            { label: 'z', displayLabel: 'z' }
        ],
        ['x', 'y', 'z'], // Forward: Identity
        ['x', 'y', 'z']  // Inverse: Identity
    ),

    'cylindrical3d': new CoordinateSystem(
        'Cylindrical 3D',
        3,
        [
            { label: 'rho', displayLabel: 'ρ' },
            { label: 'phi', displayLabel: 'φ' },
            { label: 'z', displayLabel: 'z' }
        ],
        [
            'sqrt(x^2 + y^2)',   // ρ = √(x² + y²)
            'atan2(y, x)',       // φ = atan2(y, x)
            'z'                  // z = z
        ],
        [
            'rho*cos(phi)',      // x = ρ·cos(φ)
            'rho*sin(phi)',      // y = ρ·sin(φ)
            'z'                  // z = z
        ]
    ),

    'spherical3d': new CoordinateSystem(
        'Spherical 3D',
        3,
        [
            { label: 'r', displayLabel: 'r' },
            { label: 'theta', displayLabel: 'θ' },
            { label: 'phi', displayLabel: 'φ' }
        ],
        [
            'sqrt(x^2 + y^2 + z^2)',              // r = √(x² + y² + z²)
            'acos(z / sqrt(x^2 + y^2 + z^2))',   // θ = acos(z/r) - polar angle from z-axis
            'atan2(y, x)'                         // φ = atan2(y, x) - azimuthal angle
        ],
        [
            'r*sin(theta)*cos(phi)',              // x = r·sin(θ)·cos(φ)
            'r*sin(theta)*sin(phi)',              // y = r·sin(θ)·sin(φ)
            'r*cos(theta)'                        // z = r·cos(θ)
        ]
    ),

    // 4D Systems
    'cartesian4d': new CoordinateSystem(
        'Cartesian 4D',
        4,
        [
            { label: 'x', displayLabel: 'x' },
            { label: 'y', displayLabel: 'y' },
            { label: 'z', displayLabel: 'z' },
            { label: 'w', displayLabel: 'w' }
        ],
        ['x', 'y', 'z', 'w'], // Forward: Identity
        ['x', 'y', 'z', 'w']  // Inverse: Identity
    ),

    'hyperspherical4d': new CoordinateSystem(
        'Hyperspherical 4D',
        4,
        [
            { label: 'r', displayLabel: 'r' },
            { label: 'theta', displayLabel: 'θ' },
            { label: 'phi', displayLabel: 'φ' },
            { label: 'psi', displayLabel: 'ψ' }
        ],
        [
            'sqrt(x^2 + y^2 + z^2 + w^2)',                           // r = √(x² + y² + z² + w²)
            'acos(w / sqrt(x^2 + y^2 + z^2 + w^2))',                // θ = acos(w/r)
            'acos(z / sqrt(x^2 + y^2 + z^2))',                      // φ = acos(z/√(x²+y²+z²))
            'atan2(y, x)'                                            // ψ = atan2(y, x)
        ],
        [
            'r*sin(theta)*sin(phi)*cos(psi)',                        // x = r·sin(θ)·sin(φ)·cos(ψ)
            'r*sin(theta)*sin(phi)*sin(psi)',                        // y = r·sin(θ)·sin(φ)·sin(ψ)
            'r*sin(theta)*cos(phi)',                                 // z = r·sin(θ)·cos(φ)
            'r*cos(theta)'                                           // w = r·cos(θ)
        ]
    )
};

/**
 * Get coordinate system by key
 */
function getCoordinateSystem(key) {
    return PRESET_COORDINATE_SYSTEMS[key] || null;
}

/**
 * Get preset coordinate systems for a given dimension
 */
function getPresetsForDimension(dimensions) {
    const presets = [];
    for (const [key, system] of Object.entries(PRESET_COORDINATE_SYSTEMS)) {
        if (system.dimensions === dimensions) {
            presets.push({ key, system });
        }
    }
    return presets;
}

/**
 * Get default Cartesian coordinate system for given dimensions
 */
function getCartesianSystem(dimensions) {
    const key = `cartesian${dimensions}d`;
    return PRESET_COORDINATE_SYSTEMS[key] || createCartesianSystem(dimensions);
}

/**
 * Create a Cartesian coordinate system for arbitrary dimensions
 */
function createCartesianSystem(dimensions) {
    const varNames = ['x', 'y', 'z', 'w', 'u', 'v'].slice(0, dimensions);
    return new CoordinateSystem(
        `Cartesian ${dimensions}D`,
        dimensions,
        varNames.map(v => ({ label: v, displayLabel: v })),
        varNames
    );
}

// Export for use in other modules
export {
    CoordinateSystem,
    PRESET_COORDINATE_SYSTEMS,
    getCoordinateSystem,
    getPresetsForDimension,
    getCartesianSystem,
    createCartesianSystem
};
