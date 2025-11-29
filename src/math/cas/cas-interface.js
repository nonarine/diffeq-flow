/**
 * CAS (Computer Algebra System) Engine Interface
 *
 * Abstract base class defining the interface that all CAS engines must implement.
 * Supports notebook context management and symbolic computation operations.
 */

/**
 * Abstract base class for CAS engines
 * All engines (Nerdamer, Maxima, etc.) must implement this interface
 */
export class CASEngine {
    constructor() {
        this._ready = false;
    }

    // ===== Lifecycle =====

    /**
     * Initialize the CAS engine (async - may load WASM, scripts, etc.)
     * @returns {Promise<void>}
     */
    async initialize() {
        throw new Error('initialize() must be implemented by subclass');
    }

    /**
     * Check if engine is ready for use
     * @returns {boolean}
     */
    isReady() {
        return this._ready;
    }

    // ===== Core Symbolic Operations =====

    /**
     * Parse an expression string into engine's internal representation
     * @param {string} expr - Expression to parse
     * @returns {any} - Engine-specific representation
     */
    parse(expr) {
        throw new Error('parse() must be implemented by subclass');
    }

    /**
     * Evaluate an expression and return result
     * @param {string} expression - Expression to evaluate
     * @returns {{result: string, tex: string, error?: string}} - Result with TeX representation
     */
    evaluate(expression) {
        throw new Error('evaluate() must be implemented by subclass');
    }

    /**
     * Compute symbolic derivative
     * @param {string} expr - Expression to differentiate
     * @param {string} variable - Variable to differentiate with respect to
     * @returns {string} - Symbolic derivative as string
     */
    differentiate(expr, variable) {
        throw new Error('differentiate() must be implemented by subclass');
    }

    /**
     * Simplify an expression
     * @param {string} expr - Expression to simplify
     * @returns {string} - Simplified expression
     */
    simplify(expr) {
        throw new Error('simplify() must be implemented by subclass');
    }

    /**
     * Solve equation for variable
     * @param {string} equation - Equation to solve (e.g., "x^2 - 4")
     * @param {string} variable - Variable to solve for
     * @returns {string|string[]|null} - Solution(s) or null if failed
     */
    solve(equation, variable) {
        throw new Error('solve() must be implemented by subclass');
    }

    // ===== Matrix Operations =====

    /**
     * Invert a symbolic matrix
     * @param {string[][]} matrixElements - 2D array of expression strings
     * @returns {string[][]|null} - Inverted matrix or null if failed
     */
    invertMatrix(matrixElements) {
        throw new Error('invertMatrix() must be implemented by subclass');
    }

    /**
     * Get element from symbolic matrix
     * @param {any} matrix - Engine-specific matrix representation
     * @param {number} i - Row index (0-based)
     * @param {number} j - Column index (0-based)
     * @returns {string} - Matrix element as expression string
     */
    matrixElement(matrix, i, j) {
        throw new Error('matrixElement() must be implemented by subclass');
    }

    /**
     * Set a variable in the engine's scope
     * @param {string} name - Variable name
     * @param {string} value - Variable value (expression string)
     */
    setVariable(name, value) {
        throw new Error('setVariable() must be implemented by subclass');
    }

    // ===== Code Generation =====

    /**
     * Convert symbolic result to GLSL code
     * @param {string} expr - Expression string
     * @returns {string} - GLSL code
     */
    toGLSL(expr) {
        throw new Error('toGLSL() must be implemented by subclass');
    }

    /**
     * Convert symbolic result to LaTeX for MathJax rendering
     * @param {string} expr - Expression string
     * @returns {string} - LaTeX code
     */
    toTeX(expr) {
        throw new Error('toTeX() must be implemented by subclass');
    }

    // ===== Utility Methods =====

    /**
     * Clear engine's internal computational cache
     *
     * ARCHITECTURAL NOTE:
     * - This clears ONLY temporary computational state (expression simplification cache, etc.)
     * - After calling this, the Notebook will need to re-apply its context via ensureContext()
     * - The Notebook class manages this automatically - you rarely need to call this directly
     *
     * Use cases:
     * - Explicit user-triggered cache clearing (future feature)
     * - Edge cases where cache clearing might be beneficial
     * - Testing and debugging
     */
    clearCache() {
        throw new Error('clearCache() must be implemented by subclass');
    }

    /**
     * Convert engine result to string
     * @param {any} result - Engine-specific result object
     * @returns {string} - String representation
     */
    toString(result) {
        throw new Error('toString() must be implemented by subclass');
    }

    // ===== Metadata =====

    /**
     * Get engine name
     * @returns {string} - Engine name (e.g., "Nerdamer", "Maxima")
     */
    getName() {
        throw new Error('getName() must be implemented by subclass');
    }

    /**
     * Get engine capabilities
     * @returns {{
     *   differentiate: boolean,
     *   integrate: boolean,
     *   solve: boolean,
     *   matrices: boolean,
     *   simplify: boolean,
     *   persistentNotebookContext: boolean
     * }}
     *
     * persistentNotebookContext: If true, engine can keep notebook definitions separate
     * from computational cache. If false, notebook must be re-evaluated on cache clear.
     */
    getCapabilities() {
        throw new Error('getCapabilities() must be implemented by subclass');
    }

    /**
     * Get engine version info
     * @returns {string} - Version string
     */
    getVersion() {
        return 'unknown';
    }
}
