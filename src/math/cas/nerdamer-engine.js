/**
 * Nerdamer CAS Engine Implementation
 *
 * Wraps the Nerdamer symbolic math library to implement the CASEngine interface.
 * Nerdamer is loaded globally via CDN in index.html.
 */

import { CASEngine } from './cas-interface.js';
import { logger } from '../../utils/debug-logger.js';

/**
 * Optimize power expressions: replace pow(x, n) with x*x*... for small integers
 * Also cleans up other common patterns
 *
 * @param {string} expr - Expression to optimize
 * @returns {string} - Optimized expression
 */
function optimizePowerExpressions(expr) {
    // Replace var^integer with repeated multiplication
    expr = expr.replace(/([a-z]+)\^(\d+)/g, (match, base, exp) => {
        const n = parseInt(exp);
        if (n === 0) return '1';
        if (n === 1) return base;
        return Array(n).fill(base).join('*');
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
 * Nerdamer CAS Engine
 */
export class NerdamerEngine extends CASEngine {
    constructor() {
        super();
    }

    // ===== Lifecycle =====

    async initialize() {
        // Check if Nerdamer is loaded (should be loaded via CDN in index.html)
        if (!window.nerdamer) {
            throw new Error('Nerdamer not loaded - ensure nerdamer CDN script is included in index.html');
        }

        if (typeof window.nerdamer !== 'function') {
            throw new Error('Nerdamer is not a function - invalid state');
        }

        if (!window.nerdamer.diff) {
            throw new Error('Nerdamer.diff not available - incomplete initialization');
        }

        this._ready = true;
        logger.info('NerdamerEngine initialized successfully');
    }

    // ===== Core Symbolic Operations =====

    parse(expr) {
        if (!this._ready) {
            throw new Error('NerdamerEngine not initialized');
        }
        return window.nerdamer(expr);
    }

    evaluate(expression) {
        if (!this._ready) {
            throw new Error('NerdamerEngine not initialized');
        }

        try {
            const result = window.nerdamer(expression);
            const resultStr = result.toString();

            // Use Nerdamer's built-in LaTeX converter
            let tex = window.nerdamer.convertToLaTeX(resultStr);

            // Clean up Nerdamer's quirks
            tex = this._cleanupTeX(tex);

            return {
                result: resultStr,
                tex: tex
            };
        } catch (error) {
            return {
                result: '',
                tex: '',
                error: error.message
            };
        }
    }

    differentiate(expr, variable) {
        if (!this._ready) {
            throw new Error('NerdamerEngine not initialized');
        }

        try {
            // Parse expression fresh each time to avoid cache issues
            const parsed = window.nerdamer(expr);
            const derivative = window.nerdamer.diff(parsed, variable);
            const derivativeStr = derivative.toString();

            // DON'T call simplify() - Nerdamer often makes things worse
            // Just optimize power expressions and use the raw derivative
            return optimizePowerExpressions(derivativeStr);
        } catch (error) {
            logger.warn(`Failed to differentiate "${expr}" w.r.t. ${variable}:`, error.message);
            return '0'; // Default to zero if differentiation fails
        }
    }

    simplify(expr) {
        if (!this._ready) {
            throw new Error('NerdamerEngine not initialized');
        }

        try {
            // NOTE: Nerdamer's simplify() is problematic and often makes things worse
            // We avoid using it in most cases, but provide the method for completeness
            const result = window.nerdamer(`simplify(${expr})`);
            return result.toString();
        } catch (error) {
            logger.warn(`Failed to simplify "${expr}":`, error.message);
            return expr; // Return original if simplification fails
        }
    }

    solve(equation, variable) {
        if (!this._ready) {
            throw new Error('NerdamerEngine not initialized');
        }

        try {
            const solutions = window.nerdamer.solve(equation, variable);
            return solutions ? solutions.toString() : null;
        } catch (error) {
            logger.warn(`Failed to solve "${equation}" for ${variable}:`, error.message);
            return null;
        }
    }

    // ===== Matrix Operations =====

    invertMatrix(matrixElements) {
        if (!this._ready) {
            throw new Error('NerdamerEngine not initialized');
        }

        const n = matrixElements.length;
        if (n < 2 || n > 4) {
            logger.error(`Matrix inversion only supported for 2x2, 3x3, and 4x4 matrices (got ${n}x${n})`);
            return null;
        }

        try {
            // Use Nerdamer's matrix inversion
            // matrix() takes rows as separate arguments: matrix([a,b],[c,d])
            const matrixArgs = matrixElements.map(row => `[${row.join(',')}]`).join(',');
            logger.verbose('Inverting matrix:', `matrix(${matrixArgs})`);

            // Invert the matrix using Nerdamer's invert function
            window.nerdamer.setVar('J_temp', `matrix(${matrixArgs})`);
            window.nerdamer.setVar('J_inv', 'invert(J_temp)');

            // Extract result as array using matget() for each element
            const result = [];
            for (let i = 0; i < n; i++) {
                const row = [];
                for (let j = 0; j < n; j++) {
                    const element = window.nerdamer(`matget(J_inv, ${i}, ${j})`).toString();
                    const optimized = optimizePowerExpressions(element);
                    row.push(optimized);
                }
                result.push(row);
            }

            logger.verbose('Inverted matrix successfully');
            return result;

        } catch (error) {
            logger.error('Failed to invert matrix:', error.message);
            return null;
        }
    }

    matrixElement(matrix, i, j) {
        if (!this._ready) {
            throw new Error('NerdamerEngine not initialized');
        }

        try {
            // Assuming matrix is a Nerdamer matrix variable name
            const element = window.nerdamer(`matget(${matrix}, ${i}, ${j})`);
            return element.toString();
        } catch (error) {
            logger.error(`Failed to get matrix element [${i},${j}]:`, error.message);
            return '0';
        }
    }

    setVariable(name, value) {
        if (!this._ready) {
            throw new Error('NerdamerEngine not initialized');
        }

        window.nerdamer.setVar(name, value);
    }

    // ===== Code Generation =====

    toGLSL(expr) {
        // Nerdamer expressions are already close to GLSL syntax
        // Just need to handle a few conversions
        let glsl = expr;

        // Convert ^ to pow() for GLSL
        glsl = glsl.replace(/([a-zA-Z0-9_]+)\^([a-zA-Z0-9_]+)/g, 'pow($1, $2)');

        // Nerdamer uses log() for natural log, GLSL uses log()
        // Nerdamer uses ln() for natural log in some cases
        glsl = glsl.replace(/\bln\(/g, 'log(');

        return glsl;
    }

    toTeX(expr) {
        // Use Nerdamer's built-in LaTeX converter
        let tex = window.nerdamer.convertToLaTeX(expr);
        return this._cleanupTeX(tex);
    }

    /**
     * Clean up quirks in Nerdamer's LaTeX output
     * @private
     */
    _cleanupTeX(tex) {
        // Remove unnecessary ^{1} exponents
        tex = tex.replace(/\^\{1\}/g, '');
        return tex;
    }

    /**
     * Basic conversion of math expressions to TeX
     * @private
     */
    _basicTexConversion(expr) {
        let tex = expr;

        // Convert ^ to superscript
        tex = tex.replace(/([a-zA-Z0-9_]+)\^([0-9]+)/g, '$1^{$2}');
        tex = tex.replace(/([a-zA-Z0-9_]+)\^([a-zA-Z]+)/g, '$1^{$2}');

        // Convert * to \cdot (optional, for better appearance)
        // tex = tex.replace(/\*/g, '\\cdot ');

        // Convert sqrt to \sqrt
        tex = tex.replace(/sqrt\(([^)]+)\)/g, '\\sqrt{$1}');

        // Convert fractions (simple case: a/b where a,b are single tokens)
        tex = tex.replace(/([a-zA-Z0-9_]+)\/([a-zA-Z0-9_]+)/g, '\\frac{$1}{$2}');

        return tex;
    }

    // ===== Utility Methods =====

    clearCache() {
        if (!this._ready) return;

        // NOTE: Clearing nerdamer cache will clear ALL definitions (including notebook)
        // The Notebook class will handle re-applying its context via ensureContext()
        // after any cache clear operation
        if (window.nerdamer && window.nerdamer.clear) {
            logger.verbose('Clearing Nerdamer cache (all definitions cleared)');
            window.nerdamer.clear('all');
        }
    }

    toString(result) {
        if (typeof result === 'string') {
            return result;
        }
        if (result && typeof result.toString === 'function') {
            return result.toString();
        }
        return String(result);
    }

    // ===== Metadata =====

    getName() {
        return 'Nerdamer';
    }

    getCapabilities() {
        return {
            differentiate: true,
            integrate: false, // Nerdamer has integration but we're not using it
            solve: true,
            matrices: true,
            simplify: true, // Available but problematic
            persistentNotebookContext: false // Nerdamer.clear('all') clears everything, must re-apply notebook
        };
    }

    getVersion() {
        // Nerdamer doesn't expose version easily, but we can check
        return window.nerdamer ? 'loaded' : 'not loaded';
    }
}
