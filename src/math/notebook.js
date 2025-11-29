/**
 * Notebook - Primary interface for symbolic mathematics
 *
 * The Notebook manages:
 * 1. User-defined cells (code and markdown)
 * 2. Context management (ensuring definitions are available in CAS)
 * 3. Delegation to CAS engine for actual computation
 *
 * ARCHITECTURAL PRINCIPLE:
 * - Notebook is the HIGH-LEVEL interface - main program calls Notebook methods
 * - CAS Engine is the LOW-LEVEL backend - only Notebook calls it directly
 * - This ensures context is always applied before symbolic operations
 */

import { logger } from '../utils/debug-logger.js';

const LOCALSTORAGE_KEY = 'de-render-notebook';

/**
 * Generate unique cell ID
 */
function generateCellId() {
    return `cell-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Notebook class - manages cells and provides context-aware CAS operations
 */
export class Notebook {
    /**
     * @param {import('./cas/cas-interface.js').CASEngine} casEngine - CAS engine to use
     */
    constructor(casEngine) {
        this.casEngine = casEngine;
        this.cells = [];
        this.contextDirty = false; // True if context needs to be reapplied to CAS

        logger.info('Notebook initialized with CAS engine:', casEngine.getName());
    }

    // ===== Cell Management =====

    /**
     * Add a new cell to the notebook
     * @param {'code'|'markdown'} type - Cell type
     * @param {string} input - Initial cell content
     * @returns {string} - Cell ID
     */
    addCell(type, input = '') {
        const id = generateCellId();
        const cell = {
            id,
            type,
            input,
            output: null,    // Evaluation result (for code cells)
            tex: null,       // TeX representation (for code cells)
            error: null      // Error message if evaluation failed
        };

        this.cells.push(cell);
        this.save();
        logger.info(`Added ${type} cell:`, id);

        return id;
    }

    /**
     * Update cell content
     * @param {string} id - Cell ID
     * @param {string} input - New cell content
     */
    updateCell(id, input) {
        const cell = this.cells.find(c => c.id === id);
        if (!cell) {
            logger.warn(`Cell not found: ${id}`);
            return;
        }

        cell.input = input;
        // Clear output - cell needs re-evaluation
        cell.output = null;
        cell.tex = null;
        cell.error = null;

        this.save();
        this.markContextDirty(); // Context changed, need to reapply
    }

    /**
     * Delete a cell
     * @param {string} id - Cell ID
     */
    deleteCell(id) {
        const index = this.cells.findIndex(c => c.id === id);
        if (index === -1) {
            logger.warn(`Cell not found: ${id}`);
            return;
        }

        this.cells.splice(index, 1);
        this.save();
        this.markContextDirty();
        logger.info(`Deleted cell: ${id}`);
    }

    /**
     * Move cell up in order
     * @param {string} id - Cell ID
     */
    moveCellUp(id) {
        const index = this.cells.findIndex(c => c.id === id);
        if (index <= 0) return; // Already at top or not found

        [this.cells[index - 1], this.cells[index]] = [this.cells[index], this.cells[index - 1]];
        this.save();
        this.markContextDirty(); // Order matters for definitions
    }

    /**
     * Move cell down in order
     * @param {string} id - Cell ID
     */
    moveCellDown(id) {
        const index = this.cells.findIndex(c => c.id === id);
        if (index === -1 || index >= this.cells.length - 1) return; // At bottom or not found

        [this.cells[index], this.cells[index + 1]] = [this.cells[index + 1], this.cells[index]];
        this.save();
        this.markContextDirty();
    }

    // ===== Cell Evaluation =====

    /**
     * Evaluate a single cell
     * @param {string} id - Cell ID
     * @returns {Promise<{result: string, tex: string, error?: string}>}
     */
    async evaluateCell(id) {
        const cell = this.cells.find(c => c.id === id);
        if (!cell) {
            logger.warn(`Cell not found: ${id}`);
            return { result: '', tex: '', error: 'Cell not found' };
        }

        if (cell.type !== 'code') {
            return { result: '', tex: '', error: 'Not a code cell' };
        }

        try {
            // Ensure all previous cells are evaluated first (for dependencies)
            await this.evaluateUpTo(id);

            // Evaluate this cell using notebook's evaluate() method
            // (not casEngine directly - notebook.evaluate handles function definitions)
            logger.verbose(`Evaluating cell ${id}: "${cell.input}"`);
            const result = this.evaluate(cell.input);  // <-- Changed from casEngine.evaluate to this.evaluate

            // Store result
            cell.output = result.result;
            cell.tex = result.tex;
            cell.error = result.error || null;

            this.save();
            logger.info(`Cell ${id} evaluated successfully:`, result.result);

            return result;
        } catch (error) {
            logger.error(`Error evaluating cell ${id}:`, error.message);
            cell.error = error.message;
            cell.output = null;
            cell.tex = null;
            this.save();

            return { result: '', tex: '', error: error.message };
        }
    }

    /**
     * Evaluate all cells up to (but not including) the given cell
     * Ensures dependencies are available
     * @private
     */
    async evaluateUpTo(id) {
        const targetIndex = this.cells.findIndex(c => c.id === id);
        if (targetIndex === -1) return;

        for (let i = 0; i < targetIndex; i++) {
            const cell = this.cells[i];
            if (cell.type === 'code' && !cell.output && !cell.error) {
                // Cell not yet evaluated
                await this.evaluateCell(cell.id);
            }
        }
    }

    /**
     * Evaluate all code cells in sequence
     */
    async evaluateAll() {
        logger.info('Evaluating all notebook cells');

        for (const cell of this.cells) {
            if (cell.type === 'code') {
                await this.evaluateCell(cell.id);
            }
        }

        logger.info('All cells evaluated');
    }

    // ===== Context Management =====

    /**
     * Mark context as dirty (needs reapply before next operation)
     * Called when cells are modified or CAS cache is cleared
     */
    markContextDirty() {
        this.contextDirty = true;
    }

    /**
     * Ensure notebook context is applied to CAS engine
     * Re-evaluates all successfully evaluated cells if context is dirty
     */
    ensureContext() {
        if (!this.contextDirty) {
            return; // Context already applied
        }

        logger.verbose('Re-applying notebook context to CAS engine');

        // Temporarily disable context dirty flag to avoid infinite recursion
        const wasDirty = this.contextDirty;
        this.contextDirty = false;

        // Re-evaluate all cells that previously succeeded
        for (const cell of this.cells) {
            if (cell.type === 'code' && cell.output && !cell.error) {
                try {
                    // Use notebook.evaluate() to handle function definitions properly
                    this.evaluate(cell.input);
                } catch (error) {
                    logger.warn(`Failed to re-apply cell ${cell.id}:`, error.message);
                }
            }
        }

        logger.verbose('Notebook context applied');
    }

    // ===== Function Expansion for GLSL =====

    /**
     * Expand notebook function calls in an expression using nerdamer evaluation
     * This prepares expressions for GLSL compilation by expanding user-defined functions
     *
     * Example: "sqr(x) + y" with sqr(x)=x*x defined becomes "(x)*(x) + y"
     *
     * @param {string} expr - Expression to expand
     * @returns {string} - Expression with function calls expanded
     */
    expandFunctions(expr) {
        this.ensureContext();

        try {
            // Check if there are any custom functions defined in the notebook
            const definedFunctions = [];
            for (const cell of this.cells) {
                if (cell.type === 'code' && cell.output && !cell.error) {
                    const match = cell.input.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*=\s*(.+)$/);
                    if (match) {
                        const [, funcName] = match;
                        definedFunctions.push(funcName);
                    }
                }
            }

            // Only use Nerdamer expansion if there are custom functions that appear in the expression
            let needsExpansion = false;
            for (const funcName of definedFunctions) {
                const funcRegex = new RegExp(`\\b${funcName}\\s*\\(`);
                if (funcRegex.test(expr)) {
                    needsExpansion = true;
                    break;
                }
            }

            if (!needsExpansion) {
                // No custom functions to expand - return original expression unchanged
                logger.verbose(`No custom functions in "${expr}", skipping expansion`);
                return expr;
            }

            // Let nerdamer expand the expression (it knows about our setFunction definitions)
            const result = this.casEngine.evaluate(expr);

            if (result.result && result.result !== expr) {
                // Find which functions were actually used
                const usedFunctions = definedFunctions.filter(funcName => {
                    const funcRegex = new RegExp(`\\b${funcName}\\s*\\(`);
                    return funcRegex.test(expr);
                });

                if (usedFunctions.length > 0) {
                    logger.verbose(`Expanded with: ${usedFunctions.join(', ')}`);
                }
                logger.verbose(`  "${expr}" -> "${result.result}"`);
                return result.result;
            }

            return expr;
        } catch (error) {
            logger.warn(`Failed to expand functions in "${expr}":`, error.message);
            return expr; // Return original if expansion fails
        }
    }

    // ===== CAS Operations (Primary Interface) =====
    // All symbolic operations go through these methods to ensure context

    /**
     * Differentiate expression (with notebook context)
     * @param {string} expr - Expression to differentiate
     * @param {string} variable - Variable to differentiate with respect to
     * @returns {string} - Derivative
     */
    differentiate(expr, variable) {
        this.ensureContext();
        return this.casEngine.differentiate(expr, variable);
    }

    /**
     * Solve equation (with notebook context)
     * @param {string} equation - Equation to solve
     * @param {string} variable - Variable to solve for
     * @returns {string|string[]|null} - Solution(s)
     */
    solve(equation, variable) {
        this.ensureContext();
        return this.casEngine.solve(equation, variable);
    }

    /**
     * Invert matrix (with notebook context)
     * @param {string[][]} matrix - Matrix elements
     * @returns {string[][]|null} - Inverted matrix
     */
    invertMatrix(matrix) {
        this.ensureContext();
        return this.casEngine.invertMatrix(matrix);
    }

    /**
     * Evaluate expression (with notebook context)
     * Note: This adds to the context (side effect)
     * Handles function definitions in the form: f(x, y) = expression
     * @param {string} expr - Expression to evaluate
     * @returns {{result: string, tex: string, error?: string}}
     */
    evaluate(expr) {
        this.ensureContext();

        logger.verbose(`Notebook.evaluate() called with: "${expr}"`);

        // Check if this is a function definition: f(x, y, ...) = expression
        const functionDefMatch = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*=\s*(.+)$/);

        logger.verbose(`Function definition regex match:`, functionDefMatch ? 'YES' : 'NO');

        if (functionDefMatch) {
            const [, funcName, argsStr, body] = functionDefMatch;
            const args = argsStr.split(',').map(arg => arg.trim()).filter(arg => arg);

            logger.verbose(`Parsed function: name="${funcName}", args=[${args.join(', ')}], body="${body}"`);

            // Use nerdamer.setFunction to define the function
            if (this.casEngine.getName() === 'Nerdamer' && window.nerdamer && window.nerdamer.setFunction) {
                try {
                    // nerdamer.setFunction(name, argArray, body)
                    logger.verbose(`Calling nerdamer.setFunction("${funcName}", [${args.join(', ')}], "${body}")`);
                    window.nerdamer.setFunction(funcName, args, body);

                    logger.info(`Defined function: ${funcName}(${args.join(', ')}) = ${body}`);

                    const signature = `${funcName}(${args.join(', ')})`;
                    const result = {
                        result: `${signature} = ${body}`,
                        tex: `${signature} = ${body}`
                    };
                    logger.verbose(`Returning result:`, result);
                    return result;
                } catch (error) {
                    logger.error(`Error defining function: ${error.message}`);
                    return {
                        result: '',
                        tex: '',
                        error: `Failed to define function ${funcName}: ${error.message}`
                    };
                }
            } else {
                // Fallback for engines without setFunction
                logger.warn('CAS engine does not support setFunction, function definition ignored');
                const signature = `${funcName}(${args.join(', ')})`;
                return {
                    result: `${signature} = ${body} (not supported by engine)`,
                    tex: `${signature} = ${body}`,
                    error: 'Function definitions not supported by current CAS engine'
                };
            }
        }

        // Not a function definition, evaluate normally
        logger.verbose('Not a function definition, evaluating normally');
        return this.casEngine.evaluate(expr);
    }

    /**
     * Parse expression (with notebook context)
     * @param {string} expr - Expression to parse
     * @returns {any} - Parsed expression (engine-specific)
     */
    parse(expr) {
        this.ensureContext();
        return this.casEngine.parse(expr);
    }

    // ===== Persistence =====

    /**
     * Save notebook to localStorage
     */
    save() {
        try {
            const data = this.toJSON();
            localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(data));
            logger.verbose('Notebook saved to localStorage');
        } catch (error) {
            logger.error('Failed to save notebook:', error.message);
        }
    }

    /**
     * Load notebook from localStorage
     */
    load() {
        try {
            const stored = localStorage.getItem(LOCALSTORAGE_KEY);
            if (!stored) {
                logger.info('No saved notebook found');
                return;
            }

            const data = JSON.parse(stored);
            this.fromJSON(data);
            logger.info(`Loaded notebook with ${this.cells.length} cells`);

            // Re-evaluate all cells to restore context
            this.evaluateAll();
        } catch (error) {
            logger.error('Failed to load notebook:', error.message);
        }
    }

    /**
     * Serialize notebook to JSON
     * @returns {object}
     */
    toJSON() {
        return {
            version: 1,
            cells: this.cells.map(cell => ({
                id: cell.id,
                type: cell.type,
                input: cell.input,
                output: cell.output,
                tex: cell.tex,
                error: cell.error
            }))
        };
    }

    /**
     * Deserialize notebook from JSON
     * @param {object} data
     */
    fromJSON(data) {
        if (data.version !== 1) {
            throw new Error(`Unsupported notebook version: ${data.version}`);
        }

        this.cells = data.cells || [];
        this.markContextDirty(); // Need to reapply context
    }

    /**
     * Export notebook as JSON file (download)
     * @param {string} filename - Filename for download
     */
    exportJSON(filename = 'notebook.json') {
        const data = this.toJSON();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();

        URL.revokeObjectURL(url);
        logger.info(`Exported notebook to ${filename}`);
    }

    /**
     * Import notebook from JSON file
     * @param {File} file - File object from file input
     * @returns {Promise<void>}
     */
    async importJSON(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    this.fromJSON(data);
                    this.save();
                    await this.evaluateAll();
                    logger.info('Imported notebook successfully');
                    resolve();
                } catch (error) {
                    logger.error('Failed to import notebook:', error.message);
                    reject(error);
                }
            };

            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    /**
     * Clear all cells
     */
    clear() {
        this.cells = [];
        this.save();
        this.markContextDirty();
        logger.info('Notebook cleared');
    }
}
