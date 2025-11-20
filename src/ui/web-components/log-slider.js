/**
 * Logarithmic Slider Web Component
 */

import { ControlElement } from './base.js';

/**
 * LogSlider - Logarithmic slider control with reactive binding
 *
 * The slider position is linear (0-100), but the value is logarithmically
 * mapped to the range [minValue, maxValue].
 *
 * Usage:
 * <log-slider
 *   id="exposure"
 *   label="Exposure"
 *   default="1.0"
 *   min-value="0.01"
 *   max-value="100.0"
 *   display-format="3"
 *   transform="1.0"
 *   bind-label="label"
 *   bind-value="value">
 *   <label>
 *     <span>{{label}}</span>: <span bind-text="value">{{value}}</span>
 *   </label>
 *   <input type="range" min="0" max="100" step="0.1">
 * </log-slider>
 *
 * The 'transform' attribute applies linear scaling AFTER logarithmic mapping:
 * - transform="1.0" (default) → no scaling
 * - transform="100" → divide final value by 100
 */
export class LogSlider extends ControlElement {
    constructor() {
        super();

        // Create reactive properties using helper
        this.createReactiveProperties({
            label: 'Value',
            value: 1.0,
            minValue: 0.01,
            maxValue: 100.0
        });

        this._displayFormat = null;
        this.sliderInput = null;
    }

    initializeProperties() {
        this.label = this.getAttribute('label') || 'Value';
        this.minValue = this.getNumberAttribute('min-value', 0.01);
        this.maxValue = this.getNumberAttribute('max-value', 100.0);
        this.transform = this.getNumberAttribute('transform', 1.0);
        this.defaultValue = this.getNumberAttribute('default', 1.0);

        // Parse display format BEFORE setting value (since setter triggers formatValue)
        const formatAttr = this.getAttribute('display-format');
        if (formatAttr !== null) {
            const decimals = parseInt(formatAttr);
            this._displayFormat = (v) => (v != null ? v.toFixed(decimals) : '0');
        } else {
            this._displayFormat = (v) => (v != null ? v.toFixed(3) : '0');
        }

        // Set value after _displayFormat is ready
        this.value = this.defaultValue;
    }

    formatValue(value) {
        if (value === this._value && this._displayFormat) {
            return this._displayFormat(value);
        }
        return super.formatValue(value);
    }

    /**
     * Convert linear slider position [0, 100] to logarithmic value
     */
    linearToLog(sliderValue) {
        const minLog = Math.log(this.minValue);
        const maxLog = Math.log(this.maxValue);
        const scale = (maxLog - minLog) / 100;
        return Math.exp(minLog + scale * sliderValue);
    }

    /**
     * Convert logarithmic value to linear slider position [0, 100]
     */
    logToLinear(actualValue) {
        const minLog = Math.log(this.minValue);
        const maxLog = Math.log(this.maxValue);
        const scale = (maxLog - minLog) / 100;
        return (Math.log(actualValue) - minLog) / scale;
    }

    attachInternalListeners() {
        // Find the slider input using helper
        this.sliderInput = this.findByRole('slider', 'input[type="range"]');
        if (!this.sliderInput) return;

        // Add input listener
        this.addInputListener(this.sliderInput, () => {
            const sliderValue = parseFloat(this.sliderInput.value);
            this.value = this.linearToLog(sliderValue) / this.transform;
            this.triggerChange();
        });

        // Register action buttons using helper
        this.registerActionButtons(['decrease', 'increase', 'decrease-large', 'increase-large', 'reset']);
    }

    getValue() {
        // Read from actual DOM input if available
        if (this.sliderInput) {
            const sliderValue = parseFloat(this.sliderInput.value);
            return this.linearToLog(sliderValue) / this.transform;
        }
        return this.value;
    }

    setValue(newValue) {
        this.value = newValue;
        if (this.sliderInput) {
            const sliderValue = this.logToLinear(newValue * this.transform);
            this.sliderInput.value = sliderValue;
        }
    }

    handleButtonAction(action) {
        if (!this.sliderInput) return false;

        const currentSliderValue = parseFloat(this.sliderInput.value);
        let newSliderValue = currentSliderValue;

        let increment = 1.0;
        if (action === 'increase-large' || action === 'decrease-large') {
            increment = 10.0;
        }

        if (action === 'increase' || action === 'increase-large') {
            newSliderValue = Math.min(100, currentSliderValue + increment);
        } else if (action === 'decrease' || action === 'decrease-large') {
            newSliderValue = Math.max(0, currentSliderValue - increment);
        } else if (action === 'reset') {
            newSliderValue = this.logToLinear(this.defaultValue);
        } else {
            return false;
        }

        if (newSliderValue !== currentSliderValue) {
            this.sliderInput.value = newSliderValue;
            this.value = this.linearToLog(newSliderValue) / this.transform;
            this.triggerChange();
            return true;
        }

        return false;
    }
}
