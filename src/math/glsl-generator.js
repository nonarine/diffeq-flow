/**
 * GLSL Generator Interface
 *
 * Defines the contract for converting math expressions to GLSL code.
 * Used by both UI (MathToGLSLControl) and programmatic code.
 *
 * Pattern:
 * 1. UI passes math expression to generator
 * 2. Generator uses notebook context to expand functions
 * 3. Generator parses to GLSL
 * 4. Returns GLSL code
 *
 * This ensures UI and programmatic paths use IDENTICAL logic.
 */

import { logger } from '../utils/debug-logger.js';

/**
 * Base interface for GLSL generation
 *
 * Subclasses implement specific generation logic (field equations, color expressions, etc.)
 */
export class IGLSLGenerator {
    /**
     * Generate GLSL code from math expression
     *
     * @param {string|string[]} mathExpr - Math expression(s)
     * @param {Notebook} notebook - Notebook instance with function definitions
     * @param {Object} context - Additional context (dimensions, variables, etc.)
     * @returns {string} Generated GLSL code
     * @throws {Error} If generation fails
     */
    generate(mathExpr, notebook, context = {}) {
        throw new Error('IGLSLGenerator.generate() must be implemented by subclass');
    }

    /**
     * Validate math expression before generation
     *
     * @param {string|string[]} mathExpr - Math expression(s)
     * @param {Object} context - Additional context
     * @returns {{valid: boolean, error?: string}} Validation result
     */
    validate(mathExpr, context = {}) {
        throw new Error('IGLSLGenerator.validate() must be implemented by subclass');
    }

    /**
     * Get a user-friendly description of what this generator does
     *
     * @returns {string} Description
     */
    getDescription() {
        return 'GLSL Generator';
    }

    /**
     * Get placeholder text for the math input
     *
     * @returns {string} Placeholder text
     */
    getMathPlaceholder() {
        return 'Enter math expression...';
    }

    /**
     * Get placeholder text for the GLSL output
     *
     * @returns {string} Placeholder text
     */
    getGLSLPlaceholder() {
        return 'Generated GLSL code...';
    }
}

/**
 * Example generator for demonstration
 * Wraps a single expression in a GLSL function
 */
export class SimpleExpressionGenerator extends IGLSLGenerator {
    constructor(options = {}) {
        super();
        this.functionName = options.functionName || 'customFunction';
        this.returnType = options.returnType || 'float';
        this.parameters = options.parameters || [];
    }

    validate(mathExpr, context) {
        if (!mathExpr || (typeof mathExpr === 'string' && !mathExpr.trim())) {
            return { valid: false, error: 'Expression is empty' };
        }
        return { valid: true };
    }

    generate(mathExpr, notebook, context = {}) {
        // Import parseExpression dynamically to avoid circular dependencies
        const { parseExpression } = require('./parser.js');

        // Step 1: Expand using notebook
        const expanded = notebook ? notebook.expandFunctions(mathExpr) : mathExpr;
        logger.verbose(`Expanded: "${mathExpr}" → "${expanded}"`);

        // Step 2: Parse to GLSL
        const dims = this.parameters.length;
        const vars = this.parameters.map(p => p.name);
        const glslExpr = parseExpression(expanded, dims, vars, 'pos');

        // Step 3: Wrap in function
        const paramList = this.parameters.map(p => `${p.type} ${p.name}`).join(', ');
        const glslCode = `${this.returnType} ${this.functionName}(${paramList}) {
    return ${glslExpr};
}`;

        logger.verbose('Generated GLSL:', glslCode);
        return glslCode;
    }

    getDescription() {
        return `Generate ${this.returnType} ${this.functionName}(...)`;
    }

    getMathPlaceholder() {
        return 'Enter expression...';
    }

    getGLSLPlaceholder() {
        return `${this.returnType} ${this.functionName}(...) { ... }`;
    }
}
