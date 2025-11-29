/**
 * Field Equations Editor Modal
 *
 * Modal for editing vector field equations with:
 * - Dimension count selector
 * - N × MathToGLSLControl (one per dimension)
 * - Notebook REPL for function definitions
 * - Workflow-based validation and application
 */

import { NotebookModal } from './notebook-modal.js';
import { MathToGLSLControl } from './math-to-glsl-control.js';
import { FieldEquationGenerator } from '../../math/field-equation-generator.js';
import { FieldEquationWorkflow } from '../../math/field-equation-workflow.js';
import { logger } from '../../utils/debug-logger.js';

export class FieldEquationsEditor {
    /**
     * @param {Renderer} renderer - Renderer instance
     */
    constructor(renderer) {
        this.renderer = renderer;
        this.modal = null;
        this.controls = [];
        this.controlsContainer = null;
        this.dimensionSelector = null;

        // Create generator and workflow
        this.generator = new FieldEquationGenerator();
        this.workflow = new FieldEquationWorkflow(this.generator);

        this._createModal();
    }

    /**
     * Create the modal
     * @private
     */
    _createModal() {
        // Create custom content container
        const customContent = document.createElement('div');
        customContent.className = 'field-equations-editor-content';

        // Dimension selector
        const dimensionRow = document.createElement('div');
        dimensionRow.className = 'field-equations-dimension-row';

        const dimensionLabel = document.createElement('label');
        dimensionLabel.textContent = 'Number of Dimensions:';
        dimensionLabel.style.cssText = 'font-size: 14px; color: #4CAF50; font-weight: bold;';

        this.dimensionSelector = document.createElement('select');
        this.dimensionSelector.className = 'field-equations-dimension-select';
        for (let i = 2; i <= 6; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `${i}D`;
            this.dimensionSelector.appendChild(option);
        }

        // Handle dimension changes
        this.dimensionSelector.addEventListener('change', () => {
            this._updateControls(parseInt(this.dimensionSelector.value));
        });

        dimensionRow.appendChild(dimensionLabel);
        dimensionRow.appendChild(this.dimensionSelector);

        // Controls container
        this.controlsContainer = document.createElement('div');
        this.controlsContainer.className = 'field-equations-controls';

        customContent.appendChild(dimensionRow);
        customContent.appendChild(this.controlsContainer);

        // Create modal with workflow-based onApply
        this.modal = new NotebookModal({
            title: 'Field Equations Editor',
            customContent: customContent,
            applyButtonText: 'Apply to Renderer',
            onApply: async (notebook, customFields) => {
                // Use workflow to validate, generate, and apply
                const result = await this.workflow.executeInteractive(
                    this.controls,
                    notebook,
                    this.renderer,
                    this.modal
                );

                // If successful, sync simple UI controls with the original expressions from this editor
                if (result.success) {
                    // Sync dimensions
                    const dimensionsElement = document.getElementById('dimensions');
                    if (dimensionsElement && dimensionsElement.setValue) {
                        dimensionsElement.setValue(this.controls.length);
                    }

                    // Sync expression inputs with ORIGINAL expressions (not expanded)
                    const expressionsControl = window.manager?.get('dimension-inputs');
                    if (expressionsControl && result.expressions) {
                        expressionsControl.setValue(result.expressions);
                    }

                    // Sync equation overlay if visible
                    if (window.equationOverlay && window.equationOverlay.isVisible && window.equationOverlay.isVisible()) {
                        const variables = this.renderer.coordinateSystem.getVariableNames();
                        // Use renderer.expressions (already expanded) for overlay
                        window.equationOverlay.updateEquations(this.renderer.expressions, variables);
                    }
                }

                // Workflow handles modal close and error display
                return result;
            }
        });

        // Initialize with default 2D (will be updated when modal is shown)
        this._updateControls(2);
    }

    /**
     * Update controls for new dimension count
     * @private
     * @param {number} dimensions - Number of dimensions
     * @param {string[]} expressions - Optional expressions to use (if not provided, reads from renderer)
     */
    _updateControls(dimensions, expressions = null) {
        // Clear existing controls
        this.controlsContainer.innerHTML = '';
        this.controls = [];

        // Get current expressions from renderer (only if not provided)
        const currentExpressions = expressions || this.renderer.expressions || [];

        // Create controls for each dimension
        const varNames = ['x', 'y', 'z', 'w', 'u', 'v'];
        for (let i = 0; i < dimensions; i++) {
            const varName = varNames[i] || `x${i}`;
            const initialMath = currentExpressions[i] || '';

            // Create control
            const control = new MathToGLSLControl({
                generator: this.generator,
                context: {
                    dimension: i,
                    totalDims: dimensions
                },
                mathPlaceholder: `d${varName}/dt = ...`,
                glslPlaceholder: 'Generated GLSL...',
                initialMath: initialMath,
                initialGLSL: ''
            });

            // Create dimension label
            const dimensionLabel = document.createElement('div');
            dimensionLabel.className = 'field-equation-label';
            dimensionLabel.textContent = `Dimension ${i}: d${varName}/dt`;

            // Add to container
            this.controlsContainer.appendChild(dimensionLabel);
            this.controlsContainer.appendChild(control.getElement());

            this.controls.push(control);
        }

        logger.info(`Created ${dimensions} field equation controls`);
    }

    /**
     * Show the editor modal
     */
    show() {
        // Get current dimensions
        const currentDims = this.renderer.dimensions || 2;
        this.dimensionSelector.value = currentDims;

        // Get expressions from simple UI (not renderer, which has expanded form)
        // The simple UI is the source of truth for user's original expressions
        let currentExpressions = null;
        if (window.manager) {
            const expressionsControl = window.manager.get('dimension-inputs');
            if (expressionsControl) {
                currentExpressions = expressionsControl.getValue();
            }
        }

        // If we couldn't get from simple UI, fall back to renderer (expanded form)
        if (!currentExpressions) {
            currentExpressions = this.renderer.expressions;
        }

        this._updateControls(currentDims, currentExpressions);

        this.modal.show();
    }

    /**
     * Hide the editor modal
     */
    hide() {
        this.modal.hide();
    }

    /**
     * Check if modal is open
     * @returns {boolean}
     */
    isOpen() {
        return this.modal.isOpen();
    }

    /**
     * Destroy the modal
     */
    destroy() {
        if (this.modal) {
            this.modal.destroy();
        }
        this.controls = [];
    }
}
