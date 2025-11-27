/**
 * AccordionAwareMixin - Automatic accordion resize on content changes
 *
 * Detects if a control is inside an accordion section and automatically
 * resizes the accordion when the control's size changes.
 *
 * Uses ResizeObserver for automatic detection - no manual calls needed!
 */

/**
 * AccordionAwareMixin
 *
 * Automatically handles accordion resizing when control content changes.
 * Just apply this mixin to any control that might be in an accordion.
 *
 * @param {Class} Base - Base class to extend
 * @returns {Class} Extended class with automatic accordion resize
 */
export const AccordionAwareMixin = (Base) => class extends Base {
    constructor() {
        super();
        this._resizeObserver = null;
        this._accordionSection = null;
    }

    /**
     * Setup automatic accordion resize on connection
     */
    connectedCallback() {
        super.connectedCallback();

        // Wait for element to be fully initialized
        requestAnimationFrame(() => {
            this.setupAccordionResize();
        });
    }

    /**
     * Clean up observer on disconnect
     */
    disconnectedCallback() {
        if (super.disconnectedCallback) {
            super.disconnectedCallback();
        }

        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
    }

    /**
     * Setup ResizeObserver to automatically resize accordion
     */
    setupAccordionResize() {
        // Check if we're inside an accordion section
        this._accordionSection = this.closest('.accordion-section');

        if (!this._accordionSection) {
            // Not in an accordion, nothing to do
            return;
        }

        // Check if ResizeObserver is available
        if (typeof ResizeObserver === 'undefined') {
            console.warn('ResizeObserver not available, accordion auto-resize disabled');
            return;
        }

        // Create observer to watch for size changes
        this._resizeObserver = new ResizeObserver((entries) => {
            // Debounce rapid changes
            if (this._resizeTimeout) {
                clearTimeout(this._resizeTimeout);
            }

            this._resizeTimeout = setTimeout(() => {
                this.resizeAccordion();
            }, 50);
        });

        // Observe this element for size changes
        this._resizeObserver.observe(this);
    }

    /**
     * Resize the parent accordion section
     */
    resizeAccordion() {
        if (!this._accordionSection) return;

        // Don't resize if accordion is collapsed
        if (this._accordionSection.classList.contains('collapsed')) return;

        // Set max-height to scrollHeight to fit content
        const newHeight = this._accordionSection.scrollHeight + 'px';
        this._accordionSection.style.maxHeight = newHeight;
    }

    /**
     * Trigger an immediate accordion resize
     * Call this when you know content has changed (e.g., show/hide elements)
     */
    triggerAccordionResize() {
        if (!this._accordionSection) return;

        // Force layout recalculation
        requestAnimationFrame(() => {
            this.resizeAccordion();
        });
    }
};
