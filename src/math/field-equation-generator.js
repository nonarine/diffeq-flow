/**
 * Field Equation Generator
 *
 * Generates GLSL code for vector field equations (dx/dt, dy/dt, etc.)
 *
 * NOTE: This generator handles ONLY vector field equations. Other GLSL generation
 * that currently happens in the renderer needs to be migrated to IGLSLGenerator
 * implementations:
 * - Jacobian matrix generation (for Newton's method in implicit integrators)
 * - Color expression generation (custom color modes)
 * - Custom mapper expressions (2D projection)
 * - Any other user-editable GLSL expressions
 *
 * These should be user-editable in modals similar to FieldEquationsEditor.
 * See TODO.md for migration tasks.
 *
 * Usage Pattern (same for UI and automation):
 *
 * Interactive (UI):
 *   const glslArray = controls.map(ctrl => ctrl.getGLSL());
 *   renderer.updateConfig({ expressions: glslArray });
 *
 * Automated (presets):
 *   const glslArray = expressions.map((expr, i) =>
 *       generator.generate(expr, notebook, { dimension: i, totalDims: N })
 *   );
 *   renderer.updateConfig({ expressions: glslArray });
 */

import { IGLSLGenerator } from './glsl-generator.js';
import { parseExpression } from './parser.js';
import { logger } from '../utils/debug-logger.js';

/**
 * Generator for vector field equations
 * Converts math expressions to GLSL velocity field code
 */
export class FieldEquationGenerator extends IGLSLGenerator {
    /**
     * @param {Object} options - Generator options
     * @param {string[]} options.variableNames - Variable names (e.g., ['x', 'y', 'z'])
     */
    constructor(options = {}) {
        super();
        this.variableNames = options.variableNames || null; // Will be inferred from context if null
    }

    /**
     * Validate field equation expression
     *
     * @param {string} mathExpr - Math expression (e.g., "sin(x) + y")
     * @param {Object} context - { dimension: 0, totalDims: 2 }
     * @returns {{valid: boolean, error?: string}}
     */
    validate(mathExpr, context = {}) {
        if (!mathExpr || !mathExpr.trim()) {
            return { valid: false, error: 'Expression is empty' };
        }

        if (context.dimension === undefined) {
            return { valid: false, error: 'Context must include dimension index' };
        }

        if (context.totalDims === undefined) {
            return { valid: false, error: 'Context must include totalDims' };
        }

        return { valid: true };
    }

    /**
     * Generate GLSL code for a single field equation
     *
     * @param {string} mathExpr - Math expression (e.g., "-y")
     * @param {Notebook} notebook - Notebook instance (for function expansion)
     * @param {Object} context - { dimension: 0, totalDims: 2 }
     * @returns {string} GLSL expression (e.g., "-pos.y")
     * @throws {Error} If generation fails
     */
    generate(mathExpr, notebook, context = {}) {
        // Validate input
        const validation = this.validate(mathExpr, context);
        if (!validation.valid) {
            throw new Error(`Validation failed: ${validation.error}`);
        }

        const { dimension, totalDims } = context;

        // Step 1: Expand functions using notebook context
        let expanded = mathExpr;
        if (notebook) {
            try {
                expanded = notebook.expandFunctions(mathExpr);
                logger.verbose(`Field equation ${dimension}: "${mathExpr}" → "${expanded}"`);
            } catch (error) {
                logger.warn(`Failed to expand functions for dimension ${dimension}:`, error.message);
                // Continue with unexpanded expression
            }
        }

        // Step 2: Determine variable names
        const vars = this.variableNames || this._getDefaultVariableNames(totalDims);

        // Step 3: Parse to GLSL
        try {
            const glslExpr = parseExpression(expanded, totalDims, vars, 'pos');
            logger.verbose(`Field equation ${dimension} GLSL: ${glslExpr}`);
            return glslExpr;
        } catch (error) {
            throw new Error(`Failed to parse expression for dimension ${dimension}: ${error.message}`);
        }
    }

    /**
     * Get default variable names for N dimensions
     * @private
     */
    _getDefaultVariableNames(dims) {
        const names = ['x', 'y', 'z', 'w', 'u', 'v'];
        return names.slice(0, dims);
    }

    getDescription() {
        return 'Vector field equation (dx/dt = ...)';
    }

    getMathPlaceholder() {
        return 'Enter field equation (e.g., -y, sin(x), etc.)';
    }

    getGLSLPlaceholder() {
        return 'Generated GLSL expression...';
    }
}
