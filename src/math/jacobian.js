/**
 * Jacobian matrix computation using symbolic differentiation
 */

import { logger } from '../utils/debug-logger.js';

/**
 * Notebook instance (injected from main.js)
 * @type {import('./notebook.js').Notebook}
 */
let notebook = null;

/**
 * Set the Notebook to use for Jacobian computation
 * @param {import('./notebook.js').Notebook} nb
 */
export function setNotebook(nb) {
    notebook = nb;
    logger.info('Jacobian: Notebook set (CAS engine:', notebook.casEngine.getName() + ')');
}

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
    logger.info('Notebook:', notebook ? 'set' : 'not set');
    logger.info('CAS Engine:', notebook ? notebook.casEngine.getName() : 'not available');
    logger.info('Input expressions:', expressions.toString());
    logger.info('Dimensions:', dimensions);

    if (!notebook) {
        logger.error('Notebook not set - cannot compute Jacobian');
        return null;
    }

    if (!notebook.casEngine.isReady()) {
        logger.error('CAS engine not ready - cannot compute Jacobian');
        return null;
    }

    try {
        // NOTE: We do NOT clear cache here because:
        // 1. We parse expressions fresh on each differentiation call
        // 2. No state is reused between Jacobian computations
        // 3. The original cache clear was a workaround for a nerdamer initialization bug
        //    that may no longer be necessary with proper async initialization
        // If we see inconsistent results, we can add cache clearing back with proper justification

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
                    // Compute symbolic derivative ∂f_i/∂x_j using Notebook
                    // Notebook ensures context is applied before calling CAS engine
                    logger.verbose(`  Computing ∂(${expr})/∂${variable}...`);
                    const derivative = notebook.differentiate(expr, variable);
                    logger.verbose(`  Derivative: ${derivative}`);

                    // Note: differentiate() already handles optimization internally
                    row.push(derivative);
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

    if (!notebook) {
        logger.error('Notebook not set - cannot invert Jacobian');
        return null;
    }

    const n = jacobian.length;
    if (n < 2 || n > 4) {
        logger.error(`Jacobian inversion only supported for 2x2, 3x3, and 4x4 matrices (got ${n}x${n})`);
        return null;
    }

    try {
        logger.verbose('Inverting Jacobian matrix using', notebook.casEngine.getName());

        // Use Notebook's matrix inversion (ensures context is applied)
        const result = notebook.invertMatrix(jacobian);

        if (result) {
            logger.verbose('Inverted Jacobian:');
            for (let i = 0; i < result.length; i++) {
                logger.verbose(`  Row ${i}: [${result[i].join(', ')}]`);
            }
        }

        return result;

    } catch (error) {
        logger.error('Failed to invert Jacobian:', error.message);
        return null;
    }
}
