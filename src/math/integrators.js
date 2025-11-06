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
 * Solver generator functions for implicit equations
 * These generate GLSL code for different iterative solver methods
 */

/**
 * Generate fixed-point iteration solver body (single iteration step)
 *
 * @param {string} varName - Variable name to solve for (e.g., 'x_new', 'k1')
 * @param {function(string): string} updateExprFn - Function that takes variable name and returns GLSL update expression
 * @param {number} dimensions - Number of dimensions
 * @returns {string} - GLSL code for single solver iteration (just the loop body)
 */
function generateFixedPointSolverBody(varName, updateExprFn, dimensions) {
    const updateExpr = updateExprFn(varName);
    return `        ${varName} = ${updateExpr};`;
}

/**
 * Generate midpoint solver body (predictor-corrector single iteration step)
 *
 * @param {string} varName - Variable name to solve for
 * @param {function(string): string} updateExprFn - Function that takes variable name and returns GLSL update expression
 * @param {number} dimensions - Number of dimensions
 * @returns {string} - GLSL code for single solver iteration (just the loop body)
 */
function generateMidpointSolverBody(varName, updateExprFn, dimensions) {
    const vecType = `vec${dimensions}`;
    const predName = `${varName}_pred`;
    const midName = `${varName}_mid`;

    const updateExprPred = updateExprFn(varName);
    const updateExprMid = updateExprFn(midName);

    return `        // Predictor: standard fixed-point step
        ${vecType} ${predName} = ${updateExprPred};

        // Corrector: evaluate at midpoint between current and predictor
        ${vecType} ${midName} = (${varName} + ${predName}) * 0.5;
        ${varName} = ${updateExprMid};`;
}

/**
 * Generate Newton's method solver body (single iteration step)
 *
 * @param {string} varName - Variable name to solve for
 * @param {function(string): string} residualExprFn - Function that takes variable name and returns GLSL residual F(x)
 * @param {function(string): string} jacobianExprFn - Function that takes variable name and returns GLSL Jacobian matrix
 * @param {number} dimensions - Number of dimensions
 * @returns {string} - GLSL code for single solver iteration (just the loop body)
 */
function generateNewtonSolverBody(varName, residualExprFn, jacobianExprFn, dimensions) {
    const vecType = `vec${dimensions}`;
    const matType = dimensions === 2 ? 'mat2' : dimensions === 3 ? 'mat3' : 'mat4';
    const inverseFuncName = `inverse${dimensions}`;

    const residualExpr = residualExprFn(varName);
    const jacobianExpr = jacobianExprFn(varName);

    // Use varName prefix for local variables to avoid redeclaration when used multiple times in same scope
    return `        ${vecType} F_${varName} = ${residualExpr};
        ${matType} J_${varName} = ${jacobianExpr};

        // Newton step: x -= J^(-1) * F
        ${vecType} delta_${varName} = ${inverseFuncName}(J_${varName}) * F_${varName};
        ${varName} -= delta_${varName};`;
}

/**
 * Generate Newton's method solver body with finite difference Jacobian (single iteration step)
 *
 * Uses finite differences to approximate the Jacobian matrix instead of symbolic differentiation.
 * This avoids dependency on symbolic math but may create interesting numerical artifacts.
 *
 * @param {string} varName - Variable name to solve for
 * @param {function(string): string} velocityExprFn - Function that takes position and returns GLSL velocity expression
 * @param {number} dimensions - Number of dimensions
 * @param {string} hScale - Scaling factor for velocity Jacobian (e.g., 'h', 'h*0.5', '1.0')
 * @param {string} residualRHS - Right-hand side of residual (e.g., 'pos + h * vel', 'pos + h * 0.5 * (f0 + vel)')
 * @returns {string} - GLSL code for single solver iteration (just the loop body)
 */
function generateNewtonFDSolverBody(varName, velocityExprFn, dimensions, hScale = 'h', residualRHS = null) {
    const vecType = `vec${dimensions}`;
    const matType = dimensions === 2 ? 'mat2' : dimensions === 3 ? 'mat3' : 'mat4';
    const inverseFuncName = `inverse${dimensions}`;
    const coords = ['x', 'y', 'z', 'w'];

    // Epsilon for finite differences - balanced to avoid both truncation and cancellation errors
    const epsilon = '1e-4';

    // Generate code to compute each column of the velocity Jacobian (Df)
    let jacobianCode = '';
    const dfColumns = [];

    for (let col = 0; col < dimensions; col++) {
        const colName = `Df_col${col}_${varName}`;

        // Create perturbation vector (unit vector in dimension col)
        const perturbation = Array.from({length: dimensions}, (_, i) =>
            i === col ? epsilon : '0.0'
        ).join(', ');

        // Compute f(x + eps*e_col) and f(x) - this is the derivative of the velocity field
        const velocityAtPerturbed = velocityExprFn(`${varName} + ${vecType}(${perturbation})`);
        const velocityAtCurrent = velocityExprFn(varName);

        jacobianCode += `
        // Velocity Jacobian column ${col}: d(velocity)/d${coords[col]}
        ${vecType} ${colName} = (${velocityAtPerturbed} - ${velocityAtCurrent}) / ${epsilon};`;

        dfColumns.push(colName);
    }

    // Build the Jacobian of the velocity field
    jacobianCode += `

        // Velocity Jacobian matrix Df
        ${matType} Df_${varName} = ${matType}(${dfColumns.join(', ')});

        // Residual Jacobian: J_F = I - ${hScale} * Df
        ${matType} J_${varName} = ${matType}(1.0) - ${hScale} * Df_${varName};`;

    // Compute residual
    const currentVel = velocityExprFn(varName);
    const residual = residualRHS || `pos + ${hScale} * ${currentVel}`;

    return `        // Finite difference Jacobian approximation (epsilon = ${epsilon})${jacobianCode}

        // Compute residual: F(x) = x - RHS
        ${vecType} F_${varName} = ${varName} - (${residual});

        // Newton step: x -= J^(-1) * F
        ${vecType} delta_${varName} = ${inverseFuncName}(J_${varName}) * F_${varName};
        ${varName} -= delta_${varName};`;
}

/**
 * Euler integrator (1st order)
 * Simple forward step: x(t+h) = x(t) + h*f(x)
 */
export function eulerIntegrator(dimensions) {
    return {
        name: 'Euler',
        costFactor: 1, // 1 function evaluation per step
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
 * Explicit Midpoint (RK2)
 * 2nd order accurate
 */
export function explicitMidpointIntegrator(dimensions) {
    return {
        name: 'Explicit Midpoint',
        costFactor: 2, // 2 function evaluations per step
        code: `
// Explicit Midpoint (RK2) integration
vec${dimensions} integrate(vec${dimensions} pos, float h) {
    vec${dimensions} k1 = get_velocity(pos);
    vec${dimensions} k2 = get_velocity(pos + h * 0.5 * k1);
    return pos + h * k2;
}
`
    };
}

/**
 * Heun's Method (Explicit Trapezoidal, RK2 variant)
 * 2nd order accurate
 * Explicit counterpart to implicit trapezoidal rule
 */
export function heunIntegrator(dimensions) {
    return {
        name: 'Heun (Explicit Trapezoidal)',
        costFactor: 2, // 2 function evaluations per step
        code: `
// Heun's Method (Explicit Trapezoidal) integration
vec${dimensions} integrate(vec${dimensions} pos, float h) {
    vec${dimensions} k1 = get_velocity(pos);
    vec${dimensions} k2 = get_velocity(pos + h * k1);
    return pos + h * 0.5 * (k1 + k2);
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
        costFactor: 4, // 4 function evaluations per step
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
 * Can use fixed-point iteration, midpoint solver, or Newton's method
 * More stable than explicit Euler, especially for stiff systems
 */
export function implicitEulerIntegrator(dimensions, iterations = 3, solutionMethod = 'fixed-point', expressions = null) {
    logger.info(`*** Implicit Euler integrator requested: solutionMethod=${solutionMethod}, hasExpressions=${!!expressions}`);

    const vecType = `vec${dimensions}`;
    const matType = dimensions === 2 ? 'mat2' : dimensions === 3 ? 'mat3' : 'mat4';

    // Problem definition for Implicit Euler: x_new = pos + h * f(x_new)
    const initialGuess = 'pos + h * get_velocity(pos)';
    const updateExprFn = (v) => `pos + h * get_velocity(${v})`;
    const velocityExprFn = (v) => `get_velocity(${v})`;

    let solverBody;
    let solverName;
    let jacobianGLSL = '';

    // Choose solver method
    if (solutionMethod === 'newton' && expressions) {
        // BUG: There's a known issue where Newton's method sometimes fails to compile
        // correctly on initial page load (Jacobian computation may return inconsistent
        // results or fail silently). Workaround is to always start in fixed-point mode
        // and switch to Newton after a 3-second delay (see controls-v2.js).
        logger.info('Computing Jacobian for Newton\'s method');

        const jacobian = computeSymbolicJacobian(expressions, dimensions);

        if (isValidJacobian(jacobian)) {
            logger.info('✓ Successfully using Newton\'s method for Implicit Euler');

            jacobianGLSL = generateJacobianGLSL(jacobian, dimensions);
            const residualExprFn = (v) => `${v} - pos - h * get_velocity(${v})`;
            const jacobianExprFn = (v) => `${matType}(1.0) - h * computeJacobian(${v})`;

            solverBody = generateNewtonSolverBody('x_new', residualExprFn, jacobianExprFn, dimensions);
            solverName = 'Newton';
        } else {
            logger.warn('✗ Failed to compute Jacobian for Newton\'s method');
            logger.warn('Falling back to fixed-point iteration');
            solverBody = generateFixedPointSolverBody('x_new', updateExprFn, dimensions);
            solverName = 'Fixed-Point';
        }
    } else if (solutionMethod === 'newton-fd') {
        // Finite difference Newton's method - no symbolic expressions needed
        logger.info('✓ Using finite difference Newton\'s method for Implicit Euler');

        jacobianGLSL = generateMatrixInverseGLSL(dimensions);
        solverBody = generateNewtonFDSolverBody('x_new', velocityExprFn, dimensions);
        solverName = 'Newton (FD)';
    } else if (solutionMethod === 'midpoint') {
        solverBody = generateMidpointSolverBody('x_new', updateExprFn, dimensions);
        solverName = 'Midpoint';
    } else {
        // Default: fixed-point iteration
        solverBody = generateFixedPointSolverBody('x_new', updateExprFn, dimensions);
        solverName = 'Fixed-Point';
    }

    return {
        name: `Implicit Euler (${solverName})`,
        costFactor: 1, // Base cost (iterations are tunable convergence parameter)
        code: `
${jacobianGLSL}
// Implicit Euler integration (${solverName.toLowerCase()} solver)
${vecType} integrate(${vecType} pos, float h) {
    // Start with initial guess
    ${vecType} x_new = ${initialGuess};

    // Iterative solver
    for (int i = 0; i < ${iterations}; i++) {
${solverBody}
    }

    return x_new;
}
`
    };
}

/**
 * Implicit Midpoint (Implicit RK2)
 * Solves: x(t+h) = x(t) + h*f((x(t) + x(t+h))/2)
 * Can use fixed-point iteration, midpoint solver, or Newton's method
 * 2nd order accurate, A-stable (excellent for stiff systems)
 */
export function implicitMidpointIntegrator(dimensions, iterations = 4, solutionMethod = 'fixed-point', expressions = null) {
    logger.info(`*** Implicit Midpoint integrator requested: solutionMethod=${solutionMethod}, hasExpressions=${!!expressions}`);

    const vecType = `vec${dimensions}`;
    const matType = dimensions === 2 ? 'mat2' : dimensions === 3 ? 'mat3' : 'mat4';

    // Initial guess: explicit RK2
    const k1Init = 'get_velocity(pos)';
    const initialGuess = `pos + h * get_velocity(pos + h * 0.5 * ${k1Init})`;

    // Problem definition for Implicit Midpoint: x_new = pos + h * f((pos + x_new)/2)
    const updateExprFn = (v) => `pos + h * get_velocity((pos + ${v}) * 0.5)`;
    const velocityExprFn = (v) => `get_velocity((pos + ${v}) * 0.5)`;

    let solverBody;
    let solverName;
    let jacobianGLSL = '';

    // Choose solver method
    if (solutionMethod === 'newton' && expressions) {
        logger.info('Computing Jacobian for Newton\'s method (Implicit Midpoint)');

        const jacobian = computeSymbolicJacobian(expressions, dimensions);

        if (isValidJacobian(jacobian)) {
            logger.info('✓ Successfully using Newton\'s method for Implicit Midpoint');

            jacobianGLSL = generateJacobianGLSL(jacobian, dimensions);
            const residualExprFn = (v) => `${v} - pos - h * get_velocity((pos + ${v}) * 0.5)`;
            const jacobianExprFn = (v) => `${matType}(1.0) - (h * 0.5) * computeJacobian((pos + ${v}) * 0.5)`;

            solverBody = generateNewtonSolverBody('x_new', residualExprFn, jacobianExprFn, dimensions);
            solverName = 'Newton';
        } else {
            logger.warn('✗ Failed to compute Jacobian for Newton\'s method (Implicit Midpoint)');
            logger.warn('Falling back to fixed-point iteration');
            solverBody = generateFixedPointSolverBody('x_new', updateExprFn, dimensions);
            solverName = 'Fixed-Point';
        }
    } else if (solutionMethod === 'newton-fd') {
        logger.info('✓ Using finite difference Newton\'s method for Implicit Midpoint');

        jacobianGLSL = generateMatrixInverseGLSL(dimensions);
        solverBody = generateNewtonFDSolverBody('x_new', velocityExprFn, dimensions, 'h * 0.5');
        solverName = 'Newton (FD)';
    } else if (solutionMethod === 'midpoint') {
        solverBody = generateMidpointSolverBody('x_new', updateExprFn, dimensions);
        solverName = 'Midpoint';
    } else {
        // Default: fixed-point iteration
        solverBody = generateFixedPointSolverBody('x_new', updateExprFn, dimensions);
        solverName = 'Fixed-Point';
    }

    return {
        name: `Implicit Midpoint (${solverName})`,
        costFactor: 2, // 2nd order method (like explicit midpoint)
        code: `
${jacobianGLSL}
// Implicit Midpoint integration (${solverName.toLowerCase()} solver)
${vecType} integrate(${vecType} pos, float h) {
    // Start with initial guess
    ${vecType} x_new = ${initialGuess};

    // Iterative solver
    for (int i = 0; i < ${iterations}; i++) {
${solverBody}
    }

    return x_new;
}
`
    };
}

/**
 * Trapezoidal Rule (Implicit RK2)
 * Solves: x(t+h) = x(t) + h/2 * (f(x(t)) + f(x(t+h)))
 * Can use fixed-point iteration, midpoint solver, or Newton's method
 * 2nd order accurate, A-stable
 */
export function trapezoidalIntegrator(dimensions, iterations = 4, solutionMethod = 'fixed-point', expressions = null) {
    logger.info(`*** Trapezoidal integrator requested: solutionMethod=${solutionMethod}, hasExpressions=${!!expressions}`);

    const vecType = `vec${dimensions}`;
    const matType = dimensions === 2 ? 'mat2' : dimensions === 3 ? 'mat3' : 'mat4';

    const initialGuess = 'pos + h * f0';

    // Problem definition for Trapezoidal: x_new = pos + h/2 * (f0 + f(x_new))
    const updateExprFn = (v) => `pos + h * 0.5 * (f0 + get_velocity(${v}))`;
    const velocityExprFn = (v) => `get_velocity(${v})`;

    let solverBody;
    let solverName;
    let jacobianGLSL = '';

    // Choose solver method
    if (solutionMethod === 'newton' && expressions) {
        logger.info('Computing Jacobian for Newton\'s method (Trapezoidal)');

        const jacobian = computeSymbolicJacobian(expressions, dimensions);

        if (isValidJacobian(jacobian)) {
            logger.info('✓ Successfully using Newton\'s method for Trapezoidal');

            jacobianGLSL = generateJacobianGLSL(jacobian, dimensions);
            const residualExprFn = (v) => `${v} - pos - h * 0.5 * (f0 + get_velocity(${v}))`;
            const jacobianExprFn = (v) => `${matType}(1.0) - (h * 0.5) * computeJacobian(${v})`;

            solverBody = generateNewtonSolverBody('x_new', residualExprFn, jacobianExprFn, dimensions);
            solverName = 'Newton';
        } else {
            logger.warn('✗ Failed to compute Jacobian for Newton\'s method (Trapezoidal)');
            logger.warn('Falling back to fixed-point iteration');
            solverBody = generateFixedPointSolverBody('x_new', updateExprFn, dimensions);
            solverName = 'Fixed-Point';
        }
    } else if (solutionMethod === 'newton-fd') {
        logger.info('✓ Using finite difference Newton\'s method for Trapezoidal');

        jacobianGLSL = generateMatrixInverseGLSL(dimensions);
        solverBody = generateNewtonFDSolverBody('x_new', velocityExprFn, dimensions, 'h * 0.5', 'pos + h * 0.5 * (f0 + ' + velocityExprFn('x_new') + ')');
        solverName = 'Newton (FD)';
    } else if (solutionMethod === 'midpoint') {
        solverBody = generateMidpointSolverBody('x_new', updateExprFn, dimensions);
        solverName = 'Midpoint';
    } else {
        // Default: fixed-point iteration
        solverBody = generateFixedPointSolverBody('x_new', updateExprFn, dimensions);
        solverName = 'Fixed-Point';
    }

    return {
        name: `Trapezoidal (${solverName})`,
        costFactor: 2, // 2nd order method (like Heun)
        code: `
${jacobianGLSL}
// Trapezoidal Rule integration (${solverName.toLowerCase()} solver)
${vecType} integrate(${vecType} pos, float h) {
    ${vecType} f0 = get_velocity(pos);

    // Start with initial guess
    ${vecType} x_new = ${initialGuess};

    // Iterative solver
    for (int i = 0; i < ${iterations}; i++) {
${solverBody}
    }

    return x_new;
}
`
    };
}

/**
 * Implicit RK4 (Gauss-Legendre)
 * Fully implicit 4th order method, excellent stability
 * Uses simplified 2-stage Gauss-Legendre
 * Can use fixed-point iteration, midpoint solver, or Newton's method
 *
 * Note: This uses a simplified Newton's method that treats each stage separately
 * (Gauss-Seidel style). A full Newton's method would solve the coupled 2N×2N system
 * for both stages simultaneously, which is more accurate but significantly more complex.
 * The simplified approach offers a good balance of accuracy and implementation complexity.
 */
export function implicitRK4Integrator(dimensions, iterations = 5, solutionMethod = 'fixed-point', expressions = null) {
    logger.info(`*** Implicit RK4 integrator requested: solutionMethod=${solutionMethod}, hasExpressions=${!!expressions}`);

    const vecType = `vec${dimensions}`;
    const matType = dimensions === 2 ? 'mat2' : dimensions === 3 ? 'mat3' : 'mat4';

    // Gauss-Legendre coefficients (will be inlined in GLSL)
    const coeffsGLSL = `
    // Gauss-Legendre coefficients for 2-stage method
    const float a11 = 0.25;
    const float a12 = 0.25 - sqrt(3.0) / 6.0;
    const float a21 = 0.25 + sqrt(3.0) / 6.0;
    const float a22 = 0.25;
    const float b1 = 0.5;
    const float b2 = 0.5;
    const float c1 = 0.5 - sqrt(3.0) / 6.0;
    const float c2 = 0.5 + sqrt(3.0) / 6.0;`;

    const initialGuessGLSL = `
    // Start with explicit RK4 as initial guess
    ${vecType} k1_guess = get_velocity(pos);
    ${vecType} k2_guess = get_velocity(pos + h * 0.5 * k1_guess);

    ${vecType} k1 = k1_guess;
    ${vecType} k2 = k2_guess;`;

    // Problem: k1 = f(pos + h*(a11*k1 + a12*k2)), k2 = f(pos + h*(a21*k1 + a22*k2))
    // Update functions for each stage
    const k1_updateFn = (v) => `get_velocity(pos + h * (a11 * ${v} + a12 * k2))`;
    const k2_updateFn = (v) => `get_velocity(pos + h * (a21 * k1 + a22 * ${v}))`;

    // Velocity functions for finite difference
    const k1_velocityFn = (v) => `get_velocity(pos + h * (a11 * ${v} + a12 * k2))`;
    const k2_velocityFn = (v) => `get_velocity(pos + h * (a21 * k1 + a22 * ${v}))`;

    let k1_solverBody, k2_solverBody;
    let solverName;
    let jacobianGLSL = '';

    // Choose solver method
    if (solutionMethod === 'newton' && expressions) {
        logger.info('Computing Jacobian for Newton\'s method (Implicit RK4 - simplified)');

        const jacobian = computeSymbolicJacobian(expressions, dimensions);

        if (isValidJacobian(jacobian)) {
            logger.info('✓ Successfully using simplified Newton\'s method for Implicit RK4');

            jacobianGLSL = generateJacobianGLSL(jacobian, dimensions);

            // Define residual and Jacobian functions for each stage
            // Stage 1: F1(k1) = k1 - f(pos + h*(a11*k1 + a12*k2))
            const k1_residualFn = (v) => `${v} - get_velocity(pos + h * (a11 * ${v} + a12 * k2))`;
            const k1_jacobianFn = (v) => `${matType}(1.0) - (h * a11) * computeJacobian(pos + h * (a11 * ${v} + a12 * k2))`;

            // Stage 2: F2(k2) = k2 - f(pos + h*(a21*k1 + a22*k2))
            const k2_residualFn = (v) => `${v} - get_velocity(pos + h * (a21 * k1 + a22 * ${v}))`;
            const k2_jacobianFn = (v) => `${matType}(1.0) - (h * a22) * computeJacobian(pos + h * (a21 * k1 + a22 * ${v}))`;

            k1_solverBody = generateNewtonSolverBody('k1', k1_residualFn, k1_jacobianFn, dimensions);
            k2_solverBody = generateNewtonSolverBody('k2', k2_residualFn, k2_jacobianFn, dimensions);

            solverName = 'Newton';
        } else {
            logger.warn('✗ Failed to compute Jacobian for Newton\'s method (Implicit RK4)');
            logger.warn('Falling back to fixed-point iteration');
            k1_solverBody = generateFixedPointSolverBody('k1', k1_updateFn, dimensions);
            k2_solverBody = generateFixedPointSolverBody('k2', k2_updateFn, dimensions);
            solverName = 'Fixed-Point';
        }
    } else if (solutionMethod === 'newton-fd') {
        logger.info('✓ Using finite difference Newton\'s method for Implicit RK4 (simplified)');

        jacobianGLSL = generateMatrixInverseGLSL(dimensions);

        // For each stage k_i: k_i = f(pos + h*(a_i1*k1 + a_i2*k2))
        // Residual: F(k_i) = k_i - f(...)
        // Jacobian: J = I - h*a_ii*Df
        k1_solverBody = generateNewtonFDSolverBody('k1', k1_velocityFn, dimensions, 'h * a11');
        k2_solverBody = generateNewtonFDSolverBody('k2', k2_velocityFn, dimensions, 'h * a22');

        solverName = 'Newton (FD)';
    } else if (solutionMethod === 'midpoint') {
        k1_solverBody = generateMidpointSolverBody('k1', k1_updateFn, dimensions);
        k2_solverBody = generateMidpointSolverBody('k2', k2_updateFn, dimensions);
        solverName = 'Midpoint';
    } else {
        // Default: fixed-point iteration
        k1_solverBody = generateFixedPointSolverBody('k1', k1_updateFn, dimensions);
        k2_solverBody = generateFixedPointSolverBody('k2', k2_updateFn, dimensions);
        solverName = 'Fixed-Point';
    }

    // Build the solver loop (both stages in one loop, Gauss-Seidel style)
    const solverCode = `
    // Iterative solver for coupled stages (Gauss-Seidel style)
    for (int i = 0; i < ${iterations}; i++) {
        // Stage 1
${k1_solverBody}

        // Stage 2
${k2_solverBody}
    }`;

    return {
        name: `Implicit RK4 (${solverName})`,
        costFactor: 4, // 4th order method (like explicit RK4)
        code: `
${jacobianGLSL}
// Implicit RK4 (Gauss-Legendre 2-stage) integration (${solverName.toLowerCase()} solver)
${vecType} integrate(${vecType} pos, float h) {
${coeffsGLSL}
${initialGuessGLSL}
${solverCode}

    return pos + h * (b1 * k1 + b2 * k2);
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
        case 'explicit-midpoint':
            return explicitMidpointIntegrator(dimensions);
        case 'heun':
            return heunIntegrator(dimensions);
        case 'rk4':
            return rk4Integrator(dimensions);
        case 'implicit-euler':
            return implicitEulerIntegrator(dimensions, iterations, solutionMethod, expressions);
        case 'implicit-midpoint':
            return implicitMidpointIntegrator(dimensions, params.iterations || 4, solutionMethod, expressions);
        case 'trapezoidal':
            return trapezoidalIntegrator(dimensions, params.iterations || 4, solutionMethod, expressions);
        case 'implicit-rk4':
            return implicitRK4Integrator(dimensions, params.iterations || 5, solutionMethod, expressions);
        // Legacy aliases
        case 'rk2':
            return explicitMidpointIntegrator(dimensions);
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
