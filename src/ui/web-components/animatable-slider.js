/**
 * Animatable Slider Web Component
 * Extends LinearSlider with animation bounds UI
 */

import { LinearSlider } from './slider.js';
import { AnimatableSliderMixin } from '../mixins/index.js';

/**
 * AnimatableSlider - Linear slider with animation bounds
 *
 * Usage:
 * <animatable-slider
 *   id="fade"
 *   label="Fade Speed"
 *   default="0.999"
 *   min="0"
 *   max="100"
 *   step="0.1"
 *   animation-min="0.95"
 *   animation-max="0.9995"
 *   display-format="4">
 *   <!-- Standard slider HTML -->
 * </animatable-slider>
 *
 * Features:
 * - All LinearSlider features (transform support, reactive binding)
 * - Animation enable/disable button (🎬)
 * - Multi-thumb bounds slider (MIN/MAX handles)
 * - Current value indicator during animation playback
 * - Animation state save/restore
 */
export class AnimatableSlider extends AnimatableSliderMixin(LinearSlider) {
    constructor() {
        super();
    }

    /**
     * Override valueToPercent for custom transforms
     * Handles log scale and other non-linear transforms
     */
    valueToPercent(value) {
        // If we have custom transform functions, use them
        if (this._customTransform && this._customInverseTransform) {
            // value is in actual space, need to convert to slider space then to percent
            const sliderValue = this._customInverseTransform(value);
            const minSlider = this.min || 0;
            const maxSlider = this.max || 100;
            return ((sliderValue - minSlider) / (maxSlider - minSlider)) * 100;
        }

        // Otherwise use parent's implementation (handles linear transform attribute)
        return super.valueToPercent ? super.valueToPercent(value) : ((value - this.min) / (this.max - this.min)) * 100;
    }

    /**
     * Override percentToValue for custom transforms
     */
    percentToValue(percent) {
        // If we have custom transform functions, use them
        if (this._customTransform && this._customInverseTransform) {
            // Convert percent to slider value, then apply transform
            const minSlider = this.min || 0;
            const maxSlider = this.max || 100;
            const sliderValue = minSlider + (percent / 100) * (maxSlider - minSlider);
            return this._customTransform(sliderValue);
        }

        // Otherwise use parent's implementation
        return super.percentToValue ? super.percentToValue(percent) : this.min + (percent / 100) * (this.max - this.min);
    }

    /**
     * Override getValue to use custom transform if available
     */
    getValue() {
        if (this._customTransform && this.sliderInput) {
            const sliderValue = parseFloat(this.sliderInput.value);
            return this._customTransform(sliderValue);
        }
        // Otherwise use parent's implementation
        return super.getValue();
    }

    /**
     * Override setValue to use custom transform if available
     */
    setValue(newValue) {
        if (this._customInverseTransform && this.sliderInput) {
            // Use custom transform
            this.value = newValue;
            const sliderValue = this._customInverseTransform(newValue);
            this.sliderInput.value = sliderValue;
        } else {
            // Use parent's implementation
            super.setValue(newValue);
        }
    }

    /**
     * Set custom transform functions (for fade slider's log scale)
     * @param {Function} transform - Function to convert slider value to actual value
     * @param {Function} inverseTransform - Function to convert actual value to slider value
     */
    setCustomTransform(transform, inverseTransform) {
        this._customTransform = transform;
        this._customInverseTransform = inverseTransform;

        // Re-apply current value with new transform
        if (this.value !== undefined && this.sliderInput) {
            const sliderValue = this._customInverseTransform(this.value);
            this.sliderInput.value = sliderValue;
        }

        // Update bounds display if animation UI is already created
        if (this.animationEnabled) {
            this.updateBoundsDisplay();
        }
    }
}

/**
 * Helper function to create fade slider's logarithmic transform
 * Maps slider [0-100] to exponential fade values [0.9-0.9999]
 * Inverted: 0 = no fade (0.9999), 100 = maximum fade (0.9)
 */
export function createFadeTransform() {
    const minFade = 0.9;      // Maximum fade speed (slider at 100)
    const maxFade = 0.9999;   // No fade (slider at 0)
    const minLog = Math.log(minFade);
    const maxLog = Math.log(maxFade);
    const scale = (maxLog - minLog) / 100;

    return {
        transform: (sliderValue) => {
            // Invert: 0 → 0.9999 (no fade), 100 → 0.9 (max fade)
            const inverted = 100 - sliderValue;
            return Math.exp(minLog + scale * inverted);
        },
        inverseTransform: (fadeValue) => {
            // Invert back: 0.9999 → 0, 0.9 → 100
            const position = (Math.log(fadeValue) - minLog) / scale;
            return 100 - position;
        }
    };
}
