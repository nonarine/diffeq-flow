/**
 * Base classes for UI controls with automatic save/restore
 */

/**
 * Base Control class
 * All controls must implement getValue() and setValue()
 */
export class Control {
    constructor(id, defaultValue, options = {}) {
        this.id = id;
        this.defaultValue = defaultValue;
        this.settingsKey = options.settingsKey || id; // Key used in settings object
        this.onChange = options.onChange || null; // Callback when value changes
        this.element = null; // Will be set when attaching listeners
    }

    /**
     * Get current value from DOM
     * Must be implemented by subclasses
     */
    getValue() {
        throw new Error('getValue() must be implemented by subclass');
    }

    /**
     * Set value in DOM
     * Must be implemented by subclasses
     */
    setValue(value) {
        throw new Error('setValue() must be implemented by subclass');
    }

    /**
     * Reset to default value
     */
    reset() {
        this.setValue(this.defaultValue);
    }

    /**
     * Attach event listeners
     * Must be implemented by subclasses
     */
    attachListeners(callback) {
        throw new Error('attachListeners() must be implemented by subclass');
    }

    /**
     * Save current value to settings object
     */
    saveToSettings(settings) {
        settings[this.settingsKey] = this.getValue();
    }

    /**
     * Restore value from settings object
     */
    restoreFromSettings(settings) {
        if (settings && settings[this.settingsKey] !== undefined) {
            this.setValue(settings[this.settingsKey]);
        }
    }
}

/**
 * Linear slider control
 */
export class SliderControl extends Control {
    constructor(id, defaultValue, options = {}) {
        super(id, defaultValue, options);
        this.min = options.min || 0;
        this.max = options.max || 100;
        this.step = options.step || 1;
        this.displayId = options.displayId || null; // Optional display element ID
        this.displayFormat = options.displayFormat || (v => v.toFixed(2)); // Format function
        // Transform functions for value conversion (e.g., slider value → actual value)
        this.transform = options.transform || (v => v); // slider → setting
        this.inverseTransform = options.inverseTransform || (v => v); // setting → slider
    }

    getValue() {
        const element = $(`#${this.id}`);
        const sliderValue = parseFloat(element.val());
        // Apply transform to get actual setting value
        return this.transform(sliderValue);
    }

    setValue(value) {
        const element = $(`#${this.id}`);
        // Apply inverse transform to get slider value
        const sliderValue = this.inverseTransform(value);
        element.val(sliderValue);
        this.updateDisplay(value);
    }

    updateDisplay(value) {
        if (this.displayId) {
            // Display shows the actual value, not the slider value
            $(`#${this.displayId}`).text(this.displayFormat(value));
        }
    }

    attachListeners(callback) {
        const element = $(`#${this.id}`);
        this.element = element;

        element.on('input', () => {
            const value = this.getValue(); // Gets transformed value
            this.updateDisplay(value);
            if (this.onChange) this.onChange(value);
            if (callback) callback();
        });
    }
}

/**
 * Logarithmic slider control
 * Slider position is linear [0-100], but value is logarithmic [minValue-maxValue]
 */
export class LogSliderControl extends Control {
    constructor(id, defaultValue, options = {}) {
        super(id, defaultValue, options);
        this.minValue = options.minValue || 0.01;
        this.maxValue = options.maxValue || 100.0;
        this.displayId = options.displayId || null;
        this.displayFormat = options.displayFormat || (v => v.toFixed(3));
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

    getValue() {
        const element = $(`#${this.id}`);
        const sliderValue = parseFloat(element.val());
        return this.linearToLog(sliderValue);
    }

    setValue(value) {
        const element = $(`#${this.id}`);
        const sliderValue = this.logToLinear(value);
        element.val(sliderValue);
        this.updateDisplay(value);
    }

    updateDisplay(value) {
        if (this.displayId) {
            $(`#${this.displayId}`).text(this.displayFormat(value));
        }
    }

    attachListeners(callback) {
        const element = $(`#${this.id}`);
        this.element = element;

        element.on('input', () => {
            const value = this.getValue();
            this.updateDisplay(value);
            if (this.onChange) this.onChange(value);
            if (callback) callback();
        });
    }
}

/**
 * Text input control
 */
export class TextControl extends Control {
    constructor(id, defaultValue, options = {}) {
        super(id, defaultValue, options);
        this.trim = options.trim !== undefined ? options.trim : true;
    }

    getValue() {
        const element = $(`#${this.id}`);
        let value = element.val();
        if (this.trim) value = value.trim();
        return value;
    }

    setValue(value) {
        const element = $(`#${this.id}`);
        element.val(value);
    }

    attachListeners(callback) {
        const element = $(`#${this.id}`);
        this.element = element;

        element.on('input', () => {
            const value = this.getValue();
            if (this.onChange) this.onChange(value);
            if (callback) callback();
        });
    }
}

/**
 * Dropdown/select control
 */
export class SelectControl extends Control {
    constructor(id, defaultValue, options = {}) {
        super(id, defaultValue, options);
    }

    getValue() {
        const element = $(`#${this.id}`);
        return element.val();
    }

    setValue(value) {
        const element = $(`#${this.id}`);
        element.val(value);
    }

    attachListeners(callback) {
        const element = $(`#${this.id}`);
        this.element = element;

        element.on('change', () => {
            const value = this.getValue();
            if (this.onChange) this.onChange(value);
            if (callback) callback();
        });
    }
}

/**
 * Checkbox control
 */
export class CheckboxControl extends Control {
    constructor(id, defaultValue, options = {}) {
        super(id, defaultValue, options);
    }

    getValue() {
        const element = $(`#${this.id}`);
        return element.prop('checked');
    }

    setValue(value) {
        const element = $(`#${this.id}`);
        element.prop('checked', value);
    }

    attachListeners(callback) {
        const element = $(`#${this.id}`);
        this.element = element;

        element.on('change', () => {
            const value = this.getValue();
            if (this.onChange) this.onChange(value);
            if (callback) callback();
        });
    }
}

/**
 * Percentage slider control
 * Slider shows 0-100, but value is stored as 0.0-1.0
 */
export class PercentSliderControl extends Control {
    constructor(id, defaultValue, options = {}) {
        super(id, defaultValue, options);
        this.min = options.min || 0;
        this.max = options.max || 100;
        this.step = options.step || 0.1;
        this.displayId = options.displayId || null;
        this.displayFormat = options.displayFormat || (v => v.toFixed(2));
    }

    getValue() {
        const element = $(`#${this.id}`);
        const sliderValue = parseFloat(element.val());
        return sliderValue / 100.0; // Convert to 0.0-1.0
    }

    setValue(value) {
        const element = $(`#${this.id}`);
        const sliderValue = value * 100.0; // Convert to 0-100
        element.val(sliderValue);
        this.updateDisplay(value);
    }

    updateDisplay(value) {
        if (this.displayId) {
            $(`#${this.displayId}`).text(this.displayFormat(value));
        }
    }

    attachListeners(callback) {
        const element = $(`#${this.id}`);
        this.element = element;

        element.on('input', () => {
            const value = this.getValue();
            this.updateDisplay(value);
            if (this.onChange) this.onChange(value);
            if (callback) callback();
        });
    }
}

/**
 * Control Manager
 * Manages a collection of controls with automatic save/restore
 */
export class ControlManager {
    constructor(options = {}) {
        this.controls = new Map(); // id -> Control instance
        this.storageKey = options.storageKey || 'settings';
        this.onApply = options.onApply || null; // Called when settings should be applied
        this.debounceTime = options.debounceTime || 300;
        this.applyTimeout = null;
    }

    /**
     * Register a control
     */
    register(control) {
        this.controls.set(control.id, control);
        return control;
    }

    /**
     * Register multiple controls
     */
    registerAll(controls) {
        controls.forEach(control => this.register(control));
    }

    /**
     * Initialize all controls (create DOM elements)
     */
    initializeControls() {
        const debouncedCallback = () => this.debouncedApply();

        for (const control of this.controls.values()) {
            control.attachListeners(debouncedCallback);
        }
    }

    /**
     * Attach event listeners to all controls
     * @deprecated Use initializeControls() instead
     */
    attachAllListeners() {
        this.initializeControls();
    }

    /**
     * Apply settings to all controls
     */
    applySettings(settings) {
        this.setSettings(settings);
    }

    /**
     * Get a control by ID
     */
    get(id) {
        return this.controls.get(id);
    }

    /**
     * Get current settings from all controls
     */
    getSettings() {
        const settings = {};
        for (const control of this.controls.values()) {
            control.saveToSettings(settings);
        }
        return settings;
    }

    /**
     * Apply settings to all controls
     */
    setSettings(settings) {
        for (const control of this.controls.values()) {
            control.restoreFromSettings(settings);
        }
    }

    /**
     * Reset all controls to defaults
     */
    resetAll() {
        for (const control of this.controls.values()) {
            control.reset();
        }
    }

    /**
     * Save settings to localStorage
     */
    saveToStorage() {
        const settings = this.getSettings();
        localStorage.setItem(this.storageKey, JSON.stringify(settings));
        return settings;
    }

    /**
     * Load settings from localStorage
     */
    loadFromStorage() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                const settings = JSON.parse(saved);
                this.setSettings(settings);
                return settings;
            }
        } catch (e) {
            console.warn('Failed to load settings from localStorage:', e);
        }
        return null;
    }

    /**
     * Clear settings from localStorage
     */
    clearStorage() {
        localStorage.removeItem(this.storageKey);
    }

    /**
     * Debounced apply function
     */
    debouncedApply() {
        if (this.applyTimeout) {
            clearTimeout(this.applyTimeout);
        }
        this.applyTimeout = setTimeout(() => {
            if (this.onApply) {
                const settings = this.getSettings();
                this.onApply(settings);
            }
        }, this.debounceTime);
    }

    /**
     * Immediate apply (no debounce)
     */
    apply() {
        if (this.onApply) {
            const settings = this.getSettings();
            this.onApply(settings);
        }
    }
}
