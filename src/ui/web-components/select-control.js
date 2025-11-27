/**
 * Select Control Web Component
 *
 * Wraps a native <select> element with ControlManager integration.
 * Preserves optgroups and native browser behavior.
 *
 * Usage:
 * <select-control
 *   id="integrator"
 *   settings-key="integrator"
 *   default="rk4">
 *   <select>
 *     <optgroup label="Explicit Methods">
 *       <option value="euler">Euler (1st order)</option>
 *       <option value="rk4" selected>RK4 (4th order)</option>
 *     </optgroup>
 *   </select>
 * </select-control>
 *
 * Or with options directly in the component:
 * <select-control
 *   id="simple-select"
 *   settings-key="simpleSelect"
 *   default="a">
 *   <option value="a">Option A</option>
 *   <option value="b">Option B</option>
 * </select-control>
 */

import { ControlElement } from './base.js';

export class SelectControl extends ControlElement {
    constructor() {
        super();
        this.selectElement = null;
    }

    initializeProperties() {
        // Read default from attribute, or from selected option
        this.defaultValue = this.getAttribute('default') || null;
    }

    attachInternalListeners() {
        // Find or create the select element
        this.selectElement = this.querySelector('select');

        if (!this.selectElement) {
            // If no <select> found, wrap any <option>/<optgroup> children in a select
            this._wrapOptionsInSelect();
            this.selectElement = this.querySelector('select');
        }

        if (!this.selectElement) return;

        // If no default specified, use the selected option or first option
        if (!this.defaultValue) {
            const selected = this.selectElement.querySelector('option[selected]');
            if (selected) {
                this.defaultValue = selected.value;
            } else {
                const firstOption = this.selectElement.querySelector('option');
                if (firstOption) {
                    this.defaultValue = firstOption.value;
                }
            }
        }

        // Set initial value to default
        if (this.defaultValue) {
            this.selectElement.value = this.defaultValue;
        }

        // Add change listener
        this.selectElement.addEventListener('change', () => {
            this.triggerChange();
            // Also dispatch standard 'change' event for compatibility
            this.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }

    /**
     * Wrap loose option/optgroup elements in a select
     * @private
     */
    _wrapOptionsInSelect() {
        const options = this.querySelectorAll(':scope > option, :scope > optgroup');
        if (options.length === 0) return;

        const select = document.createElement('select');
        for (const opt of Array.from(options)) {
            select.appendChild(opt);
        }
        this.appendChild(select);
    }

    getValue() {
        if (this.selectElement) {
            return this.selectElement.value;
        }
        return this.defaultValue;
    }

    setValue(value) {
        if (this.selectElement) {
            this.selectElement.value = value;
        }
    }

    /**
     * Enable/disable the select
     */
    set disabled(value) {
        if (this.selectElement) {
            this.selectElement.disabled = value;
        }
    }

    get disabled() {
        return this.selectElement ? this.selectElement.disabled : false;
    }

    /**
     * Get the selected option text
     */
    getSelectedText() {
        if (this.selectElement && this.selectElement.selectedOptions.length > 0) {
            return this.selectElement.selectedOptions[0].text;
        }
        return '';
    }

    /**
     * Override to store string value
     */
    saveToSettings(settings) {
        if (this.settingsKey) {
            settings[this.settingsKey] = this.getValue();
        }
    }

    /**
     * Override to restore string value
     */
    restoreFromSettings(settings) {
        if (settings && this.settingsKey && settings[this.settingsKey] != null) {
            this.setValue(settings[this.settingsKey]);
        }
    }
}

// Register custom element
customElements.define('select-control', SelectControl);
