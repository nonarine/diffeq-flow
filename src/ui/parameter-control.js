/**
 * Generic parameter control that reads metadata from parameter definitions
 * Eliminates duplication between transform definitions and UI code
 */

import { Control } from './control-base.js';
import {
    createFormatterFromDef,
    inferScaleType,
    calculateAdaptiveIncrement,
    calculateLogIncrement,
    calculateLinearIncrement
} from './control-utilities.js';

/**
 * ParameterControl - Generic control for any parameter with metadata
 *
 * Reads parameter definition (from transforms, integrators, mappers, etc.)
 * and creates appropriate UI controls automatically.
 *
 * Parameter definition schema:
 * {
 *   name: string,              // Parameter name (used as key in settings)
 *   label: string,             // Display label
 *   type: string,              // 'slider' | 'text' | 'checkbox' (future)
 *   min: number,               // Minimum value
 *   max: number,               // Maximum value
 *   step: number,              // Step size
 *   default: number,           // Default value
 *   info: string,              // Optional help text
 *   scale: string,             // Optional: 'linear' | 'log' | 'adaptive' (auto-inferred if not provided)
 *   displayFormat: string|fn,  // Optional: 'scientific' | 'decimal' | 'integer' | custom function
 *   displayPrecision: number,  // Optional: decimal places (default: 2)
 *   scientificThreshold: number // Optional: threshold for scientific notation (default: 10)
 * }
 */
export class ParameterControl extends Control {
    constructor(id, parameterDef, defaultValue, options = {}) {
        super(id, defaultValue, options);

        // Store parameter definition
        this.parameterDef = parameterDef;

        // Infer or use explicit scale type
        this.scale = parameterDef.scale || inferScaleType(
            parameterDef.min,
            parameterDef.max,
            parameterDef.step
        );

        // Create formatter from parameter definition
        this.formatter = createFormatterFromDef(parameterDef);

        // Store display element reference (will be set in attachListeners)
        this.displayElement = null;
    }

    /**
     * Calculate increment for button actions
     * @param {number} currentValue - Current parameter value
     * @param {boolean} isLarge - Whether this is a large increment
     * @returns {number} Increment value
     */
    calculateIncrement(currentValue, isLarge = false) {
        switch (this.scale) {
            case 'adaptive':
                return calculateAdaptiveIncrement(
                    currentValue,
                    this.parameterDef.step,
                    isLarge
                );

            case 'log':
                // For log scale, increment in slider space
                return calculateLogIncrement(isLarge);

            case 'linear':
            default:
                return calculateLinearIncrement(
                    this.parameterDef.step,
                    isLarge
                );
        }
    }

    /**
     * Handle button actions (increment/decrement/reset)
     * @param {string} action - 'increase', 'decrease', 'increase-large', 'decrease-large', 'reset'
     * @returns {boolean} True if action was handled
     */
    handleButtonAction(action) {
        const element = $(`#${this.id}`);
        if (!element.length) return false;

        const currentValue = this.getValue();
        const min = this.parameterDef.min;
        const max = this.parameterDef.max;

        let newValue = currentValue;

        if (action === 'reset') {
            newValue = this.defaultValue;
        } else {
            const increment = this.calculateIncrement(
                currentValue,
                action.includes('large')
            );

            if (action.startsWith('increase')) {
                newValue = Math.min(max, currentValue + increment);
            } else if (action.startsWith('decrease')) {
                newValue = Math.max(min, currentValue - increment);
            } else {
                return false;
            }
        }

        if (newValue !== currentValue) {
            this.setValue(newValue);
            element.trigger('input');
            return true;
        }

        return false;
    }

    /**
     * Render the control HTML
     * @returns {string} HTML string
     */
    render() {
        const displayId = `${this.id}-display`;
        const currentValue = this.defaultValue;

        return `
            <div class="control-group">
                <label>
                    ${this.parameterDef.label}:
                    <span class="range-value" id="${displayId}">
                        ${this.formatter(currentValue)}
                    </span>
                </label>
                <div class="slider-control">
                    <button class="slider-btn" data-slider="${this.id}" data-action="decrease-large">--</button>
                    <button class="slider-btn" data-slider="${this.id}" data-action="decrease">-</button>
                    <input type="range" id="${this.id}">
                    <button class="slider-btn" data-slider="${this.id}" data-action="increase">+</button>
                    <button class="slider-btn" data-slider="${this.id}" data-action="increase-large">++</button>
                </div>
                ${this.parameterDef.info ? `<div class="info">${this.parameterDef.info}</div>` : ''}
            </div>
        `;
    }

    /**
     * Attach to DOM and set up listeners
     * @param {function} callback - Callback to trigger when value changes
     */
    attachListeners(callback) {
        const element = $(`#${this.id}`);
        this.element = element;
        this.displayElement = $(`#${this.id}-display`);

        if (!element.length) {
            console.error(`ParameterControl: Element #${this.id} not found in DOM`);
            return;
        }

        // Set slider attributes
        element.attr('min', this.parameterDef.min);
        element.attr('max', this.parameterDef.max);
        element.attr('step', this.parameterDef.step);
        element.val(this.defaultValue);

        // Update display
        this.updateDisplay(this.defaultValue);

        // Listen for changes
        element.on('input', () => {
            const value = this.getValue();
            this.updateDisplay(value);
            if (this.onChange) this.onChange(value);
            if (callback) callback();
        });
    }

    /**
     * Update display element with formatted value
     * @param {number} value - Value to display
     */
    updateDisplay(value) {
        if (this.displayElement && this.displayElement.length) {
            this.displayElement.text(this.formatter(value));
        }
    }

    /**
     * Get current value from DOM
     * @returns {number}
     */
    getValue() {
        if (!this.element || !this.element.length) {
            return this.defaultValue;
        }
        return parseFloat(this.element.val());
    }

    /**
     * Set value in DOM
     * @param {number} value - Value to set
     */
    setValue(value) {
        if (this.element && this.element.length) {
            this.element.val(value);
            this.updateDisplay(value);
        }
    }

    /**
     * Reset to default value
     */
    reset() {
        this.setValue(this.defaultValue);
    }
}
