/**
 * Base classes for UI controls with automatic save/restore
 */

import { CoordinateSystem } from '../math/coordinate-systems.js';

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
     * Handle button action (increment/decrement)
     * Can be overridden by subclasses for custom behavior
     * @param {string} action - 'increase', 'decrease', 'increase-large', 'decrease-large', 'reset'
     * @returns {boolean} True if action was handled
     */
    handleButtonAction(action) {
        // Default implementation: no button support
        return false;
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
        if (settings && settings[this.settingsKey] != null) {
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

    handleButtonAction(action) {
        const element = $(`#${this.id}`);
        if (!element.length) return false;

        const currentValue = parseFloat(element.val());
        const min = parseFloat(element.attr('min'));
        const max = parseFloat(element.attr('max'));
        const step = parseFloat(element.attr('step')) || this.step;

        let increment = step;
        if (action === 'increase-large' || action === 'decrease-large') {
            increment = step * 10;
        }

        let newValue = currentValue;
        if (action === 'increase' || action === 'increase-large') {
            newValue = Math.min(max, currentValue + increment);
        } else if (action === 'decrease' || action === 'decrease-large') {
            newValue = Math.max(min, currentValue - increment);
        } else if (action === 'reset') {
            newValue = this.inverseTransform(this.defaultValue);
        } else {
            return false; // Unknown action
        }

        if (newValue !== currentValue) {
            element.val(newValue).trigger('input');
            return true;
        }
        return false;
    }

    attachListeners(callback) {
        const element = $(`#${this.id}`);
        this.element = element;

        // Set slider attributes from JavaScript (single source of truth)
        element.attr('min', this.min);
        element.attr('max', this.max);
        element.attr('step', this.step);

        // Set initial value (will be overridden by restoreFromSettings if settings exist)
        this.setValue(this.defaultValue);

        // Handle both input and change events for better browser compatibility
        const handler = () => {
            const value = this.getValue(); // Gets transformed value
            this.updateDisplay(value);
            if (this.onChange) this.onChange(value);
            if (callback) callback();
        };

        element.on('input change', handler);
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

    handleButtonAction(action) {
        const element = $(`#${this.id}`);
        if (!element.length) return false;

        const currentSliderValue = parseFloat(element.val());
        const min = 0;
        const max = 100;

        // Increment in slider space (0-100)
        // Use smaller increments for logarithmic sliders since they're already non-linear
        let increment = 1.0;  // Small step
        if (action === 'increase-large' || action === 'decrease-large') {
            increment = 10.0;  // Large step
        }

        let newSliderValue = currentSliderValue;
        if (action === 'increase' || action === 'increase-large') {
            newSliderValue = Math.min(max, currentSliderValue + increment);
        } else if (action === 'decrease' || action === 'decrease-large') {
            newSliderValue = Math.max(min, currentSliderValue - increment);
        } else if (action === 'reset') {
            newSliderValue = this.logToLinear(this.defaultValue);
        } else {
            return false;
        }

        if (newSliderValue !== currentSliderValue) {
            element.val(newSliderValue).trigger('input');
            return true;
        }
        return false;
    }

    attachListeners(callback) {
        const element = $(`#${this.id}`);
        this.element = element;

        // LogSlider uses internal 0-100 range for linear slider position
        element.attr('min', 0);
        element.attr('max', 100);
        element.attr('step', 0.1);

        // Set initial value (will be overridden by restoreFromSettings if settings exist)
        this.setValue(this.defaultValue);

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

        // Set initial value (will be overridden by restoreFromSettings if settings exist)
        this.setValue(this.defaultValue);

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
        const value = element.val();
        // Return defaultValue if element returns null/undefined
        return value != null ? value : this.defaultValue;
    }

    setValue(value) {
        const element = $(`#${this.id}`);
        element.val(value);
    }

    attachListeners(callback) {
        const element = $(`#${this.id}`);
        this.element = element;

        // Set initial value (will be overridden by restoreFromSettings if settings exist)
        this.setValue(this.defaultValue);

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

        // Set initial value (will be overridden by restoreFromSettings if settings exist)
        this.setValue(this.defaultValue);

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

    handleButtonAction(action) {
        const element = $(`#${this.id}`);
        if (!element.length) return false;

        const currentSliderValue = parseFloat(element.val());
        const min = parseFloat(element.attr('min'));
        const max = parseFloat(element.attr('max'));
        const step = parseFloat(element.attr('step')) || this.step;

        let increment = step;
        if (action === 'increase-large' || action === 'decrease-large') {
            increment = step * 10;
        }

        let newSliderValue = currentSliderValue;
        if (action === 'increase' || action === 'increase-large') {
            newSliderValue = Math.min(max, currentSliderValue + increment);
        } else if (action === 'decrease' || action === 'decrease-large') {
            newSliderValue = Math.max(min, currentSliderValue - increment);
        } else if (action === 'reset') {
            newSliderValue = this.defaultValue * 100.0; // Convert to slider space
        } else {
            return false;
        }

        if (newSliderValue !== currentSliderValue) {
            element.val(newSliderValue).trigger('input');
            return true;
        }
        return false;
    }

    attachListeners(callback) {
        const element = $(`#${this.id}`);
        this.element = element;

        // Set slider attributes from JavaScript (single source of truth)
        element.attr('min', this.min);
        element.attr('max', this.max);
        element.attr('step', this.step);

        // Set initial value (will be overridden by restoreFromSettings if settings exist)
        this.setValue(this.defaultValue);

        element.on('input', () => {
            const value = this.getValue();
            this.updateDisplay(value);
            if (this.onChange) this.onChange(value);
            if (callback) callback();
        });
    }
}

/**
 * Adaptive slider control
 * Increment is always one order of magnitude less than current value
 * E.g., value=10-99 → increment=1; value=1-9.9 → increment=0.1; etc.
 */
export class AdaptiveSliderControl extends Control {
    constructor(id, defaultValue, options = {}) {
        super(id, defaultValue, options);
        this.min = options.min || 0.001;
        this.max = options.max || 100;
        this.minIncrement = options.minIncrement || 0.0001; // Minimum allowed increment
        this.displayId = options.displayId || null;
        this.displayFormat = options.displayFormat || (v => v.toFixed(4));
    }

    /**
     * Calculate increment based on current value
     * Returns 10^(floor(log10(|value|)) - 1)
     */
    calculateIncrement(value) {
        const absValue = Math.abs(value);

        // Handle edge cases
        if (absValue < this.minIncrement) {
            return this.minIncrement;
        }

        // Calculate order of magnitude
        const orderOfMagnitude = Math.floor(Math.log10(absValue));
        const increment = Math.pow(10, orderOfMagnitude - 1);

        // Ensure we don't go below minimum
        return Math.max(this.minIncrement, increment);
    }

    handleButtonAction(action) {
        const element = $(`#${this.id}`);
        if (!element.length) return false;

        const currentValue = parseFloat(element.val());
        const min = parseFloat(element.attr('min'));
        const max = parseFloat(element.attr('max'));

        let increment = this.calculateIncrement(currentValue);
        if (action === 'increase-large' || action === 'decrease-large') {
            increment *= 10;
        }

        let newValue = currentValue;
        if (action === 'increase' || action === 'increase-large') {
            newValue = Math.min(max, currentValue + increment);
        } else if (action === 'decrease' || action === 'decrease-large') {
            newValue = Math.max(min, currentValue - increment);
        } else if (action === 'reset') {
            newValue = this.defaultValue;
        } else {
            return false;
        }

        if (newValue !== currentValue) {
            element.val(newValue).trigger('input');
            return true;
        }
        return false;
    }

    getValue() {
        const element = $(`#${this.id}`);
        return parseFloat(element.val());
    }

    setValue(value) {
        const element = $(`#${this.id}`);
        element.val(value);
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

        // Set slider attributes from JavaScript (single source of truth)
        // Adaptive sliders use a very small step for smooth adjustment
        element.attr('min', this.min);
        element.attr('max', this.max);
        element.attr('step', this.minIncrement);

        // Set initial value (will be overridden by restoreFromSettings if settings exist)
        this.setValue(this.defaultValue);

        element.on('input', () => {
            const value = this.getValue();
            this.updateDisplay(value);
            if (this.onChange) this.onChange(value);
            if (callback) callback();
        });
    }
}

/**
 * Timestep slider control with custom increment buttons
 * Has --, -, +, ++ buttons with different increment sizes
 */
export class TimestepControl extends Control {
    constructor(id, defaultValue, options = {}) {
        super(id, defaultValue, options);
        this.min = options.min || 0.001;
        this.max = options.max || 2.5;
        this.step = options.step || 0.001;
        this.smallIncrement = options.smallIncrement || 0.001;  // - and + buttons
        this.largeIncrement = options.largeIncrement || 0.01;   // -- and ++ buttons
        this.displayId = options.displayId || null;
        this.displayFormat = options.displayFormat || (v => v.toFixed(3));
    }

    getValue() {
        const element = $(`#${this.id}`);
        return parseFloat(element.val());
    }

    setValue(value) {
        const element = $(`#${this.id}`);
        element.val(value);
        this.updateDisplay(value);
    }

    updateDisplay(value) {
        if (this.displayId) {
            $(`#${this.displayId}`).text(this.displayFormat(value));
        }
    }

    handleButtonAction(action) {
        const element = $(`#${this.id}`);
        if (!element.length) return false;

        const currentValue = parseFloat(element.val());
        const min = parseFloat(element.attr('min'));
        const max = parseFloat(element.attr('max'));

        let increment;
        if (action === 'increase' || action === 'decrease') {
            increment = this.smallIncrement;
        } else if (action === 'increase-large' || action === 'decrease-large') {
            increment = this.largeIncrement;
        } else if (action === 'reset') {
            const newValue = this.defaultValue;
            if (newValue !== currentValue) {
                element.val(newValue).trigger('input');
                return true;
            }
            return false;
        } else {
            return false;
        }

        let newValue = currentValue;
        if (action === 'increase' || action === 'increase-large') {
            newValue = Math.min(max, currentValue + increment);
        } else if (action === 'decrease' || action === 'decrease-large') {
            newValue = Math.max(min, currentValue - increment);
        }

        if (newValue !== currentValue) {
            element.val(newValue).trigger('input');
            return true;
        }
        return false;
    }

    attachListeners(callback) {
        const element = $(`#${this.id}`);
        this.element = element;

        // Set slider attributes from JavaScript (single source of truth)
        element.attr('min', this.min);
        element.attr('max', this.max);
        element.attr('step', this.step);

        // Set initial value (will be overridden by restoreFromSettings if settings exist)
        this.setValue(this.defaultValue);

        element.on('input', () => {
            const value = this.getValue();
            this.updateDisplay(value);
            if (this.onChange) this.onChange(value);
            if (callback) callback();
        });
    }
}
/**
 * Animatable Slider Control
 * Extends SliderControl with animation bounds that interpolate with alpha
 */
export class AnimatableSliderControl extends SliderControl {
    constructor(id, defaultValue, options = {}) {
        super(id, defaultValue, options);

        // Animation state
        this.animationEnabled = false;
        this.animationMin = options.animationMin !== undefined ? options.animationMin : this.transform(this.min);
        this.animationMax = options.animationMax !== undefined ? options.animationMax : this.transform(this.max);
        this.currentAlpha = 0.0;
    }

    /**
     * Enable/disable animation for this control
     */
    setAnimationEnabled(enabled) {
        this.animationEnabled = enabled;
        this.updateAnimationUI();
    }

    /**
     * Set animation bounds
     */
    setAnimationBounds(min, max) {
        this.animationMin = min;
        this.animationMax = max;
    }

    /**
     * Update value based on current alpha (0.0 to 1.0)
     */
    updateFromAlpha(alpha) {
        if (!this.animationEnabled) return;

        this.currentAlpha = alpha;
        const value = this.animationMin + alpha * (this.animationMax - this.animationMin);
        this.setValue(value);

        // Update the main slider visual state
        const element = $(`#${this.id}`);
        element.addClass('animating');
    }

    /**
     * Update the UI to show/hide animation controls
     */
    updateAnimationUI() {
        const boundsContainer = $(`#${this.id}-animation-bounds`);
        const slider = $(`#${this.id}`);
        const animBtn = $(`#${this.id}-anim-btn`);

        if (this.animationEnabled) {
            boundsContainer.slideDown(200);
            slider.addClass('animating');
            animBtn.addClass('active');
            animBtn.attr('title', 'Disable animation');
        } else {
            boundsContainer.slideUp(200);
            slider.removeClass('animating');
            animBtn.removeClass('active');
            animBtn.attr('title', 'Enable animation');
        }
    }

    /**
     * Override attach listeners to add animation controls
     */
    attachListeners(callback) {
        // Call parent to attach basic slider listeners
        super.attachListeners(callback);

        const element = $(`#${this.id}`);
        const container = element.closest('.slider-control');

        // Add animation button
        const animBtn = $('<button>')
            .attr('id', `${this.id}-anim-btn`)
            .addClass('slider-btn anim-btn')
            .attr('title', 'Enable animation')
            .html('🎬')
            .on('click', (e) => {
                e.stopPropagation();
                this.setAnimationEnabled(!this.animationEnabled);
            });

        container.append(animBtn);

        // Add animation bounds container (initially hidden)
        const boundsHTML = `
            <div id="${this.id}-animation-bounds" class="animation-bounds" style="display: none;">
                <div class="bounds-row">
                    <label>Min: <input type="number" id="${this.id}-anim-min" step="any" value="${this.animationMin}"/></label>
                    <label>Max: <input type="number" id="${this.id}-anim-max" step="any" value="${this.animationMax}"/></label>
                </div>
            </div>
        `;
        container.after(boundsHTML);

        // Attach listeners to bound inputs
        $(`#${this.id}-anim-min`).on('input', () => {
            this.animationMin = parseFloat($(`#${this.id}-anim-min`).val());
        });

        $(`#${this.id}-anim-max`).on('input', () => {
            this.animationMax = parseFloat($(`#${this.id}-anim-max`).val());
        });
    }

    /**
     * Save animation state to settings
     */
    saveToSettings(settings) {
        super.saveToSettings(settings);

        if (this.animationEnabled) {
            if (!settings.animations) settings.animations = {};
            settings.animations[this.settingsKey] = {
                enabled: true,
                min: this.animationMin,
                max: this.animationMax
            };
        }
    }

    /**
     * Restore animation state from settings
     */
    restoreFromSettings(settings) {
        super.restoreFromSettings(settings);

        if (settings.animations && settings.animations[this.settingsKey]) {
            const animData = settings.animations[this.settingsKey];
            this.animationEnabled = animData.enabled || false;
            this.animationMin = animData.min;
            this.animationMax = animData.max;

            // Update UI inputs
            $(`#${this.id}-anim-min`).val(this.animationMin);
            $(`#${this.id}-anim-max`).val(this.animationMax);

            this.updateAnimationUI();
        }
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
        this.renderer = options.renderer || null; // Renderer instance for coordinate system handling
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
        // Handle coordinate system first (if present in settings and dimensions match)
        if (settings.coordinateSystem && settings.dimensions) {
            try {
                const coordSystemData = settings.coordinateSystem;
                const coordinateSystem = CoordinateSystem.fromJSON(coordSystemData);

                // Validate that coordinate system dimensions match settings dimensions
                if (coordinateSystem.dimensions === settings.dimensions) {
                    if (this.renderer) {
                        this.renderer.coordinateSystem = coordinateSystem;
                    }

                    // Update dimension inputs UI to reflect coordinate variables
                    const expressionsControl = this.get('dimension-inputs');
                    if (expressionsControl && expressionsControl.setCoordinateSystem) {
                        expressionsControl.setCoordinateSystem(coordinateSystem, false);
                    }
                }
            } catch (error) {
                console.error('Failed to restore coordinate system from settings:', error);
            }
        }

        // First, restore all values
        for (const control of this.controls.values()) {
            control.restoreFromSettings(settings);
        }

        // Then, trigger onChange callbacks to update dependent controls
        // This ensures all controls are in their correct state before triggering changes
        for (const control of this.controls.values()) {
            if (control.onChange && settings && settings[control.settingsKey] !== undefined) {
                control.onChange(control.getValue());
            }
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
