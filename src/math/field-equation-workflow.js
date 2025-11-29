/**
 * Field Equation Workflow
 *
 * Implements the workflow for vector field equations.
 * Extends GLSLWorkflow base class with field-specific logic.
 *
 * NOTE: The generated GLSL is ephemeral (cached for performance, not saved).
 * Only the original math expressions are persisted to localStorage.
 * On page reload, GLSL is regenerated from saved math expressions.
 *
 * FUTURE WORK: Create similar workflows for other GLSL generation:
 * - JacobianWorkflow - For Newton's method in implicit integrators
 * - ColorExpressionWorkflow - For custom color modes
 * - CustomMapperWorkflow - For custom 2D projections
 * See TODO.md for details.
 */

import { GLSLWorkflow } from './glsl-workflow.js';
import { FieldEquationGenerator } from './field-equation-generator.js';
import { logger } from '../utils/debug-logger.js';

/**
 * Workflow for field equation generation and application
 */
export class FieldEquationWorkflow extends GLSLWorkflow {
    constructor(generator = null) {
        super(generator || new FieldEquationGenerator());
    }

    /**
     * Get generation context for field equations
     *
     * @param {number} index - Dimension index
     * @param {number} totalCount - Total dimensions
     * @returns {Object} Context with dimension and totalDims
     */
    getGenerationContext(index, totalCount) {
        return {
            dimension: index,
            totalDims: totalCount
        };
    }

    /**
     * Apply field equations to renderer
     *
     * @param {string[]} glslArray - Generated GLSL expressions
     * @param {Renderer} renderer - Renderer instance
     * @param {string[]} expressions - Original math expressions
     */
    applyToRenderer(glslArray, renderer, expressions) {
        // Expand custom functions for JS evaluators
        // (They need expanded form just like GLSL, but our notebook already did this during generation)
        // Pass the expanded form that was used for GLSL generation
        const expandedExprs = expressions.map((expr, i) => {
            // The GLSL was generated from expanded expressions
            // We need to expand for JS evaluators too
            if (window.notebook) {
                try {
                    return window.notebook.expandFunctions(expr);
                } catch (error) {
                    logger.warn(`Failed to expand "${expr}" for JS evaluator:`, error.message);
                    return expr;
                }
            }
            return expr;
        });

        renderer.updateConfig({
            dimensions: expressions.length, // Update dimension count based on expression array length
            expressions: expandedExprs,     // Expanded math for JS evaluators
            velocityGLSL: glslArray        // Pre-generated GLSL for shaders
        });
    }

    /**
     * Display errors with dimension labels
     * @protected
     */
    _displayErrors(modal, errors) {
        const errorHtml = errors.map(e => {
            const label = e.index >= 0 ? `Dimension ${e.index}` : 'Global';
            return `<div style="color: #f44336; margin: 4px 0;">
                <strong>${label}:</strong> ${e.error}
            </div>`;
        }).join('');

        modal.showError(errorHtml);
    }
}
