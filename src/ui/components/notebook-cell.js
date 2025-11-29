/**
 * NotebookCell - Individual notebook cell component
 *
 * Compact single-line layout:
 * [input text........][→][...][↑][↓][✕][+]
 * Output displayed below, right-aligned
 */

import { logger } from '../../utils/debug-logger.js';
import { renderTeXScaled } from '../../utils/math-renderer.js';

export class NotebookCell {
    constructor(cellData, callbacks = {}) {
        this.cellData = cellData;
        this.callbacks = callbacks;

        this.element = null;
        this.inputField = null;
        this.outputDiv = null;
        this.errorDiv = null;

        this._createUI();
    }

    /**
     * Create the cell UI
     * @private
     */
    _createUI() {
        this.element = document.createElement('div');
        this.element.className = 'notebook-cell';
        this.element.dataset.cellId = this.cellData.id;
        this.element.style.cssText = `
            margin: 8px 0;
            display: flex;
            flex-direction: column;
            gap: 4px;
        `;

        // Input row: [input][→][spacer][↑][↓][✕]
        const inputRow = document.createElement('div');
        inputRow.style.cssText = `
            display: flex;
            align-items: center;
            gap: 6px;
        `;

        // Input field
        this.inputField = document.createElement('input');
        this.inputField.type = 'text';
        this.inputField.value = this.cellData.input || '';
        this.inputField.placeholder = 'Enter expression or function definition (e.g., f(x) = sin(x))';
        this.inputField.style.cssText = `
            flex: 1;
            font-family: 'Courier New', monospace;
            font-size: 13px;
            background: #0a0a0a;
            color: #4CAF50;
            border: 1px solid #333;
            border-radius: 4px;
            padding: 6px 8px;
        `;

        // On input change
        this.inputField.addEventListener('input', () => {
            if (this.callbacks.onInputChange) {
                this.callbacks.onInputChange(this.cellData.id, this.inputField.value);
            }
        });

        // On Enter key, evaluate
        this.inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this._evaluate();
            }
        });

        // Evaluate button (→)
        const evalButton = this._createIconButton('→', 'Evaluate (Enter)', () => this._evaluate());
        evalButton.style.color = '#4CAF50';
        evalButton.style.fontSize = '18px';

        // Spacer
        const spacer = document.createElement('div');
        spacer.style.flex = '0 0 8px';

        // Control buttons
        const upButton = this._createIconButton('↑', 'Move up', () => {
            if (this.callbacks.onMoveUp) this.callbacks.onMoveUp(this.cellData.id);
        });

        const downButton = this._createIconButton('↓', 'Move down', () => {
            if (this.callbacks.onMoveDown) this.callbacks.onMoveDown(this.cellData.id);
        });

        const deleteButton = this._createIconButton('✕', 'Delete cell', () => {
            if (this.callbacks.onDelete) this.callbacks.onDelete(this.cellData.id);
        });
        deleteButton.style.color = '#f44336';

        const addButton = this._createIconButton('+', 'Insert cell below', () => {
            if (this.callbacks.onInsertBelow) this.callbacks.onInsertBelow(this.cellData.id);
        });
        addButton.style.color = '#4CAF50';

        // Assemble input row
        inputRow.appendChild(this.inputField);
        inputRow.appendChild(evalButton);
        inputRow.appendChild(spacer);
        inputRow.appendChild(upButton);
        inputRow.appendChild(downButton);
        inputRow.appendChild(deleteButton);
        inputRow.appendChild(addButton);

        // Output area (right-aligned, no border)
        this.outputDiv = document.createElement('div');
        this.outputDiv.className = 'notebook-cell-output';
        this.outputDiv.style.cssText = `
            display: none;
            text-align: right;
            color: #e0e0e0;
            font-size: 14px;
            padding: 0;
            margin: 2px 0 0 0;
            line-height: 1;
            width: 100%;
            overflow: hidden;
            box-sizing: border-box;
        `;

        // Error area
        this.errorDiv = document.createElement('div');
        this.errorDiv.className = 'notebook-cell-error';
        this.errorDiv.style.cssText = `
            display: none;
            padding: 6px 8px;
            background: rgba(244, 67, 54, 0.1);
            border: 1px solid #f44336;
            border-radius: 4px;
            color: #f44336;
            font-size: 11px;
        `;

        // Assemble
        this.element.appendChild(inputRow);
        this.element.appendChild(this.outputDiv);
        this.element.appendChild(this.errorDiv);

        // Render initial output if present
        if (this.cellData.output || this.cellData.error) {
            this.updateOutput(this.cellData);
        }
    }

    /**
     * Create an icon button
     * @private
     */
    _createIconButton(icon, title, onClick) {
        const button = document.createElement('button');
        button.textContent = icon;
        button.title = title;
        button.style.cssText = `
            width: 28px;
            height: 28px;
            padding: 0;
            background: rgba(76, 175, 80, 0.1);
            border: 1px solid #444;
            border-radius: 4px;
            color: #4CAF50;
            font-size: 14px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            transition: all 0.15s;
        `;

        button.addEventListener('click', onClick);

        button.addEventListener('mouseenter', () => {
            button.style.background = 'rgba(76, 175, 80, 0.2)';
            button.style.borderColor = '#4CAF50';
        });

        button.addEventListener('mouseleave', () => {
            button.style.background = 'rgba(76, 175, 80, 0.1)';
            button.style.borderColor = '#444';
        });

        return button;
    }

    /**
     * Evaluate the cell
     * @private
     */
    _evaluate() {
        if (this.callbacks.onEvaluate) {
            this.callbacks.onEvaluate(this.cellData.id);
        }
    }

    /**
     * Update cell output after evaluation
     */
    async updateOutput(result) {
        // Update internal data
        this.cellData.output = result.output;
        this.cellData.tex = result.tex;
        this.cellData.error = result.error;

        // Clear previous output/error
        this.outputDiv.style.display = 'none';
        this.errorDiv.style.display = 'none';

        if (result.error) {
            // Show error
            this.errorDiv.textContent = result.error;
            this.errorDiv.style.display = 'block';
        } else if (result.tex || result.output) {
            // Show output
            this.outputDiv.style.display = 'block';

            if (result.tex) {
                // Render with MathJax if TeX available, with auto-scaling
                try {
                    // Use the full notebook-cell width
                    const cellWidth = this.element.clientWidth;
                    logger.info(`Cell width: ${cellWidth}px, using for TeX scaling`);
                    await renderTeXScaled(this.outputDiv, result.tex, cellWidth);
                } catch (error) {
                    logger.warn('Failed to render TeX, falling back to plain text:', error);
                    this.outputDiv.textContent = result.output || result.tex;
                }
            } else {
                // Plain text output
                this.outputDiv.textContent = result.output;
            }
        }
    }

    getElement() {
        return this.element;
    }

    getInput() {
        return this.inputField.value;
    }

    setInput(value) {
        this.inputField.value = value;
    }

    getId() {
        return this.cellData.id;
    }

    focus() {
        if (this.inputField) {
            this.inputField.focus();
        }
    }

    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.element = null;
        this.inputField = null;
        this.outputDiv = null;
        this.errorDiv = null;
    }
}
