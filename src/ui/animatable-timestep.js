/**
 * Animatable Timestep Control
 * Combines timestep increment buttons with animation capabilities
 */

import { AnimatableSliderControl } from './animatable-slider.js';

/**
 * AnimatableTimestepControl
 * Extends AnimatableSliderControl with custom timestep increment buttons
 */
export class AnimatableTimestepControl extends AnimatableSliderControl {
    constructor(id, defaultValue, options = {}) {
        super(id, defaultValue, options);
        this.smallIncrement = options.smallIncrement || 0.001;  // - and + buttons
        this.largeIncrement = options.largeIncrement || 0.01;   // -- and ++ buttons
    }

    /**
     * Handle button actions with timestep-specific increments
     */
    handleButtonAction(action) {
        const element = $(`#${this.id}`);
        if (!element.length) return false;

        const currentValue = this.getValue();
        const min = this.min;
        const max = this.max;

        let increment;
        if (action === 'increase' || action === 'decrease') {
            increment = this.smallIncrement;
        } else if (action === 'increase-large' || action === 'decrease-large') {
            increment = this.largeIncrement;
        } else if (action === 'reset') {
            const newValue = this.defaultValue;
            if (newValue !== currentValue) {
                this.setValue(newValue);
                element.trigger('input');
                return true;
            }
            return false;
        } else {
            return false;
        }

        let newValue = currentValue;
        if (action === 'increase' || action === 'increase-large') {
            newValue = Math.min(max, currentValue + increment);
        } else if (action === 'decrease' || action === 'decrease-large') {
            newValue = Math.max(min, currentValue - increment);
        }

        if (newValue !== currentValue) {
            this.setValue(newValue);
            element.trigger('input');
            return true;
        }
        return false;
    }
}
