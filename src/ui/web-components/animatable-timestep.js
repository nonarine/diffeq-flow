/**
 * Animatable Timestep Web Component
 * Extends AnimatableSlider with custom timestep increment buttons (-- - + ++)
 */

import { AnimatableSlider } from './animatable-slider.js';

/**
 * AnimatableTimestep - Animatable slider with timestep-specific increment buttons
 *
 * Usage:
 * <animatable-timestep
 *   id="timestep"
 *   label="Timestep"
 *   default="0.01"
 *   min="0.001"
 *   max="2.5"
 *   step="0.001"
 *   small-increment="0.001"
 *   large-increment="0.01"
 *   animation-min="0.001"
 *   animation-max="0.1"
 *   display-format="3">
 *   <!-- Include buttons with decrease-large, decrease, increase, increase-large attributes -->
 * </animatable-timestep>
 *
 * Features:
 * - All AnimatableSlider features
 * - Custom small increment for - and + buttons (e.g., 0.001)
 * - Custom large increment for -- and ++ buttons (e.g., 0.01)
 * - Configurable via attributes
 */
export class AnimatableTimestep extends AnimatableSlider {
    constructor() {
        super();

        // Timestep-specific increments
        this.smallIncrement = 0.001;
        this.largeIncrement = 0.01;
    }

    initializeProperties() {
        super.initializeProperties();

        // Read increment attributes
        const smallInc = this.getAttribute('small-increment');
        const largeInc = this.getAttribute('large-increment');

        if (smallInc !== null) {
            this.smallIncrement = parseFloat(smallInc);
        }
        if (largeInc !== null) {
            this.largeIncrement = parseFloat(largeInc);
        }
    }

    /**
     * Handle button actions with timestep-specific increments
     */
    handleButtonAction(action) {
        const currentValue = this.getValue();
        const minValue = this.min || 0;
        const maxValue = this.max || 100;

        let increment;
        if (action === 'increase' || action === 'decrease') {
            increment = this.smallIncrement;
        } else if (action === 'increase-large' || action === 'decrease-large') {
            increment = this.largeIncrement;
        } else if (action === 'reset') {
            const newValue = this.defaultValue;
            if (newValue !== currentValue) {
                this.setValue(newValue);
                this.triggerChange();
                return true;
            }
            return false;
        } else {
            return false;
        }

        let newValue = currentValue;
        if (action === 'increase' || action === 'increase-large') {
            newValue = Math.min(maxValue, currentValue + increment);
        } else if (action === 'decrease' || action === 'decrease-large') {
            newValue = Math.max(minValue, currentValue - increment);
        }

        if (newValue !== currentValue) {
            this.setValue(newValue);
            this.triggerChange();
            return true;
        }

        return false;
    }
}
