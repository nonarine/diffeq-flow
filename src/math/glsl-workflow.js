/**
 * GLSL Generation Workflow Base Class
 *
 * Defines the architectural pattern for all GLSL generation workflows.
 * Enforces: validate → generate → apply → close/error
 *
 * Subclasses implement specific logic for different contexts:
 * - FieldEquationWorkflow - Vector field equations
 * - ColorExpressionWorkflow - Custom color expressions (future)
 * - CustomMapperWorkflow - Custom 2D mappers (future)
 * - etc.
 */

import { logger } from '../utils/debug-logger.js';

/**
 * Result of workflow execution
 * @typedef {Object} WorkflowResult
 * @property {boolean} success - True if workflow completed successfully
 * @property {string[]} glslArray - Generated GLSL code (only if success=true)
 * @property {Array<{index: number, error: string}>} errors - Errors by index (only if success=false)
 */

/**
 * Base class for GLSL generation workflows
 *
 * Subclasses must implement:
 * - getGenerationContext(index, totalCount) - Returns context object for generator
 * - applyToRenderer(glslArray, renderer) - Applies generated GLSL to renderer
 */
export class GLSLWorkflow {
    /**
     * @param {IGLSLGenerator} generator - Generator instance
     */
    constructor(generator) {
        if (!generator) {
            throw new Error('GLSLWorkflow requires a generator instance');
        }
        this.generator = generator;
    }

    /**
     * Get context for generator at specific index
     * Subclasses must implement this
     *
     * @param {number} index - Expression index
     * @param {number} totalCount - Total number of expressions
     * @returns {Object} Context object passed to generator
     */
    getGenerationContext(index, totalCount) {
        throw new Error('GLSLWorkflow subclass must implement getGenerationContext()');
    }

    /**
     * Apply generated GLSL to renderer
     * Subclasses must implement this
     *
     * @param {string[]} glslArray - Generated GLSL code
     * @param {Renderer} renderer - Renderer instance
     * @param {string[]} expressions - Original math expressions (for context)
     * @throws {Error} If application fails
     */
    applyToRenderer(glslArray, renderer, expressions) {
        throw new Error('GLSLWorkflow subclass must implement applyToRenderer()');
    }

    /**
     * Execute interactive workflow (from UI controls)
     *
     * Steps (enforced order):
     * 1. Collect expressions from controls
     * 2. Validate ALL expressions
     * 3. Generate ALL GLSL (only if validation passes)
     * 4. Apply to renderer (atomic)
     * 5. Close modal on success, show errors on failure
     *
     * @param {Array<MathToGLSLControl>} controls - Array of UI controls
     * @param {Notebook} notebook - Notebook instance
     * @param {Renderer} renderer - Renderer instance
     * @param {NotebookModal} modal - Modal instance
     * @returns {Promise<WorkflowResult>}
     */
    async executeInteractive(controls, notebook, renderer, modal) {
        const totalCount = controls.length;
        const errors = [];

        // Step 1: Collect expressions from controls
        const expressions = controls.map(ctrl => ctrl.getMath());

        // Step 2: Validate ALL expressions first
        for (let i = 0; i < expressions.length; i++) {
            const context = this.getGenerationContext(i, totalCount);
            const validation = this.generator.validate(expressions[i], context);

            if (!validation.valid) {
                errors.push({
                    index: i,
                    error: validation.error
                });
            }
        }

        // If validation failed, show errors and keep modal open
        if (errors.length > 0) {
            this._displayErrors(modal, errors);
            return { success: false, errors };
        }

        // Step 3: Generate ALL GLSL
        const glslArray = [];
        for (let i = 0; i < expressions.length; i++) {
            try {
                const context = this.getGenerationContext(i, totalCount);
                const glsl = this.generator.generate(expressions[i], notebook, context);
                glslArray.push(glsl);
            } catch (error) {
                errors.push({
                    index: i,
                    error: error.message
                });
            }
        }

        // If generation failed, show errors and keep modal open
        if (errors.length > 0) {
            this._displayErrors(modal, errors);
            return { success: false, errors };
        }

        // Step 4: Apply to renderer (atomic - all or nothing)
        try {
            this.applyToRenderer(glslArray, renderer, expressions);
            logger.info(`Applied ${glslArray.length} expressions to renderer`);
        } catch (error) {
            this._displayErrors(modal, [{
                index: -1, // Global error
                error: `Failed to apply to renderer: ${error.message}`
            }]);
            return { success: false, errors: [{ index: -1, error: error.message }] };
        }

        // Step 5: Close modal on success
        modal.hide();
        return { success: true, glslArray, expressions };
    }

    /**
     * Execute automated workflow (from presets/programmatic)
     *
     * Steps (enforced order):
     * 1. Validate ALL expressions
     * 2. Generate ALL GLSL
     * 3. Apply to renderer (atomic)
     *
     * @param {string[]} expressions - Array of math expressions
     * @param {Notebook} notebook - Notebook instance
     * @param {Renderer} renderer - Renderer instance
     * @returns {WorkflowResult}
     * @throws {Error} If workflow fails (automated = fail fast)
     */
    executeAutomated(expressions, notebook, renderer) {
        const totalCount = expressions.length;
        const errors = [];

        // Step 1: Validate ALL expressions first
        for (let i = 0; i < expressions.length; i++) {
            const context = this.getGenerationContext(i, totalCount);
            const validation = this.generator.validate(expressions[i], context);

            if (!validation.valid) {
                errors.push({
                    index: i,
                    error: validation.error
                });
            }
        }

        if (errors.length > 0) {
            const errorMsg = errors.map(e => `Index ${e.index}: ${e.error}`).join('; ');
            throw new Error(`Validation failed: ${errorMsg}`);
        }

        // Step 2: Generate ALL GLSL
        const glslArray = [];
        for (let i = 0; i < expressions.length; i++) {
            try {
                const context = this.getGenerationContext(i, totalCount);
                const glsl = this.generator.generate(expressions[i], notebook, context);
                glslArray.push(glsl);
            } catch (error) {
                throw new Error(`Failed to generate GLSL at index ${i}: ${error.message}`);
            }
        }

        // Step 3: Apply to renderer (atomic)
        try {
            this.applyToRenderer(glslArray, renderer, expressions);
            logger.info(`Applied ${glslArray.length} expressions to renderer (automated)`);
        } catch (error) {
            throw new Error(`Failed to apply to renderer: ${error.message}`);
        }

        return { success: true, glslArray, expressions };
    }

    /**
     * Display errors in modal
     * Can be overridden by subclasses for custom error formatting
     *
     * @protected
     */
    _displayErrors(modal, errors) {
        const errorHtml = errors.map(e => {
            const label = e.index >= 0 ? `Index ${e.index}` : 'Global';
            return `<div style="color: #f44336; margin: 4px 0;">
                <strong>${label}:</strong> ${e.error}
            </div>`;
        }).join('');

        modal.showError(errorHtml);
    }
}
