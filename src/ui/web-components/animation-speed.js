/**
 * Animation Speed Web Component
 *
 * Linear slider for controlling animation speed (steps per alpha increment).
 * NOT saved to settings (ephemeral).
 *
 * Usage:
 * <animation-speed
 *   id="animation-speed"
 *   default="10"
 *   min="1"
 *   max="200">
 * </animation-speed>
 */

import { LinearSlider } from './slider.js';

export class AnimationSpeed extends LinearSlider {
    constructor() {
        super();

        // Animation controller (set by controls-v2.js)
        this._controller = null;
    }

    /**
     * Set the animation controller
     * @param {AnimationController} controller - The animation controller instance
     */
    setController(controller) {
        this._controller = controller;

        // Set initial speed
        if (this._controller && this.value) {
            this._controller.setSpeed(this.value);
        }
    }

    /**
     * Override attachInternalListeners to add controller updates
     */
    attachInternalListeners() {
        // Call parent to set up slider
        super.attachInternalListeners();

        // Add listener to update controller when value changes
        this.addEventListener('change', () => {
            if (this._controller) {
                this._controller.setSpeed(this.value);
            }
        });
    }

    /**
     * Override saveToSettings to prevent saving (ephemeral control)
     */
    saveToSettings(settings) {
        // Do nothing - animation speed is not saved
    }

    /**
     * Override restoreFromSettings to prevent restoring (ephemeral control)
     */
    restoreFromSettings(settings) {
        // Do nothing - animation speed is not saved
    }
}

// Register custom element
customElements.define('animation-speed', AnimationSpeed);
