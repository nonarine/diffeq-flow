/**
 * Web Components - Main export and registration
 *
 * Import from this file to get all web components and the registration function.
 */

// Export base class
export { ControlElement } from './base.js';

// Export components
export { LinearSlider } from './slider.js';
export { LogSlider } from './log-slider.js';
export { PercentSlider } from './percent-slider.js';

// Import for registration
import { LinearSlider } from './slider.js';
import { LogSlider } from './log-slider.js';
import { PercentSlider } from './percent-slider.js';

/**
 * Register all custom elements with the browser
 * Call this once at application startup, before using any components
 *
 * Example:
 * import { registerControlElements } from './src/ui/web-components/index.js';
 * registerControlElements();
 */
export function registerControlElements() {
    // Check if already registered to avoid errors
    if (!customElements.get('linear-slider')) {
        customElements.define('linear-slider', LinearSlider);
    }
    if (!customElements.get('log-slider')) {
        customElements.define('log-slider', LogSlider);
    }
    if (!customElements.get('percent-slider')) {
        customElements.define('percent-slider', PercentSlider);
    }
}
