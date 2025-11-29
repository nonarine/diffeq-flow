/**
 * MathJax rendering utilities
 *
 * Provides helpers for rendering LaTeX mathematical notation using MathJax v3
 */

import { logger } from './debug-logger.js';
import { parseExpressionToTeX } from '../math/parser.js';

/**
 * Wait for MathJax to be ready
 * @returns {Promise<void>}
 */
export async function waitForMathJax() {
    // If MathJax has a startup promise, wait for that
    if (window.MathJax && window.MathJax.startup && window.MathJax.startup.promise) {
        await window.MathJax.startup.promise;
        logger.info('MathJax fully initialized via startup.promise');
        return;
    }

    // Otherwise, poll for MathJax to be available
    if (window.MathJax && window.MathJax.typesetPromise) {
        logger.info('MathJax already available');
        return Promise.resolve();
    }

    logger.info('Waiting for MathJax to load...');
    return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
            if (window.MathJax && window.MathJax.typesetPromise) {
                clearInterval(checkInterval);
                logger.info('MathJax loaded and ready');
                resolve();
            }
        }, 100);

        // Timeout after 10 seconds
        setTimeout(() => {
            clearInterval(checkInterval);
            if (!window.MathJax) {
                logger.error('MathJax failed to load after 10 seconds');
            }
            resolve();
        }, 10000);
    });
}

/**
 * Render LaTeX string to an HTML element
 * @param {HTMLElement} element - Element to render into
 * @param {string} latex - LaTeX string to render
 * @returns {Promise<void>}
 */
export async function renderTeX(element, latex) {
    await waitForMathJax();

    if (!window.MathJax) {
        logger.error('MathJax not available after wait, falling back to plain text');
        element.textContent = latex;
        return;
    }

    try {
        // Clear element first
        element.innerHTML = '';

        logger.info(`Rendering LaTeX:`, latex);

        // Use MathJax's SVG conversion method (tex2svg)
        // SVG doesn't require font loading - renders as vector paths
        const renderedNode = window.MathJax.tex2svg(latex, {
            display: true  // Display mode (centered, larger)
        });

        // Append the rendered node to the element
        element.appendChild(renderedNode);

        logger.info(`Rendered LaTeX successfully`);
    } catch (error) {
        logger.error('Failed to render LaTeX:', error);
        logger.error('Error stack:', error.stack);
        logger.error('LaTeX content:', latex);
        element.textContent = latex; // Fallback to plain text
    }
}

/**
 * Render LaTeX with automatic scaling to fit container width
 * @param {HTMLElement} element - Element to render into
 * @param {string} latex - LaTeX string to render
 * @param {number} maxWidth - Maximum width in pixels (defaults to element's clientWidth)
 * @returns {Promise<void>}
 */
export async function renderTeXScaled(element, latex, maxWidth = null) {
    await waitForMathJax();

    if (!window.MathJax) {
        logger.error('MathJax not available after wait, falling back to plain text');
        element.textContent = latex;
        return;
    }

    try {
        // Clear element first
        element.innerHTML = '';

        const renderedNode = window.MathJax.tex2svg(latex, { display: true });

        // Apply scaling with proper width constraint
        // Wrapper sized to target width to prevent overflow
        const wrapper = document.createElement('div');

        // Inner div with transform, positioned absolutely to not affect layout
        const scaler = document.createElement('div');
        scaler.style.cssText = `
            transform-origin: right center;
            display: inline-block;
            position: absolute;
            right: 0;
        `;
        scaler.appendChild(renderedNode);

        // Spacer to give wrapper proper height
        const spacer = document.createElement('div');
        spacer.style.cssText = 'visibility: hidden';

        wrapper.appendChild(scaler);
        wrapper.appendChild(spacer);
        element.appendChild(wrapper);

        // Measure
        const renderedRect = wrapper.getBoundingClientRect();
        const renderedWidth = scaler.offsetWidth;
        const targetWidth = maxWidth || element.clientWidth;

        logger.info(`Rendered TeX size: ${renderedWidth}px (measured), target: ${targetWidth}px`);

        // Calculate scale factor if needed
        let scale = 1.0;
        if (renderedWidth > targetWidth && targetWidth > 0) {
            scale = targetWidth / renderedWidth;
            logger.info(`Scaling TeX: ${renderedWidth}px -> ${targetWidth}px (scale: ${scale.toFixed(3)}x)`);
        } else {
            logger.info(`No scaling needed: rendered ${renderedWidth}px, target ${targetWidth}px`);
        }

        const heightToUse = scaler.offsetHeight;
        wrapper.style.display = "block";
        wrapper.style.position = "relative";
        wrapper.style.minHeight = `${heightToUse}px`;
        wrapper.style.maxWidth = `${targetWidth}px`;
        scaler.style.transform = `scale(${scale})`;
        spacer.style.height = `height: ${heightToUse * scale}px`;
        scaler.style.visibility = "visible";
        wrapper.style.visibility = "visible";

        // Log actual rendered dimensions for debugging
        logger.info(`Actual rendered: wrapper=${wrapper.offsetWidth}px, scaler=${scaler.offsetWidth}px, spacer=${spacer.offsetHeight}px`);

        logger.info(`Rendered LaTeX successfully with scale ${scale.toFixed(3)}`);

    } catch (error) {
        logger.error('Failed to render LaTeX:', error);
        element.textContent = latex; // Fallback to plain text
    }
}

/**
 * Convert expression to LaTeX derivative notation
 * @param {string} expr - Expression string
 * @param {string} variable - Variable name (x, y, z, etc.)
 * @param {number} dimensions - Number of dimensions in the system
 * @returns {string} - LaTeX string
 */
export function toDerivativeNotation(expr, variable, dimensions) {
    // Parse expression to LaTeX using the parser
    logger.verbose(`Converting to derivative notation: d${variable}/dt = ${expr}`);
    const exprLatex = parseExpressionToTeX(expr, dimensions);
    logger.verbose(`Generated LaTeX: ${exprLatex}`);
    // Format: \frac{d variable}{dt} = expression
    return `\\frac{d${variable}}{dt} = ${exprLatex}`;
}

/**
 * Create LaTeX system of equations from expressions array
 * @param {string[]} expressions - Array of expression strings
 * @param {string[]} variables - Array of variable names (x, y, z, etc.)
 * @returns {string} - LaTeX string for system of equations
 */
export function createSystemLatex(expressions, variables) {
    logger.verbose(`createSystemLatex called with ${expressions.length} expressions:`, expressions);
    logger.verbose(`Variables:`, variables);

    if (!expressions || expressions.length === 0) {
        return '';
    }

    const dimensions = expressions.length;

    // Create simple array of equations
    // Use \displaystyle to force vertical fractions and proper spacing
    const equations = expressions.map((expr, i) => {
        const variable = variables[i] || `x_{${i}}`;
        return `\\displaystyle ${toDerivativeNotation(expr, variable, dimensions)}`;
    });

    // Join with line breaks using array environment
    return `\\begin{array}{l}\n${equations.join(' \\\\\n')}\n\\end{array}`;
}
