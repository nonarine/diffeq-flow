/**
 * Checkbox Web Component
 *
 * Checkbox control with reactive binding and ControlManager integration.
 *
 * Usage:
 * <check-box
 *   id="sync-steps-to-frame-limit"
 *   settings-key="syncStepsToFrameLimit"
 *   default="false"
 *   label="Sync to frame limit">
 * </check-box>
 *
 * Or with template:
 * <check-box id="my-checkbox" settings-key="myCheckbox" default="false">
 *   <label>
 *     <input type="checkbox">
 *     <span>{{label}}</span>
 *   </label>
 * </check-box>
 */

import { ControlElement } from './base.js';

export class Checkbox extends ControlElement {
    constructor() {
        super();

        // Create reactive properties
        this.createReactiveProperties({
            label: 'Checkbox',
            checked: false
        });

        this.checkboxInput = null;
    }

    initializeProperties() {
        // Read configuration from attributes
        this.label = this.getAttribute('label') || 'Checkbox';
        this.defaultValue = this.getBooleanAttribute('default', false);
        this.checked = this.defaultValue;
    }

    attachInternalListeners() {
        // Find the checkbox input
        this.checkboxInput = this.findByRole('checkbox', 'input[type="checkbox"]');

        // If no checkbox found, create one with label
        if (!this.checkboxInput) {
            this._createDefaultTemplate();
            this.checkboxInput = this.querySelector('input[type="checkbox"]');
        }

        if (!this.checkboxInput) return;

        // Sync initial state
        this.checkboxInput.checked = this.checked;

        // Add change listener
        this.checkboxInput.addEventListener('change', () => {
            this.checked = this.checkboxInput.checked;
            this.triggerChange();
            // Also dispatch standard 'change' event for compatibility
            this.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }

    /**
     * Create default checkbox template if none provided
     * @private
     */
    _createDefaultTemplate() {
        const label = document.createElement('label');
        label.style.cssText = 'display: flex; align-items: center; cursor: pointer; padding: 4px 0;';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.style.marginRight = '8px';

        const span = document.createElement('span');
        span.textContent = this.label;

        label.appendChild(input);
        label.appendChild(span);
        this.appendChild(label);
    }

    getValue() {
        if (this.checkboxInput) {
            return this.checkboxInput.checked;
        }
        return this.checked;
    }

    setValue(value) {
        this.checked = Boolean(value);
        if (this.checkboxInput) {
            this.checkboxInput.checked = this.checked;
        }
    }

    /**
     * Enable/disable the checkbox
     */
    set disabled(value) {
        if (this.checkboxInput) {
            this.checkboxInput.disabled = value;
        }
    }

    get disabled() {
        return this.checkboxInput ? this.checkboxInput.disabled : false;
    }

    /**
     * Override to store boolean value
     */
    saveToSettings(settings) {
        if (this.settingsKey) {
            settings[this.settingsKey] = this.getValue();
        }
    }

    /**
     * Override to restore boolean value
     */
    restoreFromSettings(settings) {
        if (settings && this.settingsKey && settings[this.settingsKey] != null) {
            this.setValue(settings[this.settingsKey]);
        }
    }
}

// Register custom element
customElements.define('check-box', Checkbox);
