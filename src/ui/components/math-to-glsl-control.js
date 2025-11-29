/**
 * MathToGLSLControl - Reusable control for converting math expressions to GLSL
 *
 * Displays two text areas side by side:
 * - Left: Math expression input (uses notebook context)
 * - Right: Generated GLSL code (editable)
 * - Middle: Generate button
 *
 * Default behavior: wraps expression in a GLSL function
 * Custom behavior: pass onGenerate hook for advanced logic
 */

import { logger } from '../../utils/debug-logger.js';

export class MathToGLSLControl {
    /**
     * @param {Object} config - Configuration
     * @param {IGLSLGenerator} config.generator - GLSL generator instance (REQUIRED if no custom onGenerate)
     * @param {Function} config.onGenerate - Custom generator: (mathExpr, notebook, context) => glslCode
     * @param {Object} config.context - Additional context passed to generator
     * @param {string} config.mathPlaceholder - Placeholder for math input
     * @param {string} config.glslPlaceholder - Placeholder for GLSL output
     * @param {string} config.initialMath - Initial math expression
     * @param {string} config.initialGLSL - Initial GLSL code
     * @param {boolean} config.readonly - Make both fields readonly
     */
    constructor(config = {}) {
        this.config = {
            generator: config.generator || null,
            onGenerate: config.onGenerate || null,
            context: config.context || {},
            mathPlaceholder: config.mathPlaceholder || (config.generator ? config.generator.getMathPlaceholder() : 'Enter math expression...'),
            glslPlaceholder: config.glslPlaceholder || (config.generator ? config.generator.getGLSLPlaceholder() : 'Generated GLSL code...'),
            initialMath: config.initialMath || '',
            initialGLSL: config.initialGLSL || '',
            readonly: config.readonly || false
        };

        // Validate: must have either generator or onGenerate
        if (!this.config.generator && !this.config.onGenerate) {
            throw new Error('MathToGLSLControl requires either generator or onGenerate');
        }

        this.element = null;
        this.mathInput = null;
        this.glslOutput = null;
        this.generateButton = null;
        this.errorDiv = null;

        this._createUI();
    }

    /**
     * Create the UI elements
     * @private
     */
    _createUI() {
        this.element = document.createElement('div');
        this.element.className = 'math-to-glsl-control';
        this.element.style.cssText = `
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            gap: 12px;
            align-items: start;
            margin: 12px 0;
        `;

        // Math input (left)
        const mathContainer = document.createElement('div');
        mathContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

        const mathLabel = document.createElement('label');
        mathLabel.textContent = 'Math Expression';
        mathLabel.style.cssText = 'font-size: 12px; color: #4CAF50; font-weight: bold;';

        this.mathInput = document.createElement('textarea');
        this.mathInput.placeholder = this.config.mathPlaceholder;
        this.mathInput.value = this.config.initialMath;
        this.mathInput.rows = 6;
        this.mathInput.readOnly = this.config.readonly;
        this.mathInput.style.cssText = `
            font-family: 'Courier New', monospace;
            font-size: 12px;
            background: #1a1a1a;
            color: #4CAF50;
            border: 1px solid #444;
            border-radius: 4px;
            padding: 8px;
            resize: vertical;
            width: 100%;
            box-sizing: border-box;
        `;

        mathContainer.appendChild(mathLabel);
        mathContainer.appendChild(this.mathInput);

        // Generate button (middle)
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; align-items: center; padding-top: 20px;';

        this.generateButton = document.createElement('button');
        this.generateButton.textContent = '→';
        this.generateButton.title = 'Generate GLSL';
        this.generateButton.disabled = this.config.readonly;
        this.generateButton.style.cssText = `
            padding: 8px 16px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: ${this.config.readonly ? 'not-allowed' : 'pointer'};
            font-size: 16px;
            font-weight: bold;
            opacity: ${this.config.readonly ? '0.5' : '1'};
        `;

        if (!this.config.readonly) {
            this.generateButton.addEventListener('click', () => this.generate());
        }

        buttonContainer.appendChild(this.generateButton);

        // GLSL output (right)
        const glslContainer = document.createElement('div');
        glslContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

        const glslLabel = document.createElement('label');
        glslLabel.textContent = 'GLSL Code';
        glslLabel.style.cssText = 'font-size: 12px; color: #4CAF50; font-weight: bold;';

        this.glslOutput = document.createElement('textarea');
        this.glslOutput.placeholder = this.config.glslPlaceholder;
        this.glslOutput.value = this.config.initialGLSL;
        this.glslOutput.rows = 6;
        this.glslOutput.readOnly = this.config.readonly;
        this.glslOutput.style.cssText = `
            font-family: 'Courier New', monospace;
            font-size: 12px;
            background: #1a1a1a;
            color: #64B5F6;
            border: 1px solid #444;
            border-radius: 4px;
            padding: 8px;
            resize: vertical;
            width: 100%;
            box-sizing: border-box;
        `;

        glslContainer.appendChild(glslLabel);
        glslContainer.appendChild(this.glslOutput);

        // Error display
        this.errorDiv = document.createElement('div');
        this.errorDiv.style.cssText = `
            grid-column: 1 / -1;
            display: none;
            padding: 8px;
            background: rgba(244, 67, 54, 0.1);
            border: 1px solid #f44336;
            border-radius: 4px;
            color: #f44336;
            font-size: 11px;
        `;

        // Assemble
        this.element.appendChild(mathContainer);
        this.element.appendChild(buttonContainer);
        this.element.appendChild(glslContainer);
        this.element.appendChild(this.errorDiv);
    }

    /**
     * Generate GLSL from math expression
     */
    generate() {
        const mathExpr = this.mathInput.value.trim();
        this.errorDiv.style.display = 'none';

        // Validate first
        let validation;
        if (this.config.generator) {
            validation = this.config.generator.validate(mathExpr, this.config.context);
        } else {
            // Basic validation for custom onGenerate
            validation = mathExpr ? { valid: true } : { valid: false, error: 'Expression is empty' };
        }

        if (!validation.valid) {
            this._showError(validation.error || 'Invalid expression');
            return;
        }

        try {
            let glslCode;

            if (this.config.onGenerate) {
                // Custom generation logic
                glslCode = this.config.onGenerate(mathExpr, window.notebook, this.config.context);
            } else if (this.config.generator) {
                // Use generator interface
                glslCode = this.config.generator.generate(mathExpr, window.notebook, this.config.context);
            }

            this.glslOutput.value = glslCode;
            logger.info('Generated GLSL from math expression');
        } catch (error) {
            this._showError(error.message);
            logger.error('Failed to generate GLSL:', error);
        }
    }

    /**
     * Show error message
     * @private
     */
    _showError(message) {
        this.errorDiv.textContent = `Error: ${message}`;
        this.errorDiv.style.display = 'block';
    }

    /**
     * Get the DOM element
     * @returns {HTMLElement}
     */
    getElement() {
        return this.element;
    }

    /**
     * Get current math expression
     * @returns {string}
     */
    getMath() {
        return this.mathInput.value.trim();
    }

    /**
     * Get current GLSL code
     * @returns {string}
     */
    getGLSL() {
        return this.glslOutput.value.trim();
    }

    /**
     * Set math expression
     * @param {string} math
     */
    setMath(math) {
        this.mathInput.value = math;
    }

    /**
     * Set GLSL code
     * @param {string} glsl
     */
    setGLSL(glsl) {
        this.glslOutput.value = glsl;
    }

    /**
     * Get both values
     * @returns {{math: string, glsl: string}}
     */
    getValues() {
        return {
            math: this.getMath(),
            glsl: this.getGLSL()
        };
    }
}
