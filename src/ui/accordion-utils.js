/**
 * Accordion utility functions
 * Handles automatic resizing of accordion sections when content changes
 */

/**
 * Resize an accordion section to fit its content
 * @param {jQuery|string} selectorOrElement - jQuery element or selector for the control inside the accordion
 * @param {number} delay - Delay in ms to wait for DOM updates (default: 0)
 */
export function resizeAccordion(selectorOrElement, delay = 0) {
    setTimeout(() => {
        let $element;

        // Handle both jQuery elements and selectors
        if (typeof selectorOrElement === 'string') {
            $element = $(selectorOrElement);
        } else {
            $element = selectorOrElement;
        }

        if (!$element.length) {
            console.warn('resizeAccordion: Element not found', selectorOrElement);
            return;
        }

        // Find the closest accordion section
        const $accordionSection = $element.closest('.accordion-section');

        if ($accordionSection.length && !$accordionSection.hasClass('collapsed')) {
            // Set max-height to scrollHeight to accommodate new content
            $accordionSection.css('max-height', $accordionSection[0].scrollHeight + 'px');
        }
    }, delay);
}

/**
 * Resize the accordion section containing a specific control ID
 * @param {string} controlId - The ID of a control inside the accordion
 * @param {number} delay - Delay in ms to wait for DOM updates (default: 0)
 */
export function resizeAccordionForControl(controlId, delay = 0) {
    resizeAccordion(`#${controlId}`, delay);
}

/**
 * Create a debounced resize function for frequent updates
 * @param {number} wait - Debounce wait time in ms (default: 100)
 * @returns {Function} Debounced resize function
 */
export function createDebouncedResize(wait = 100) {
    let timeout;

    return function(selectorOrElement) {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            resizeAccordion(selectorOrElement, 0);
        }, wait);
    };
}

/**
 * Setup automatic resize observer for an element
 * Watches for size changes and automatically resizes the accordion
 * @param {jQuery|HTMLElement} element - Element to observe
 * @returns {ResizeObserver} The observer instance (call .disconnect() to stop)
 */
export function setupAccordionAutoResize(element) {
    const target = element instanceof jQuery ? element[0] : element;

    if (!target) {
        console.warn('setupAccordionAutoResize: Invalid element', element);
        return null;
    }

    // Check if ResizeObserver is available
    if (typeof ResizeObserver === 'undefined') {
        console.warn('ResizeObserver not available, falling back to manual resize');
        return null;
    }

    const observer = new ResizeObserver(() => {
        resizeAccordion($(target), 0);
    });

    observer.observe(target);
    return observer;
}

/**
 * Resize all visible accordions
 * Useful after major layout changes
 */
export function resizeAllAccordions() {
    $('.accordion-section').not('.collapsed').each(function() {
        $(this).css('max-height', this.scrollHeight + 'px');
    });
}
