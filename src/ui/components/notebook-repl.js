/**
 * NotebookREPL - Manages notebook cells and provides REPL interface
 *
 * Features:
 * - Add/delete/reorder cells
 * - Evaluate individual cells or all cells
 * - Export/import notebook as JSON
 * - Syncs with global window.notebook instance
 */

import { logger } from '../../utils/debug-logger.js';
import { NotebookCell } from './notebook-cell.js';

export class NotebookREPL {
    /**
     * @param {Object} options - Configuration options
     * @param {Notebook} options.notebook - Notebook instance to use (defaults to window.notebook)
     * @param {boolean} options.showExport - Show export/import buttons (default: true)
     */
    constructor(options = {}) {
        this.notebook = options.notebook || window.notebook;
        this.showExport = options.showExport !== false;

        if (!this.notebook) {
            throw new Error('No notebook instance provided');
        }

        this.element = null;
        this.cellsContainer = null;
        this.cellComponents = new Map(); // cellId → NotebookCell component

        this._createUI();
        this._renderCells();
    }

    /**
     * Create the REPL UI
     * @private
     */
    _createUI() {
        this.element = document.createElement('div');
        this.element.className = 'notebook-repl';
        this.element.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 8px;
        `;

        // Cells container
        this.cellsContainer = document.createElement('div');
        this.cellsContainer.className = 'notebook-cells';
        this.cellsContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 8px;
            min-height: 50px;
        `;

        // Assemble
        this.element.appendChild(this.cellsContainer);
    }

    /**
     * Render all cells from notebook
     * @private
     */
    _renderCells() {
        // Clear existing cell components
        this.cellComponents.forEach(comp => comp.destroy());
        this.cellComponents.clear();
        this.cellsContainer.innerHTML = '';

        // Render cells from notebook
        const cells = this.notebook.cells || [];

        // Auto-create blank cell if empty
        if (cells.length === 0) {
            this.addCell();
            return;
        }

        cells.forEach((cellData) => {
            this._renderCell(cellData);
        });
    }

    /**
     * Render a single cell
     * @private
     */
    _renderCell(cellData) {
        const cell = new NotebookCell(cellData, {
            onEvaluate: (id) => this.evaluateCell(id),
            onMoveUp: (id) => this.moveCellUp(id),
            onMoveDown: (id) => this.moveCellDown(id),
            onDelete: (id) => this.deleteCell(id),
            onInsertBelow: (id) => this.insertCellBelow(id),
            onInputChange: (id, value) => this.updateCellInput(id, value)
        });

        this.cellComponents.set(cellData.id, cell);
        this.cellsContainer.appendChild(cell.getElement());
    }

    /**
     * Add a new code cell at the end
     * @returns {string} - Cell ID
     */
    addCell() {
        const cellId = this.notebook.addCell('code', '');
        logger.info('Added new cell:', cellId);

        // Render just the new cell (don't re-render everything)
        const cellData = this.notebook.cells.find(c => c.id === cellId);
        if (cellData) {
            this._renderCell(cellData);
        }

        return cellId;
    }

    /**
     * Insert a new cell below the specified cell
     * @param {string} afterCellId - Cell ID to insert after
     * @returns {string} - New cell ID
     */
    insertCellBelow(afterCellId) {
        // Find the index of the cell to insert after
        const cells = this.notebook.cells || [];
        const afterIndex = cells.findIndex(c => c.id === afterCellId);

        if (afterIndex === -1) {
            logger.warn('Cell not found:', afterCellId);
            return this.addCell();
        }

        // Add new cell at the end
        const newCellId = this.notebook.addCell('code', '');

        // Move it to the correct position (after the specified cell)
        const newIndex = cells.findIndex(c => c.id === newCellId);
        if (newIndex !== -1) {
            // Move new cell from end to after the target cell
            const targetPosition = afterIndex + 1;
            for (let i = newIndex; i > targetPosition; i--) {
                this.notebook.moveCellUp(newCellId);
            }
        }

        logger.info('Inserted new cell below:', afterCellId);

        // Re-render all cells to show correct order
        this._renderCells();

        // Focus the new cell
        setTimeout(() => {
            const newCellComponent = this.cellComponents.get(newCellId);
            if (newCellComponent) {
                newCellComponent.focus();
            }
        }, 50);

        return newCellId;
    }

    /**
     * Delete a cell
     * @param {string} cellId - Cell ID
     */
    deleteCell(cellId) {
        this.notebook.deleteCell(cellId);
        logger.info('Deleted cell:', cellId);

        // Re-render
        this._renderCells();
    }

    /**
     * Move cell up
     * @param {string} cellId - Cell ID
     */
    moveCellUp(cellId) {
        this.notebook.moveCellUp(cellId);
        logger.verbose('Moved cell up:', cellId);

        // Re-render
        this._renderCells();
    }

    /**
     * Move cell down
     * @param {string} cellId - Cell ID
     */
    moveCellDown(cellId) {
        this.notebook.moveCellDown(cellId);
        logger.verbose('Moved cell down:', cellId);

        // Re-render
        this._renderCells();
    }

    /**
     * Update cell input (on typing)
     * @param {string} cellId - Cell ID
     * @param {string} value - New input value
     */
    updateCellInput(cellId, value) {
        this.notebook.updateCell(cellId, value);
        logger.verbose('Updated cell input:', cellId);
    }

    /**
     * Evaluate a single cell
     * @param {string} cellId - Cell ID
     * @returns {Promise<void>}
     */
    async evaluateCell(cellId) {
        logger.info('Evaluating cell:', cellId);

        // Check if this is the last cell
        const cells = this.notebook.cells || [];
        const cellIndex = cells.findIndex(c => c.id === cellId);
        const isLastCell = cellIndex === cells.length - 1;

        try {
            const result = await this.notebook.evaluateCell(cellId);

            // Update cell UI with result
            const cellComponent = this.cellComponents.get(cellId);
            if (cellComponent) {
                await cellComponent.updateOutput(result);
            }

            logger.info('Cell evaluated successfully:', cellId);

            // If this was the last cell, create a new one and focus it
            if (isLastCell) {
                const newCellId = this.addCell();
                // Wait for re-render to complete
                setTimeout(() => {
                    const newCellComponent = this.cellComponents.get(newCellId);
                    if (newCellComponent) {
                        newCellComponent.focus();
                    }
                }, 50);
            }
        } catch (error) {
            logger.error('Error evaluating cell:', error);

            // Show error in cell
            const cellComponent = this.cellComponents.get(cellId);
            if (cellComponent) {
                await cellComponent.updateOutput({
                    output: null,
                    tex: null,
                    error: error.message
                });
            }
        }
    }

    /**
     * Evaluate all cells in sequence
     * @returns {Promise<void>}
     */
    async evaluateAll() {
        logger.info('Evaluating all cells');

        try {
            await this.notebook.evaluateAll();

            // Update all cell UIs with results
            for (const [cellId, cellComponent] of this.cellComponents.entries()) {
                const cellData = this.notebook.cells.find(c => c.id === cellId);
                if (cellData) {
                    await cellComponent.updateOutput(cellData);
                }
            }

            logger.info('All cells evaluated successfully');
        } catch (error) {
            logger.error('Error evaluating all cells:', error);
        }
    }

    /**
     * Export notebook as JSON file
     */
    exportNotebook() {
        try {
            this.notebook.exportJSON('notebook.json');
            logger.info('Exported notebook');
        } catch (error) {
            logger.error('Failed to export notebook:', error);
            alert(`Export failed: ${error.message}`);
        }
    }

    /**
     * Import notebook from JSON file
     */
    importNotebook() {
        // Create file input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                await this.notebook.importJSON(file);
                logger.info('Imported notebook');

                // Re-render with new cells
                this._renderCells();
            } catch (error) {
                logger.error('Failed to import notebook:', error);
                alert(`Import failed: ${error.message}`);
            }
        });

        input.click();
    }

    /**
     * Refresh the REPL (re-render all cells)
     */
    refresh() {
        this._renderCells();
    }

    /**
     * Clean up empty cells (cells with no input)
     */
    cleanupEmptyCells() {
        const cells = this.notebook.cells || [];
        const emptyCells = cells.filter(cell => !cell.input || !cell.input.trim());

        if (emptyCells.length > 0) {
            logger.info(`Cleaning up ${emptyCells.length} empty cells`);
            emptyCells.forEach(cell => {
                this.notebook.deleteCell(cell.id);
            });

            // Re-render to reflect changes
            this._renderCells();
        }
    }

    /**
     * Get the DOM element
     * @returns {HTMLElement}
     */
    getElement() {
        return this.element;
    }

    /**
     * Destroy the REPL and clean up
     */
    destroy() {
        this.cellComponents.forEach(comp => comp.destroy());
        this.cellComponents.clear();

        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }

        this.element = null;
        this.cellsContainer = null;
    }
}
