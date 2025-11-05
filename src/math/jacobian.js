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
        if (n <= 4) {
            return Array(n).fill(base).join('*');
        }
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
    logger.info('=== JACOBIAN COMPUTATION START ===');
    logger.info('Timestamp:', new Date().toISOString());
    logger.info('Nerdamer loaded:', !!window.nerdamer);
    logger.info('Nerdamer type:', typeof window.nerdamer);
    logger.info('Nerdamer is function:', typeof window.nerdamer === 'function');
    logger.info('Nerdamer.diff exists:', window.nerdamer && typeof window.nerdamer.diff === 'function');
    logger.info('Nerdamer.clear exists:', window.nerdamer && typeof window.nerdamer.clear === 'function');
    logger.info('Input expressions:', expressions);
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

        const jacobian = [];

        // For each output dimension i
        for (let i = 0; i < dimensions; i++) {
            const row = [];
            const expr = expressions[i];
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

                    // Simplify the result
                    let simplified = window.nerdamer(derivative).toString();
                    logger.verbose(`  Simplified: ${simplified}`);

                    // Optimize: replace pow(x, n) with x*x*... for small integer exponents
                    simplified = optimizePowerExpressions(simplified);
                    logger.verbose(`  Optimized: ${simplified}`);

                    row.push(simplified);
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
