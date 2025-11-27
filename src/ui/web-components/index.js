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
export { AnimatableSlider, createFadeTransform } from './animatable-slider.js';
export { AnimatableTimestep } from './animatable-timestep.js';
export { AnimationAlpha } from './animation-alpha.js';
export { AnimationSpeed } from './animation-speed.js';
export { NumberInput } from './number-input.js';
export { ActionButton } from './action-button.js';
export { Checkbox } from './checkbox.js';
export { SelectControl } from './select-control.js';
export { MobileControls } from './mobile-controls.js';

// Import for registration
import { LinearSlider } from './slider.js';
import { LogSlider } from './log-slider.js';
import { PercentSlider } from './percent-slider.js';
import { AnimatableSlider } from './animatable-slider.js';
import { AnimatableTimestep } from './animatable-timestep.js';
import { AnimationAlpha } from './animation-alpha.js';
import { AnimationSpeed } from './animation-speed.js';
import { NumberInput } from './number-input.js';
import { ActionButton } from './action-button.js';
import { Checkbox } from './checkbox.js';
import { SelectControl } from './select-control.js';

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
    if (!customElements.get('animatable-slider')) {
        customElements.define('animatable-slider', AnimatableSlider);
    }
    if (!customElements.get('animatable-timestep')) {
        customElements.define('animatable-timestep', AnimatableTimestep);
    }
    if (!customElements.get('animation-alpha')) {
        customElements.define('animation-alpha', AnimationAlpha);
    }
    if (!customElements.get('animation-speed')) {
        customElements.define('animation-speed', AnimationSpeed);
    }
    if (!customElements.get('number-input')) {
        customElements.define('number-input', NumberInput);
    }
    if (!customElements.get('action-button')) {
        customElements.define('action-button', ActionButton);
    }
    if (!customElements.get('check-box')) {
        customElements.define('check-box', Checkbox);
    }
    if (!customElements.get('select-control')) {
        customElements.define('select-control', SelectControl);
    }
}
