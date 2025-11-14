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

import { computeSymbolicJacobian } from './jacobian.js';

/**
 * Base class for coordinate systems
 */
class CoordinateSystem {
    constructor(name, dimensions, variables, forwardTransforms) {
        this.name = name;
        this.dimensions = dimensions;
        this.variables = variables; // Array of { label: "r", displayLabel: "r" }
        this.forwardTransforms = forwardTransforms; // Array of expressions: Cartesian → Native
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
        // Compute Jacobian matrix symbolically
        const jacobian = computeSymbolicJacobian(this.forwardTransforms, this.dimensions);

        if (!jacobian) {
            console.error('Failed to compute Jacobian for coordinate system:', this.name);
            // Fallback: identity transform
            return `
// Velocity transform: ${this.name} → Cartesian (IDENTITY FALLBACK)
vec${this.dimensions} transformVelocityToCartesian(vec${this.dimensions} vel_native, vec${this.dimensions} pos) {
    return vel_native; // ERROR: Jacobian computation failed
}`;
        }

        const dimType = `vec${this.dimensions}`;
        const swizzles = ['x', 'y', 'z', 'w'];

        // Generate Jacobian matrix multiplication code
        // vel_cartesian = J * vel_native
        const matrixMultCode = [];
        for (let i = 0; i < this.dimensions; i++) {
            const row = jacobian[i];
            const terms = row.map((entry, j) => {
                const parsedEntry = parseFunc(entry, cartesianVars);
                return `(${parsedEntry}) * vel_native.${swizzles[j]}`;
            });
            matrixMultCode.push(`    result.${swizzles[i]} = ${terms.join(' + ')};`);
        }

        return `
// Velocity transform: ${this.name} → Cartesian via Jacobian
// J = [${jacobian.map(row => '[' + row.join(', ') + ']').join(',\n//     ')}]
${dimType} transformVelocityToCartesian(${dimType} vel_native, ${dimType} pos) {
    ${dimType} result;
    float ${cartesianVars.map((v, i) => `${v} = pos.${swizzles[i]}`).join(', ')};
${matrixMultCode.join('\n')}
    return result;
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
            forwardTransforms: this.forwardTransforms
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
            json.forwardTransforms
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
        ['x', 'y'] // Identity transform
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
            'atan2(y, x)'       // θ = atan2(y, x) - parser uses atan2, GLSL uses atan
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
        ['x', 'y', 'z']
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
        ['x', 'y', 'z', 'w']
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
