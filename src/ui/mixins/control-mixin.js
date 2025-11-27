/**
 * Control Mixins - Reusable control interface for ControlManager integration
 *
 * These mixins provide the standard Control interface that ControlManager expects,
 * allowing any class (not just ControlElement) to integrate with the control system.
 */

/**
 * ControlMixin - Core ControlManager interface
 *
 * Provides save/load/apply integration with ControlManager.
 * Makes any class compatible with ControlManager's registration system.
 *
 * Required methods to implement in subclass:
 * - getValue() - Return current value
 * - setValue(value) - Set value and update UI
 *
 * @param {Class} Base - Base class to extend
 * @returns {Class} Extended class with control interface
 */
export const ControlMixin = (Base) => class extends Base {
    constructor() {
        super();

        // Control interface properties
        this.settingsKey = null;
        this.defaultValue = null;
        this.onChange = null;
        this._callback = null;
    }

    /**
     * Initialize settingsKey from attribute or id
     * Call this from connectedCallback or initializeProperties
     */
    initializeControlProperties() {
        this.settingsKey = this.getAttribute('settings-key') || this.id;

        // Read default value if provided as attribute
        const defaultAttr = this.getAttribute('default');
        if (defaultAttr !== null && this.defaultValue === null) {
            this.defaultValue = parseFloat(defaultAttr);
        }
    }

    /**
     * ABSTRACT: Get current control value
     * Must be implemented by subclass
     */
    getValue() {
        throw new Error('getValue() must be implemented by subclass');
    }

    /**
     * ABSTRACT: Set control value and update UI
     * Must be implemented by subclass
     */
    setValue(value) {
        throw new Error('setValue() must be implemented by subclass');
    }

    /**
     * Reset control to default value
     */
    reset() {
        if (this.defaultValue !== null && this.defaultValue !== undefined) {
            this.setValue(this.defaultValue);
        }
    }

    /**
     * Attach change callback from ControlManager
     * @param {Function} callback - Callback to trigger on value change (usually manager.debouncedApply)
     */
    attachListeners(callback) {
        this._callback = callback;
    }

    /**
     * Trigger onChange callback and ControlManager callback
     * Call this whenever the control value changes
     */
    triggerChange() {
        const value = this.getValue();

        // Call custom onChange handler if provided
        if (this.onChange && typeof this.onChange === 'function') {
            this.onChange(value);
        }

        // Call ControlManager callback (debounced apply)
        if (this._callback && typeof this._callback === 'function') {
            this._callback();
        }

        // Dispatch custom event for other listeners
        this.dispatchEvent(new CustomEvent('control-change', {
            detail: { value },
            bubbles: true
        }));
    }

    /**
     * Save control value to settings object
     * Called by ControlManager.getSettings()
     * @param {Object} settings - Settings object to populate
     */
    saveToSettings(settings) {
        if (this.settingsKey) {
            settings[this.settingsKey] = this.getValue();
        }
    }

    /**
     * Restore control value from settings object
     * Called by ControlManager.applySettings()
     * @param {Object} settings - Settings object to read from
     */
    restoreFromSettings(settings) {
        if (settings && this.settingsKey && settings[this.settingsKey] != null) {
            this.setValue(settings[this.settingsKey]);
        }
    }
};

/**
 * ButtonActionMixin - Add +/- button support
 *
 * Provides automatic button registration and action handling.
 * Looks for buttons with action attributes: [increase], [decrease], [reset], etc.
 *
 * Methods to optionally override in subclass:
 * - handleButtonAction(action) - Handle button clicks
 *
 * @param {Class} Base - Base class to extend
 * @returns {Class} Extended class with button action support
 */
export const ButtonActionMixin = (Base) => class extends Base {
    /**
     * Handle button action
     * Override in subclass to implement specific button behaviors
     * @param {string} action - Action name (increase, decrease, reset, etc.)
     * @returns {boolean} True if action was handled, false otherwise
     */
    handleButtonAction(action) {
        // Default implementation for reset
        if (action === 'reset') {
            this.reset();
            return true;
        }

        // Subclass should override to handle other actions
        return false;
    }

    /**
     * Auto-register buttons with action attributes
     * Call this from attachInternalListeners or connectedCallback
     * @param {Array<string>} actions - Array of action names to register
     */
    registerActionButtons(actions) {
        for (const action of actions) {
            // Find all buttons with this action attribute
            const buttons = this.querySelectorAll(`[${action}]`);
            for (const button of buttons) {
                button.addEventListener('click', () => {
                    const handled = this.handleButtonAction(action);
                    if (handled && typeof this.triggerChange === 'function') {
                        // Note: triggerChange is called by the action handler if needed
                        // This is here as a fallback in case subclass forgot
                    }
                });
            }
        }
    }
};

/**
 * AttributeHelpersMixin - Convenience attribute readers
 *
 * Provides helper methods for reading typed attributes from HTML.
 *
 * @param {Class} Base - Base class to extend
 * @returns {Class} Extended class with attribute helpers
 */
export const AttributeHelpersMixin = (Base) => class extends Base {
    /**
     * Read number attribute with default fallback
     * @param {string} name - Attribute name
     * @param {number} defaultValue - Default value if attribute not found
     * @returns {number} Parsed number or default
     */
    getNumberAttribute(name, defaultValue = 0) {
        const value = this.getAttribute(name);
        if (value === null) return defaultValue;
        const parsed = parseFloat(value);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    /**
     * Read boolean attribute with default fallback
     * Supports: attribute present = true, "true", "false", attribute name as value
     * @param {string} name - Attribute name
     * @param {boolean} defaultValue - Default value if attribute not found
     * @returns {boolean} Boolean value
     */
    getBooleanAttribute(name, defaultValue = false) {
        const value = this.getAttribute(name);
        if (value === null) return defaultValue;

        // Empty attribute or attribute=attribute means true
        if (value === '' || value === name) return true;

        // Explicit true/false
        return value === 'true';
    }
};

/**
 * Compose multiple mixins together
 * Helper function to make mixin composition more readable
 *
 * @example
 * class MyControl extends composeMixins(
 *   HTMLElement,
 *   ControlMixin,
 *   ButtonActionMixin,
 *   AttributeHelpersMixin
 * ) { ... }
 *
 * @param {Class} Base - Base class
 * @param {...Function} mixins - Mixins to apply (right to left)
 * @returns {Class} Composed class
 */
export function composeMixins(Base, ...mixins) {
    return mixins.reduce((acc, mixin) => mixin(acc), Base);
}
