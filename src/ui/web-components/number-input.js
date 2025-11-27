/**
 * Number Input Web Component
 *
 * Numeric input control for animation frame capture settings.
 * Does NOT integrate with ControlManager (no save/restore).
 *
 * Usage:
 * <number-input
 *   id="animation-frames"
 *   label="Frames"
 *   default="100"
 *   min="1"
 *   max="10000">
 * </number-input>
 */

import { ControlElement } from './base.js';

export class NumberInput extends ControlElement {
    constructor() {
        super();

        // Create reactive properties
        this.createReactiveProperties({
            label: 'Value',
            value: 100
        });

        this.numberInput = null;
        this._min = 1;
        this._max = 10000;
    }

    initializeProperties() {
        // Read configuration from attributes
        this.label = this.getAttribute('label') || 'Value';
        this._min = this.getNumberAttribute('min', 1);
        this._max = this.getNumberAttribute('max', 10000);
        this.defaultValue = this.getNumberAttribute('default', 100);
        this.value = this.defaultValue;
    }

    attachInternalListeners() {
        // Find the number input
        this.numberInput = this.findByRole('input', 'input[type="number"]');
        if (!this.numberInput) return;

        // Set min/max attributes
        this.numberInput.setAttribute('min', this._min);
        this.numberInput.setAttribute('max', this._max);

        // Add input listener
        this.addInputListener(this.numberInput, () => {
            const rawValue = parseInt(this.numberInput.value);
            this.value = isNaN(rawValue) ? this.defaultValue : Math.max(this._min, Math.min(this._max, rawValue));
            this.triggerChange();
        });
    }

    getValue() {
        if (this.numberInput) {
            const rawValue = parseInt(this.numberInput.value);
            return isNaN(rawValue) ? this.defaultValue : Math.max(this._min, Math.min(this._max, rawValue));
        }
        return this.value;
    }

    setValue(value) {
        const numValue = typeof value === 'number' ? value : parseInt(value);
        this.value = isNaN(numValue) ? this.defaultValue : Math.max(this._min, Math.min(this._max, numValue));

        if (this.numberInput) {
            this.numberInput.value = this.value;
        }
    }

    reset() {
        this.setValue(this.defaultValue);
        this.triggerChange();
    }

    /**
     * Override saveToSettings to prevent saving (not managed by ControlManager)
     */
    saveToSettings(settings) {
        // Do nothing - number inputs are not saved
    }

    /**
     * Override restoreFromSettings to prevent restoring (not managed by ControlManager)
     */
    restoreFromSettings(settings) {
        // Do nothing - number inputs are not saved
    }
}

// Register custom element
customElements.define('number-input', NumberInput);
