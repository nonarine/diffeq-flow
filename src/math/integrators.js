/**
 * Numerical integration methods for updating particle positions
 * Each integrator generates GLSL code for computing position updates
 */

import { computeSymbolicJacobian, isValidJacobian } from './jacobian.js';
import { parseExpression } from './parser.js';
import { logger } from '../utils/debug-logger.js';

/**
 * Variable names for dimensions
 */
const VARIABLE_NAMES = ['x', 'y', 'z', 'w', 'u', 'v'];

/**
 * Generate GLSL code for NxN matrix inversion using Gauss-Jordan elimination
 *
 * @param {number} n - Matrix dimension
 * @returns {string} - GLSL function code for matrix inverse
 */
function generateMatrixInverseGLSL(n) {
    const matType = n === 2 ? 'mat2' : n === 3 ? 'mat3' : 'mat4';
    const funcName = `inverse${n}`;

    // For 2x2, use fast closed-form formula
    if (n === 2) {
        return `
// Compute inverse of 2x2 matrix (closed form)
// For matrix [a c; b d] (column-major), inverse is [d -c; -b a] / det
mat2 inverse2(mat2 m) {
    float det = m[0][0]*m[1][1] - m[1][0]*m[0][1];
    return mat2(m[1][1], -m[1][0], -m[0][1], m[0][0]) / det;
}`;
    }

    // For 3x3 and larger, use Gauss-Jordan elimination
    // Create augmented matrix [A | I] and reduce to [I | A^-1]

    let code = `
// Compute inverse of ${n}x${n} matrix using Gauss-Jordan elimination
${matType} ${funcName}(${matType} m) {
    // Create augmented matrix [m | I] stored as ${n} column vectors
`;

    // Initialize augmented matrix columns
    for (let col = 0; col < n; col++) {
        code += `    vec${n} aug${col} = vec${n}(`;
        for (let row = 0; row < n; row++) {
            if (row > 0) code += ', ';
            // First n columns are m, next n columns are identity
            code += `m[${col}][${row}]`;
        }
        code += `);\n`;
    }

    // Add identity matrix columns
    for (let col = 0; col < n; col++) {
        code += `    vec${n} aug${n + col} = vec${n}(`;
        for (let row = 0; row < n; row++) {
            if (row > 0) code += ', ';
            code += (row === col) ? '1.0' : '0.0';
        }
        code += `);\n`;
    }

    code += `\n`;

    // Gauss-Jordan elimination (working on rows)
    for (let pivot = 0; pivot < n; pivot++) {
        code += `    // Pivot ${pivot}: Make diagonal element = 1 and eliminate column ${pivot}\n`;

        // Scale pivot row to make diagonal element = 1
        // The pivot row is row ${pivot}, which means element [${pivot}] in each column vector
        code += `    float scale${pivot} = aug${pivot}[${pivot}];\n`;
        // Protect against division by zero
        code += `    if (abs(scale${pivot}) < 0.0001) scale${pivot} = 0.0001;\n`;
        for (let col = 0; col < 2 * n; col++) {
            // Divide element [pivot] in each column by the pivot value
            code += `    aug${col}[${pivot}] /= scale${pivot};\n`;
        }
        code += `\n`;

        // Eliminate other rows in this column
        for (let row = 0; row < n; row++) {
            if (row === pivot) continue;

            code += `    // Eliminate row ${row}\n`;
            code += `    float factor${pivot}_${row} = aug${pivot}[${row}];\n`;
            for (let col = 0; col < 2 * n; col++) {
                // Subtract factor * pivot_row[col] from current row[col]
                code += `    aug${col}[${row}] -= factor${pivot}_${row} * aug${col}[${pivot}];\n`;
            }
            code += `\n`;
        }
    }

    // Extract inverse matrix from right side of augmented matrix
    code += `    // Extract inverse from augmented matrix\n`;
    code += `    return ${matType}(\n`;
    for (let col = 0; col < n; col++) {
        if (col > 0) code += `,\n`;
        code += `        aug${n + col}`;
    }
    code += `\n    );\n`;
    code += `}\n`;

    return code;
}

/**
 * Generate GLSL code for computing the Jacobian matrix
 *
 * @param {string[][]} jacobianMatrix - 2D array of symbolic expressions
 * @param {number} dimensions - Number of dimensions
 * @returns {string} - GLSL function code for computing Jacobian
 */
function generateJacobianGLSL(jacobianMatrix, dimensions) {
    const matType = dimensions === 2 ? 'mat2' : dimensions === 3 ? 'mat3' : 'mat4';
    const vecType = `vec${dimensions}`;

    // Generate variable declarations
    let varDecls = '';
    for (let i = 0; i < dimensions; i++) {
        varDecls += `    float ${VARIABLE_NAMES[i]} = pos.${['x', 'y', 'z', 'w'][i]};\n`;
    }

    // Generate matrix constructor arguments
    // GLSL matrices are column-major, so we need to transpose
    const matrixElements = [];
    for (let col = 0; col < dimensions; col++) {
        for (let row = 0; row < dimensions; row++) {
            const symbolicExpr = jacobianMatrix[row][col];
            try {
                const glslExpr = parseExpression(symbolicExpr, dimensions);
                matrixElements.push(glslExpr);
            } catch (error) {
                logger.warn(`Failed to compile Jacobian element [${row}][${col}]: ${symbolicExpr}`, error);
                matrixElements.push('0.0');
            }
        }
    }

    // Generate matrix inverse function (WebGL 1.0 doesn't have built-in inverse())
    const inverseFunc = generateMatrixInverseGLSL(dimensions);

    return `
${inverseFunc}

// Compute Jacobian matrix at given position
${matType} computeJacobian(${vecType} pos) {
${varDecls}
    return ${matType}(
        ${matrixElements.join(',\n        ')}
    );
}`;
}

/**
 * Euler integrator (1st order)
 * Simple forward step: x(t+h) = x(t) + h*f(x)
 */
export function eulerIntegrator(dimensions) {
    return {
        name: 'Euler',
        code: `
// Euler integration
vec${dimensions} integrate(vec${dimensions} pos, float h) {
    vec${dimensions} velocity = get_velocity(pos);
    return pos + h * velocity;
}
`
    };
}

/**
 * Runge-Kutta 2 (Midpoint method)
 * 2nd order accurate
 */
export function rk2Integrator(dimensions) {
    return {
        name: 'RK2 (Midpoint)',
        code: `
// Runge-Kutta 2 (Midpoint) integration
vec${dimensions} integrate(vec${dimensions} pos, float h) {
    vec${dimensions} k1 = get_velocity(pos);
    vec${dimensions} k2 = get_velocity(pos + h * 0.5 * k1);
    return pos + h * k2;
}
`
    };
}

/**
 * Runge-Kutta 4
 * 4th order accurate, good balance of accuracy and performance
 */
export function rk4Integrator(dimensions) {
    return {
        name: 'RK4',
        code: `
// Runge-Kutta 4 integration
vec${dimensions} integrate(vec${dimensions} pos, float h) {
    vec${dimensions} k1 = get_velocity(pos);
    vec${dimensions} k2 = get_velocity(pos + h * 0.5 * k1);
    vec${dimensions} k3 = get_velocity(pos + h * 0.5 * k2);
    vec${dimensions} k4 = get_velocity(pos + h * k3);

    return pos + h * (k1 / 6.0 + k2 / 3.0 + k3 / 3.0 + k4 / 6.0);
}
`
    };
}

/**
 * Implicit Euler (Backward Euler)
 * Solves: x(t+h) = x(t) + h*f(x(t+h))
 * Can use either fixed-point iteration or Newton's method
 * More stable than explicit Euler, especially for stiff systems
 */
export function implicitEulerIntegrator(dimensions, iterations = 3, solutionMethod = 'fixed-point', expressions = null) {
    logger.info(`*** Implicit Euler integrator requested: solutionMethod=${solutionMethod}, hasExpressions=${!!expressions}`);

    if (solutionMethod === 'newton' && expressions) {
        // BUG: There's a known issue where Newton's method sometimes fails to compile
        // correctly on initial page load (Jacobian computation may return inconsistent
        // results or fail silently). Workaround is to always start in fixed-point mode
        // and switch to Newton after a 3-second delay (see controls-v2.js).
        //
        // Try to compute Jacobian symbolically
        logger.info('Computing Jacobian for Newton\'s method');
        logger.info('Timestamp:', new Date().toISOString());
        logger.info('Expressions:', expressions);
        logger.info('Dimensions:', dimensions);

        const jacobian = computeSymbolicJacobian(expressions, dimensions);

        if (isValidJacobian(jacobian)) {
            // Newton's method with symbolic Jacobian
            const jacobianGLSL = generateJacobianGLSL(jacobian, dimensions);
            const matType = dimensions === 2 ? 'mat2' : dimensions === 3 ? 'mat3' : 'mat4';
            const vecType = `vec${dimensions}`;

            logger.info('✓ Successfully using Newton\'s method for Implicit Euler');
            logger.info('Jacobian GLSL code length:', jacobianGLSL.length);

            const inverseFuncName = `inverse${dimensions}`;

            return {
                name: 'Implicit Euler (Newton)',
                code: `
${jacobianGLSL}

// Implicit Euler integration (Newton's method)
${vecType} integrate(${vecType} pos, float h) {
    // Start with explicit Euler as initial guess
    ${vecType} x_new = pos + h * get_velocity(pos);

    // Newton's method: solve F(x_new) = x_new - pos - h*f(x_new) = 0
    for (int i = 0; i < ${iterations}; i++) {
        ${vecType} f_new = get_velocity(x_new);
        ${vecType} F = x_new - pos - h * f_new;

        // J = I - h * df/dx
        ${matType} J = ${matType}(1.0) - h * computeJacobian(x_new);

        // Newton step: x_new -= J^(-1) * F
        ${vecType} delta = ${inverseFuncName}(J) * F;
        x_new -= delta;
    }

    return x_new;
}
`
            };
        } else {
            logger.warn('✗ Failed to compute Jacobian for Newton\'s method');
            logger.warn('Jacobian validity:', isValidJacobian(jacobian));
            logger.warn('Falling back to fixed-point iteration');
        }
    } else if (solutionMethod === 'newton' && !expressions) {
        logger.warn('✗ Newton\'s method requested but no expressions provided');
        logger.warn('Falling back to fixed-point iteration');
    }

    // Default: Fixed-point iteration
    return {
        name: 'Implicit Euler',
        code: `
// Implicit Euler integration (fixed-point iteration)
vec${dimensions} integrate(vec${dimensions} pos, float h) {
    // Start with explicit Euler as initial guess
    vec${dimensions} x_new = pos + h * get_velocity(pos);

    // Fixed-point iteration: x_new = x + h * f(x_new)
    for (int i = 0; i < ${iterations}; i++) {
        x_new = pos + h * get_velocity(x_new);
    }

    return x_new;
}
`
    };
}

/**
 * Implicit Midpoint (Implicit RK2)
 * Solves: x(t+h) = x(t) + h*f((x(t) + x(t+h))/2) using fixed-point iteration
 * 2nd order accurate, A-stable (excellent for stiff systems)
 */
export function implicitMidpointIntegrator(dimensions, iterations = 4) {
    return {
        name: 'Implicit Midpoint',
        code: `
// Implicit Midpoint integration (fixed-point iteration)
vec${dimensions} integrate(vec${dimensions} pos, float h) {
    // Start with explicit RK2 as initial guess
    vec${dimensions} k1 = get_velocity(pos);
    vec${dimensions} x_new = pos + h * get_velocity(pos + h * 0.5 * k1);

    // Fixed-point iteration: x_new = x + h * f((x + x_new)/2)
    for (int i = 0; i < ${iterations}; i++) {
        vec${dimensions} x_mid = (pos + x_new) * 0.5;
        x_new = pos + h * get_velocity(x_mid);
    }

    return x_new;
}
`
    };
}

/**
 * Trapezoidal Rule (Implicit RK2)
 * Solves: x(t+h) = x(t) + h/2 * (f(x(t)) + f(x(t+h))) using fixed-point iteration
 * 2nd order accurate, A-stable
 */
export function trapezoidalIntegrator(dimensions, iterations = 4) {
    return {
        name: 'Trapezoidal',
        code: `
// Trapezoidal Rule integration (fixed-point iteration)
vec${dimensions} integrate(vec${dimensions} pos, float h) {
    vec${dimensions} f0 = get_velocity(pos);

    // Start with explicit Euler as initial guess
    vec${dimensions} x_new = pos + h * f0;

    // Fixed-point iteration: x_new = x + h/2 * (f(x) + f(x_new))
    for (int i = 0; i < ${iterations}; i++) {
        vec${dimensions} f_new = get_velocity(x_new);
        x_new = pos + h * 0.5 * (f0 + f_new);
    }

    return x_new;
}
`
    };
}

/**
 * Implicit RK4 (Gauss-Legendre)
 * Fully implicit 4th order method, excellent stability
 * Uses simplified 2-stage Gauss-Legendre with fixed-point iteration
 */
export function implicitRK4Integrator(dimensions, iterations = 5) {
    return {
        name: 'Implicit RK4',
        code: `
// Implicit RK4 (Gauss-Legendre 2-stage) integration
vec${dimensions} integrate(vec${dimensions} pos, float h) {
    // Gauss-Legendre coefficients for 2-stage method
    const float a11 = 0.25;
    const float a12 = 0.25 - sqrt(3.0) / 6.0;
    const float a21 = 0.25 + sqrt(3.0) / 6.0;
    const float a22 = 0.25;
    const float b1 = 0.5;
    const float b2 = 0.5;
    const float c1 = 0.5 - sqrt(3.0) / 6.0;
    const float c2 = 0.5 + sqrt(3.0) / 6.0;

    // Start with explicit RK4 as initial guess
    vec${dimensions} k1_guess = get_velocity(pos);
    vec${dimensions} k2_guess = get_velocity(pos + h * 0.5 * k1_guess);

    vec${dimensions} k1 = k1_guess;
    vec${dimensions} k2 = k2_guess;

    // Fixed-point iteration to solve implicit stages
    for (int i = 0; i < ${iterations}; i++) {
        k1 = get_velocity(pos + h * (a11 * k1 + a12 * k2));
        k2 = get_velocity(pos + h * (a21 * k1 + a22 * k2));
    }

    return pos + h * (b1 * k1 + b2 * k2);
}
`
    };
}

/**
 * Symplectic Euler (Semi-implicit Euler) for Hamiltonian systems
 * Assumes even dimensions are positions, odd dimensions are velocities
 * Updates velocities first, then positions using new velocities
 * Preserves energy better than standard Euler
 */
export function symplecticEulerIntegrator(dimensions) {
    const coords = ['x', 'y', 'z', 'w'];

    // Generate unrolled update code for each position/velocity pair
    let updateCode = '';

    if (dimensions % 2 === 0) {
        // For even dimensions, treat pairs as (position, velocity)
        const numPairs = dimensions / 2;
        for (let i = 0; i < numPairs; i++) {
            const posIdx = i * 2;
            const velIdx = i * 2 + 1;
            const posCoord = coords[posIdx];
            const velCoord = coords[velIdx];

            updateCode += `
    // Pair ${i}: position[${posIdx}], velocity[${velIdx}]
    // Update velocity first (using current position)
    result.${velCoord} = pos.${velCoord} + h * vel.${velCoord};
    // Update position using new velocity
    result.${posCoord} = pos.${posCoord} + h * result.${velCoord};`;
        }
    } else {
        // For odd dimensions, update all but last dimension in pairs
        const numPairs = Math.floor(dimensions / 2);
        for (let i = 0; i < numPairs; i++) {
            const posIdx = i * 2;
            const velIdx = i * 2 + 1;
            const posCoord = coords[posIdx];
            const velCoord = coords[velIdx];

            updateCode += `
    // Pair ${i}: position[${posIdx}], velocity[${velIdx}]
    result.${velCoord} = pos.${velCoord} + h * vel.${velCoord};
    result.${posCoord} = pos.${posCoord} + h * result.${velCoord};`;
        }

        // Handle last dimension with standard Euler
        const lastCoord = coords[dimensions - 1];
        updateCode += `
    // Last dimension (odd): standard Euler
    result.${lastCoord} = pos.${lastCoord} + h * vel.${lastCoord};`;
    }

    return {
        name: 'Symplectic Euler',
        code: `
// Symplectic Euler integration
// Assumes alternating position/velocity pairs: (x0, v0, x1, v1, ...)
vec${dimensions} integrate(vec${dimensions} pos, float h) {
    vec${dimensions} vel = get_velocity(pos);
    vec${dimensions} result = pos;
${updateCode}

    return result;
}
`
    };
}

/**
 * Get integrator by name
 */
export function getIntegrator(name, dimensions, params = {}) {
    const iterations = params.iterations || 3;
    const solutionMethod = params.solutionMethod || 'fixed-point';
    const expressions = params.expressions || null;

    switch (name) {
        case 'euler':
            return eulerIntegrator(dimensions);
        case 'rk2':
            return rk2Integrator(dimensions);
        case 'rk4':
            return rk4Integrator(dimensions);
        case 'implicit-euler':
            return implicitEulerIntegrator(dimensions, iterations, solutionMethod, expressions);
        case 'implicit-midpoint':
            return implicitMidpointIntegrator(dimensions, params.iterations || 4);
        case 'trapezoidal':
            return trapezoidalIntegrator(dimensions, params.iterations || 4);
        case 'implicit-rk4':
            return implicitRK4Integrator(dimensions, params.iterations || 5);
        case 'symplectic':
            return symplecticEulerIntegrator(dimensions);
        // Legacy alias
        case 'implicit':
            return implicitEulerIntegrator(dimensions, iterations, solutionMethod, expressions);
        default:
            return rk4Integrator(dimensions); // Default to RK4
    }
}

/**
 * Create custom integrator from user GLSL code
 */
export function customIntegrator(glslCode, dimensions) {
    return {
        name: 'Custom',
        code: glslCode
    };
}
