/**
 * Jacobian matrix computation using symbolic differentiation
 */

import { logger } from '../utils/debug-logger.js';

/**
 * Variable names for each dimension (matches parser.js)
 */
const VARIABLE_NAMES = ['x', 'y', 'z', 'w', 'u', 'v'];

/**
 * Optimize power expressions: replace pow(x, n) with x*x*... for small integers
 * Also cleans up other common patterns
 *
 * @param {string} expr - Expression to optimize
 * @returns {string} - Optimized expression
 */
function optimizePowerExpressions(expr) {
    // Replace pow(var, integer) with repeated multiplication for n <= 4
    expr = expr.replace(/([a-z]+)\^(\d+)/g, (match, base, exp) => {
        const n = parseInt(exp);
        if (n === 0) return '1';
        if (n === 1) return base;
        // if (n <= 4) {
            return Array(n).fill(base).join('*');
        // }
        return match; // Keep pow for larger exponents
    });

    // Nerdamer uses ^ for exponentiation, but also handle pow() format
    expr = expr.replace(/pow\(([a-z]+),\s*(\d+)\)/g, (match, base, exp) => {
        const n = parseInt(exp);
        if (n === 0) return '1';
        if (n === 1) return base;
        if (n <= 4) {
            return Array(n).fill(base).join('*');
        }
        return match;
    });

    return expr;
}

/**
 * Compute the Jacobian matrix symbolically
 *
 * For a vector field f = [f_0, f_1, ..., f_n], computes the matrix:
 * J[i][j] = ∂f_i/∂x_j
 *
 * BUG: This function sometimes produces inconsistent results on initial page load
 * (possibly due to Nerdamer initialization timing issues or internal caching bugs).
 * Workaround: Always start with fixed-point iteration and switch to Newton's method
 * after a 3-second delay (see controls-v2.js).
 *
 * @param {string[]} expressions - Array of expression strings (one per dimension)
 * @param {number} dimensions - Number of dimensions
 * @returns {string[][]|null} - 2D array of symbolic derivative strings, or null if failed
 */
export function computeSymbolicJacobian(expressions, dimensions) {

    logger.verbosity = 'verbose';

    logger.info('=== JACOBIAN COMPUTATION START ===');
    logger.info('Timestamp:', new Date().toISOString());
    logger.info('Nerdamer loaded:', !!window.nerdamer);
    logger.info('Nerdamer type:', typeof window.nerdamer);
    logger.info('Nerdamer is function:', typeof window.nerdamer === 'function');
    logger.info('Nerdamer.diff exists:', window.nerdamer && typeof window.nerdamer.diff === 'function');
    logger.info('Nerdamer.clear exists:', window.nerdamer && typeof window.nerdamer.clear === 'function');
    logger.info('Input expressions:', expressions.toString());
    logger.info('Dimensions:', dimensions);

    if (!window.nerdamer) {
        logger.error('Nerdamer not loaded - cannot compute Jacobian');
        return null;
    }

    if (typeof window.nerdamer !== 'function') {
        logger.error('Nerdamer is not a function - invalid state');
        return null;
    }

    if (!window.nerdamer.diff) {
        logger.error('Nerdamer.diff not available - incomplete initialization');
        return null;
    }

    try {
        // Clear Nerdamer's internal cache to avoid stale results
        if (window.nerdamer && window.nerdamer.clear) {
            logger.verbose('Clearing Nerdamer cache');
            window.nerdamer.clear('all');
        }

        // Test consistency: differentiate a simple expression twice
        logger.verbose('Testing Nerdamer consistency...');
        try {
            const testExpr = 'x*y';
            const testVar = 'x';
            const test1 = window.nerdamer.diff(window.nerdamer(testExpr), testVar).toString();
            window.nerdamer.clear('all'); // Clear between tests
            const test2 = window.nerdamer.diff(window.nerdamer(testExpr), testVar).toString();
            logger.verbose(`Consistency test: d(${testExpr})/d${testVar}`);
            logger.verbose(`  First result:  ${test1}`);
            logger.verbose(`  Second result: ${test2}`);
            logger.verbose(`  Consistent: ${test1 === test2}`);
            if (test1 !== test2) {
                logger.error('WARNING: Nerdamer is giving inconsistent results!');
            }
        } catch (e) {
            logger.warn('Consistency test failed:', e.message);
        }

        // WORKAROUND: Nerdamer doesn't support atan2(y, x) differentiation
        // Replace atan2(A, B) with atan(A/B) for differentiation
        // The derivatives are mathematically identical:
        //   d/dB[atan2(A,B)] = -A/(A²+B²) = d/dB[atan(A/B)]
        //   d/dA[atan2(A,B)] = B/(A²+B²) = d/dA[atan(A/B)]
        // Multi-chart approach handles singularities: Chart 2 swaps arguments so
        // atan2(y,x) becomes atan2(x,y) → atan(x/y), moving singularity from x=0 to y=0
        const expressionsForDiff = expressions.map(expr => {
            const replaced = expr.replace(/atan2\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, 'atan(($1)/($2))');
            if (replaced !== expr) {
                logger.verbose(`Replaced atan2 for differentiation: "${expr}" → "${replaced}"`);
            }
            return replaced;
        });

        const jacobian = [];

        // For each output dimension i
        for (let i = 0; i < dimensions; i++) {
            const row = [];
            const expr = expressionsForDiff[i]; // Use preprocessed expression
            logger.verbose(`Row ${i}: differentiating expression "${expr}"`);

            // For each input variable j
            for (let j = 0; j < dimensions; j++) {
                const variable = VARIABLE_NAMES[j];

                try {
                    // Compute symbolic derivative ∂f_i/∂x_j
                    // Use nerdamer() to parse fresh each time
                    logger.verbose(`  Computing ∂(${expr})/∂${variable}...`);
                    const derivative = window.nerdamer.diff(window.nerdamer(expr), variable).toString();
                    logger.verbose(`  Raw derivative: ${derivative}`);

                    // DON'T call simplify() - Nerdamer often makes things worse by:
                    // - Introducing negative powers (x^(-1) instead of 1/x)
                    // - Creating imaginary terms (sqrt(-y))
                    // - Expanding expressions to be much longer
                    // Just optimize power expressions and use the raw derivative
                    let optimized = optimizePowerExpressions(derivative);
                    logger.verbose(`  Optimized: ${optimized}`);

                    row.push(optimized);
                } catch (error) {
                    logger.warn(`Failed to differentiate expression "${expr}" w.r.t. ${variable}: ${error.message}`);
                    // Default to zero if differentiation fails
                    row.push('0');
                }
            }

            jacobian.push(row);
        }

        logger.info('=== JACOBIAN COMPUTATION COMPLETE ===');
        logger.info('Final Jacobian matrix:');
        for (let i = 0; i < jacobian.length; i++) {
            logger.info(`  Row ${i}: [${jacobian[i].join(', ')}]`);
        }

        // Simplify the forward Jacobian BEFORE inversion to help with complex sqrt terms
        // logger.verbose('Simplifying forward Jacobian before inversion...');
        // const simplifiedJacobian = jacobian.map((row, i) => {
        //     return row.map((element, j) => {
        //         try {
        //             const simplified = window.nerdamer(`simplify(${element})`).toString();
        //             if (simplified !== element) {
        //                 logger.verbose(`  J[${i},${j}]: "${element}" → "${simplified}"`);
        //             }
        //             return simplified;
        //         } catch (e) {
        //             logger.warn(`Failed to simplify J[${i},${j}]: ${e.message}`);
        //             return element;
        //         }
        //     });
        // });

        return jacobian;

    } catch (error) {
        logger.error('Failed to compute Jacobian matrix', error);
        return null;
    }
}

/**
 * Test if a Jacobian matrix is valid (no undefined/null entries)
 *
 * @param {string[][]|null} jacobian - Jacobian matrix to test
 * @returns {boolean} - True if valid
 */
export function isValidJacobian(jacobian) {
    if (!jacobian || !Array.isArray(jacobian)) {
        return false;
    }

    for (const row of jacobian) {
        if (!Array.isArray(row)) {
            return false;
        }
        for (const entry of row) {
            if (typeof entry !== 'string' || entry === '') {
                return false;
            }
        }
    }

    return true;
}

/**
 * Format Jacobian matrix for display
 *
 * @param {string[][]} jacobian - Jacobian matrix
 * @returns {string} - Formatted string representation
 */
export function formatJacobian(jacobian) {
    if (!jacobian) return 'null';

    const maxLen = Math.max(...jacobian.flat().map(s => s.length));

    let result = '[\n';
    for (const row of jacobian) {
        result += '  [' + row.map(s => s.padEnd(maxLen)).join(', ') + ']\n';
    }
    result += ']';

    return result;
}

/**
 * Invert a symbolic Jacobian matrix using Nerdamer
 * Supports 2x2, 3x3, and 4x4 matrices
 *
 * @param {string[][]} jacobian - Jacobian matrix to invert
 * @returns {string[][]|null} - Inverted matrix or null if failed
 */
export function invertJacobian(jacobian) {
    if (!jacobian || !Array.isArray(jacobian)) {
        logger.error('Invalid Jacobian for inversion');
        return null;
    }

    const n = jacobian.length;
    if (n < 2 || n > 4) {
        logger.error(`Jacobian inversion only supported for 2x2, 3x3, and 4x4 matrices (got ${n}x${n})`);
        return null;
    }

    try {
        // Use Nerdamer's matrix inversion for all sizes
        // matrix() takes rows as separate arguments: matrix([a,b],[c,d]), not matrix([[a,b],[c,d]])
        const matrixArgs = jacobian.map(row => `[${row.join(',')}]`).join(',');
        logger.verbose('Inverting Jacobian matrix:', `matrix(${matrixArgs})`);

        // Invert the matrix using Nerdamer's invert function (once!)
        window.nerdamer.setVar('J_temp', `matrix(${matrixArgs})`);
        window.nerdamer.setVar('J_inv', 'invert(J_temp)');

        // Extract result as array using matget() for each element
        const result = [];
        for (let i = 0; i < n; i++) {
            const row = [];
            for (let j = 0; j < n; j++) {
                // Use matget to access matrix element (0-based indexing)
                const element = window.nerdamer(`matget(J_inv, ${i}, ${j})`).toString();
                // Don't simplify - it introduces imaginary numbers and timeouts
                const optimized = optimizePowerExpressions(element);
                row.push(optimized);
            }
            result.push(row);
        }

        logger.verbose('Inverted Jacobian:');
        for (let i = 0; i < result.length; i++) {
            logger.verbose(`  Row ${i}: [${result[i].join(', ')}]`);
        }

        return result;

    } catch (error) {
        logger.error('Failed to invert Jacobian:', error.message);
        return null;
    }
}
