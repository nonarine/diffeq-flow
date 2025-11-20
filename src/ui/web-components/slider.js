/**
 * Linear Slider Web Component
 */

import { ControlElement } from './base.js';

/**
 * LinearSlider - Linear slider control with reactive binding
 *
 * Usage:
 * <linear-slider
 *   id="dimensions"
 *   label="Dimensions"
 *   default="2"
 *   min="0"
 *   max="6"
 *   step="1"
 *   display-format="0"
 *   transform="1.0"
 *   bind-label="label"
 *   bind-value="value"
 *   bind-min="min"
 *   bind-max="max">
 *   <label>
 *     <span>{{label}}</span>: <span bind-text="value">{{value}}</span>
 *   </label>
 *   <input type="range" min="{{min}}" max="{{max}}" step="{{step}}" value="{{value}}">
 * </linear-slider>
 *
 * The 'transform' attribute enables linear scaling:
 * - transform="100" → slider 0-100 maps to value 0.0-1.0 (PercentSlider behavior)
 * - transform="20" → slider 10-100 maps to value 0.5-5.0 (BilateralSpatial behavior)
 */
export class LinearSlider extends ControlElement {
    constructor() {
        super();

        // Create reactive properties (automatic getters/setters with updateBindings)
        this.createReactiveProperties({
            label: 'Value',
            value: 50,
            min: 0,
            max: 100,
            step: 1
        });

        this._displayFormat = null;
        this.sliderInput = null;
    }

    initializeProperties() {
        // Read configuration from attributes
        this.label = this.getAttribute('label') || 'Value';
        this.min = this.getNumberAttribute('min', 0);
        this.max = this.getNumberAttribute('max', 100);
        this.step = this.getNumberAttribute('step', 1);
        this.transform = this.getNumberAttribute('transform', 1.0);
        this.defaultValue = this.getNumberAttribute('default', 50);

        // Parse display format BEFORE setting value (since setter triggers formatValue)
        const formatAttr = this.getAttribute('display-format');
        if (formatAttr !== null) {
            const decimals = parseInt(formatAttr);
            this._displayFormat = (v) => (v != null ? v.toFixed(decimals) : '0');
        } else {
            this._displayFormat = (v) => (v != null ? v.toFixed(2) : '0');
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

    attachInternalListeners() {
        // Find the slider input using helper
        this.sliderInput = this.findByRole('slider', 'input[type="range"]');
        if (!this.sliderInput) return;

        // Add input listener
        this.addInputListener(this.sliderInput, () => {
            this.value = parseFloat(this.sliderInput.value) / this.transform;
            this.triggerChange();
        });

        // Register action buttons using helper
        this.registerActionButtons(['decrease', 'increase', 'decrease-large', 'increase-large', 'reset']);
    }

    getValue() {
        // Read from actual DOM input if available
        if (this.sliderInput) {
            return parseFloat(this.sliderInput.value) / this.transform;
        }
        return this.value;
    }

    setValue(newValue) {
        this.value = newValue;
        if (this.sliderInput) {
            this.sliderInput.value = newValue * this.transform;
        }
    }

    handleButtonAction(action) {
        const currentValue = this.value;
        let newValue = currentValue;

        if (action === 'increase') {
            newValue = Math.min(this.max, currentValue + this.step);
        } else if (action === 'decrease') {
            newValue = Math.max(this.min, currentValue - this.step);
        } else if (action === 'increase-large') {
            newValue = Math.min(this.max, currentValue + this.step * 10);
        } else if (action === 'decrease-large') {
            newValue = Math.max(this.min, currentValue - this.step * 10);
        } else if (action === 'reset') {
            newValue = this.defaultValue;
        } else {
            return false;
        }

        if (newValue !== currentValue) {
            this.setValue(newValue);
            this.triggerChange();
            return true;
        }

        return false;
    }
}
