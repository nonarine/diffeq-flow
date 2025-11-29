/**
 * Equation Overlay Manager
 *
 * Displays mathematical equations over the canvas using MathJax
 */

import { logger } from '../utils/debug-logger.js';
import { renderTeX, createSystemLatex } from '../utils/math-renderer.js';

export class EquationOverlay {
    constructor() {
        this.overlayElement = null;
        this.visible = false;
        this.currentExpressions = [];
        this.currentVariables = [];
        this.visibleOpacity = '60%';
    }

    /**
     * Initialize the overlay manager
     * @param {string} overlayId - ID of the overlay div element
     */
    initialize(overlayId = 'equation-overlay') {
        this.overlayElement = document.getElementById(overlayId);

        if (!this.overlayElement) {
            logger.error(`Equation overlay element not found: #${overlayId}`);
            return;
        }

        // Create a content wrapper for equations
        this.contentElement = document.createElement('div');
        this.contentElement.className = 'equation-content';
        this.overlayElement.appendChild(this.contentElement);

        // Re-scale equations on window resize
        window.addEventListener('resize', () => {
            if (this.visible) {
                this.scaleToFit();
            }
        });

        logger.info('Equation overlay initialized');
    }

    /**
     * Show the overlay
     */
    show() {
        if (!this.overlayElement) return;

        this.visible = true;
        this.overlayElement.classList.add('visible');
        this.overlayElement.style.opacity = this.visibleOpacity || '1';
        logger.verbose('Equation overlay shown');
    }

    /**
     * Hide the overlay
     */
    hide() {
        if (!this.overlayElement) return;

        this.visible = false;
        this.overlayElement.classList.remove('visible');
        this.overlayElement.style.opacity = '0';
        logger.verbose('Equation overlay hidden');
    }

    /**
     * Toggle overlay visibility
     * @param {boolean} visible - Whether to show the overlay
     */
    setVisible(visible) {
        if (visible) {
            this.show();
        } else {
            this.hide();
        }
    }

    /**
     * Update the equations displayed in the overlay
     * @param {string[]} expressions - Array of expression strings
     * @param {string[]} variables - Array of variable names (x, y, z, etc.)
     */
    async updateEquations(expressions, variables) {
        if (!this.overlayElement || !this.contentElement) return;

        // Store current state
        this.currentExpressions = expressions;
        this.currentVariables = variables;

        // Don't render if not visible
        if (!this.visible) {
            return;
        }

        try {
            // Create LaTeX system
            const latex = createSystemLatex(expressions, variables);

            if (!latex) {
                this.contentElement.innerHTML = '<em>No equations</em>';
                return;
            }

            // Render with MathJax into content wrapper (not the main overlay)
            await renderTeX(this.contentElement, latex);

            // Scale equations to fit if needed
            this.scaleToFit();

            logger.verbose(`Updated equation overlay with ${expressions.length} equations`);
        } catch (error) {
            logger.error('Failed to update equation overlay:', error);
            this.contentElement.innerHTML = '<em>Error rendering equations</em>';
        }
    }

    /**
     * Scale equations to fit container width if needed
     */
    scaleToFit() {
        if (!this.overlayElement || !this.contentElement) return;

        // Find the MathJax container in the content wrapper
        const mjxContainer = this.contentElement.querySelector('mjx-container');
        if (!mjxContainer) return;

        // Hide during resize to avoid visual bouncing (use opacity so we can still measure)
        this.overlayElement.style.opacity = '0';

        // Reset any previous scaling FIRST
        mjxContainer.style.transform = '';
        mjxContainer.style.transformOrigin = 'top left';
        mjxContainer.style.fontSize = '';

        // Measure actual width vs available width
        // Wait longer for MathJax to complete its layout calculations
        // MathJax SVG rendering can take time, especially with complex equations
        setTimeout(() => {
            // Force a reflow to ensure measurements are accurate
            void mjxContainer.offsetWidth;

            // Always use max-width from CSS, not current width (which may have been resized)
            // max-width is calc(100vw - 810px)
            const maxWidth = window.innerWidth - 810;
            const availableWidth = maxWidth - 40; // Subtract padding (20px left + 20px right)

            // MathJax creates SVG content inside mjx-container
            // We need to measure the SVG's actual width, not the container
            const svg = mjxContainer.querySelector('svg');
            let contentWidth;

            if (svg) {
                // Get the SVG's natural width (viewBox or actual rendered width)
                const svgRect = svg.getBoundingClientRect();
                contentWidth = svgRect.width;
            } else {
                // Fallback: use scrollWidth which includes overflow
                contentWidth = mjxContainer.scrollWidth;
            }

            logger.verbose(`Equation sizing: SVG content=${contentWidth.toFixed(1)}px, available=${availableWidth}px (max-width=${maxWidth}px - 40px padding)`);
            logger.verbose(`  mjx-container: getBBox=${mjxContainer.getBoundingClientRect().width.toFixed(1)}px, scrollWidth=${mjxContainer.scrollWidth}px`);

            // Helper to resize panel to fit SVG after scaling/font changes
            const fitPanelToSVG = () => {
                // Wait for transforms/font-size to apply
                setTimeout(() => {
                    // Measure final SVG size
                    const finalSvg = mjxContainer.querySelector('svg');
                    const finalRect = finalSvg ? finalSvg.getBoundingClientRect() : mjxContainer.getBoundingClientRect();

                    const newWidth = Math.ceil(finalRect.width + 40); // Add padding (20px left + 20px right)
                    const newHeight = Math.ceil(finalRect.height + 32); // Add padding (16px top + 16px bottom)

                    this.overlayElement.style.width = `${newWidth}px`;
                    this.overlayElement.style.height = `${newHeight}px`;

                    // Restore opacity now that sizing is complete
                    this.overlayElement.style.opacity = this.visibleOpacity || '1';

                    logger.verbose(`Final panel size: ${newWidth}px × ${newHeight}px (SVG: ${finalRect.width.toFixed(1)}px × ${finalRect.height.toFixed(1)}px)`);
                }, 100);
            };

            if (contentWidth > availableWidth) {
                const ratio = contentWidth / availableWidth;

                // Strategy: Try font-size reduction first (better readability than scaling)
                if (ratio < 1.5) {
                    // Mild overflow: just reduce font size
                    const fontSize = Math.max(0.7, 1.0 / ratio);
                    mjxContainer.style.fontSize = `${(fontSize * 100).toFixed(0)}%`;
                    logger.verbose(`Reduced equation font size to ${(fontSize * 100).toFixed(0)}% to fit (${contentWidth.toFixed(1)}px → ${availableWidth}px)`);
                } else {
                    // Severe overflow: reduce font to 70% and apply scaling
                    // After 70% font-size, content will be: contentWidth * 0.7
                    // Then we scale to fit: (contentWidth * 0.7) * scaleFactor = availableWidth
                    // So: scaleFactor = availableWidth / (contentWidth * 0.7)
                    mjxContainer.style.fontSize = '70%';
                    const scaleFactor = Math.max(0.4, availableWidth / (contentWidth * 0.7));
                    mjxContainer.style.transform = `scale(${scaleFactor})`;
                    logger.verbose(`Reduced font to 70% and scaled by ${(scaleFactor * 100).toFixed(0)}% to fit (${contentWidth.toFixed(1)}px → ${availableWidth}px)`);
                }

                // Resize panel to fit the scaled SVG
                fitPanelToSVG();
            } else {
                // Content fits naturally
                logger.verbose(`Equations fit naturally (no scaling needed)`);

                // Resize panel to fit the SVG
                fitPanelToSVG();
            }
        }, 250); // Longer timeout for complex MathJax rendering
    }

    /**
     * Re-render current equations (useful after showing overlay)
     */
    async refresh() {
        if (this.currentExpressions.length > 0) {
            await this.updateEquations(this.currentExpressions, this.currentVariables);
        }
    }

    /**
     * Get current visibility state
     * @returns {boolean}
     */
    isVisible() {
        return this.visible;
    }
}

// Export singleton instance
export const equationOverlay = new EquationOverlay();
