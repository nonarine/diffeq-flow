/**
 * Custom control classes for complex UI controls
 * Extends the base Control class for specialized behaviors
 */

import { Control, CheckboxControl } from './control-base.js';
import { logger } from '../utils/debug-logger.js';

// Transform parameter slider constants (must match transforms.js)
const TRANSFORM_PARAM_MIN = 0.0001;
const TRANSFORM_PARAM_MAX = 100.0;
const TRANSFORM_PARAM_STEP = 0.0001;

/**
 * FloatCheckboxControl - checkbox that outputs 0.0 or 1.0 instead of boolean
 * Useful for shader uniforms that expect floats
 */
export class FloatCheckboxControl extends CheckboxControl {
    constructor(id, defaultValue, options = {}) {
        super(id, defaultValue, options);
    }

    getValue() {
        const checked = super.getValue();
        return checked ? 1.0 : 0.0;
    }

    setValue(value) {
        // Accept both boolean and numeric values
        const checked = (typeof value === 'number') ? (value > 0.5) : value;
        super.setValue(checked);
    }
}

/**
 * DimensionInputsControl - manages dynamic expression inputs
 * Creates/destroys input fields based on dimension count
 */
export class DimensionInputsControl extends Control {
    constructor(defaultValue, options = {}) {
        super('dimension-inputs', defaultValue, options);
        this.dimensionsControl = null; // Will be set to the dimensions control
        this.varNames = ['x', 'y', 'z', 'w', 'u', 'v'];
    }

    /**
     * Set reference to dimensions control (needed to know how many inputs to create)
     */
    setDimensionsControl(dimensionsControl) {
        this.dimensionsControl = dimensionsControl;
    }

    /**
     * Get current dimension count
     */
    getDimensions() {
        if (this.dimensionsControl) {
            return this.dimensionsControl.getValue();
        }
        return parseInt($('#dimensions').val()) || 2;
    }

    /**
     * Get current expression values
     */
    getValue() {
        const dimensions = this.getDimensions();
        const expressions = [];
        for (let i = 0; i < dimensions; i++) {
            const expr = $(`#expr-${i}`).val().trim();
            expressions.push(expr || '0');
        }
        return expressions;
    }

    /**
     * Set expression values
     */
    setValue(expressions) {
        if (!Array.isArray(expressions)) return;

        // Ensure we have the right number of inputs first, passing the new values
        this.updateInputs(expressions.length, expressions);
    }

    /**
     * Update dimension inputs based on current dimension count
     * @param {number|null} dimensions - Number of dimensions (null = use current)
     * @param {Array|null} newValues - Optional new values to set (overrides current values)
     */
    updateInputs(dimensions = null, newValues = null) {
        if (dimensions === null) {
            dimensions = this.getDimensions();
        }

        logger.verbose('updateInputs called with dimensions:', dimensions);

        const container = $('#dimension-inputs');
        logger.verbose('Container found:', container.length);
        if (container.length === 0) {
            logger.error('Could not find #dimension-inputs element');
            return;
        }

        // Determine what values to use
        let valuesToUse;
        if (newValues && Array.isArray(newValues)) {
            // Use provided new values
            valuesToUse = newValues;
            logger.verbose('Using provided newValues');
        } else {
            // Get current values before clearing (check if elements exist first)
            const firstElement = $(`#expr-0`);
            logger.verbose('firstElement exists:', firstElement.length > 0);
            try {
                if (firstElement.length > 0) {
                    valuesToUse = this.getValue();
                    logger.verbose('Got current values from getValue()');
                } else {
                    valuesToUse = this.defaultValue;
                    logger.verbose('Using defaultValue');
                }
            } catch (error) {
                logger.error('Error getting values:', error);
                valuesToUse = this.defaultValue;
            }
        }

        logger.verbose('Values to use:', valuesToUse);

        // Clear and rebuild
        container.empty();
        logger.verbose('Container emptied, now creating', dimensions, 'inputs');

        for (let i = 0; i < dimensions; i++) {
            const varName = this.varNames[i];
            const defaultValue = valuesToUse[i] || this.defaultValue[i] || '0';

            const div = $('<div class="dimension-input"></div>');
            div.append(`<label>d${varName}/dt =</label>`);
            div.append(`<input type="text" id="expr-${i}" value="${defaultValue}">`);

            container.append(div);
            logger.verbose('Created input', i, 'with value:', defaultValue);
        }

        logger.verbose('All inputs created, container now has', container.children().length, 'children');

        // Reattach listeners to new inputs
        this.attachInputListeners();

        // Update accordion height to accommodate new inputs
        this.updateAccordionHeight();
    }

    /**
     * Update accordion section height to fit content
     */
    updateAccordionHeight() {
        // Use setTimeout to allow DOM to update first
        setTimeout(() => {
            const $accordionSection = $('#dimension-inputs').closest('.accordion-section');
            if ($accordionSection.length && !$accordionSection.hasClass('collapsed')) {
                // Recalculate and update max-height
                $accordionSection.css('max-height', $accordionSection[0].scrollHeight + 'px');
            }
        }, 0);
    }

    /**
     * Attach listeners to expression inputs
     */
    attachInputListeners() {
        const callback = this.onChangeCallback;

        // Remove old listeners
        $(document).off('input', '[id^="expr-"]');

        // Add new listeners
        $(document).on('input', '[id^="expr-"]', () => {
            if (this.onChange) this.onChange(this.getValue());
            if (callback) callback();
        });
    }

    /**
     * Attach event listeners
     */
    attachListeners(callback) {
        this.onChangeCallback = callback;

        // Initial setup
        this.updateInputs();

        // Attach input listeners
        this.attachInputListeners();

        // Listen for dimension changes (will be called externally)
        // The dimensions control will call updateInputs() via onChange
    }

    /**
     * Reset to default value
     */
    reset() {
        this.setValue(this.defaultValue);
    }
}

/**
 * MapperParamsControl - manages mapper dimension selectors
 * Creates dropdowns for selecting which dimensions to display
 */
export class MapperParamsControl extends Control {
    constructor(defaultValue, options = {}) {
        super('mapper-params', defaultValue, options);
        this.dimensionsControl = null;
        this.mapperControl = null;
        this.varNames = ['x', 'y', 'z', 'w', 'u', 'v'];
    }

    /**
     * Set references to related controls
     */
    setRelatedControls(dimensionsControl, mapperControl) {
        this.dimensionsControl = dimensionsControl;
        this.mapperControl = mapperControl;
    }

    /**
     * Get current dimensions and mapper type
     */
    getContext() {
        const dimensions = this.dimensionsControl ? this.dimensionsControl.getValue() : 2;
        const mapper = this.mapperControl ? this.mapperControl.getValue() : 'select';
        return { dimensions, mapper };
    }

    /**
     * Get current mapper params
     */
    getValue() {
        const dim1Element = $('#mapper-dim1');
        const dim2Element = $('#mapper-dim2');

        if (dim1Element.length && dim2Element.length) {
            return {
                dim1: parseInt(dim1Element.val()),
                dim2: parseInt(dim2Element.val())
            };
        }

        // Return default if elements don't exist yet
        return this.defaultValue;
    }

    /**
     * Set mapper params
     */
    setValue(params) {
        // Update controls will recreate the dropdowns with these values
        this.currentParams = params;
        this.updateControls();
    }

    /**
     * Update mapper controls based on mapper type and dimensions
     */
    updateControls() {
        const { dimensions, mapper } = this.getContext();
        const container = $('#mapper-controls');

        if (container.length === 0) return;

        container.empty();

        if (mapper === 'select') {
            const row = $('<div class="control-row"></div>');

            // Horizontal dimension selector
            const group1 = $('<div class="control-group" style="flex: 1;"></div>');
            group1.append(`<label>Horizontal</label>`);

            const select1 = $('<select id="mapper-dim1"></select>');
            const currentDim1 = this.currentParams ? this.currentParams.dim1 : this.defaultValue.dim1;

            for (let i = 0; i < dimensions; i++) {
                const selected = i === currentDim1 ? 'selected' : '';
                select1.append(`<option value="${i}" ${selected}>${this.varNames[i]}</option>`);
            }
            group1.append(select1);

            // Vertical dimension selector
            const group2 = $('<div class="control-group" style="flex: 1;"></div>');
            group2.append(`<label>Vertical</label>`);

            const select2 = $('<select id="mapper-dim2"></select>');
            const currentDim2 = this.currentParams ? this.currentParams.dim2 : this.defaultValue.dim2;

            for (let i = 0; i < dimensions; i++) {
                const selected = i === currentDim2 ? 'selected' : '';
                select2.append(`<option value="${i}" ${selected}>${this.varNames[i]}</option>`);
            }
            group2.append(select2);

            row.append(group1);
            row.append(group2);
            container.append(row);

            // Attach change listeners
            this.attachSelectListeners();

        } else if (mapper === 'project') {
            const info = $('<div class="info">Linear projection uses default 2D projection</div>');
            container.append(info);
        }
    }

    /**
     * Attach listeners to mapper dimension selectors
     */
    attachSelectListeners() {
        const callback = this.onChangeCallback;

        // Remove old listeners
        $(document).off('change', '#mapper-dim1, #mapper-dim2');

        // Add new listeners
        $('#mapper-dim1, #mapper-dim2').on('change', () => {
            this.currentParams = this.getValue();
            if (this.onChange) this.onChange(this.currentParams);
            if (callback) callback();
        });
    }

    /**
     * Attach event listeners
     */
    attachListeners(callback) {
        this.onChangeCallback = callback;
        this.currentParams = this.defaultValue;

        // Initial setup
        this.updateControls();
    }

    /**
     * Reset to default value
     */
    reset() {
        this.currentParams = this.defaultValue;
        this.updateControls();
    }
}

/**
 * GradientControl - integrates with existing gradient editor
 * Wraps the gradient editor for use with ControlManager
 */
export class GradientControl extends Control {
    constructor(defaultValue, options = {}) {
        super('color-gradient', defaultValue, options);
        this.gradientEditor = null;
    }

    /**
     * Set reference to gradient editor instance
     */
    setGradientEditor(gradientEditor) {
        this.gradientEditor = gradientEditor;
    }

    /**
     * Get current gradient
     */
    getValue() {
        if (this.gradientEditor && this.gradientEditor.getGradient) {
            return this.gradientEditor.getGradient();
        }
        // Return stored value if editor not available
        return this.currentGradient || this.defaultValue;
    }

    /**
     * Set gradient value
     */
    setValue(gradient) {
        this.currentGradient = gradient;
        if (this.gradientEditor && this.gradientEditor.setGradient) {
            this.gradientEditor.setGradient(gradient);
        }
    }

    /**
     * Attach event listeners
     */
    attachListeners(callback) {
        // Gradient editor has its own onChange handler
        // We'll set this up when the editor is initialized
        this.onChangeCallback = callback;
    }

    /**
     * Called when gradient editor changes
     */
    notifyChange(newGradient) {
        this.currentGradient = newGradient;
        if (this.onChange) this.onChange(newGradient);
        if (this.onChangeCallback) this.onChangeCallback();
    }

    /**
     * Reset to default gradient
     */
    reset() {
        this.setValue(this.defaultValue);
    }

    /**
     * Save to settings
     */
    saveToSettings(settings) {
        settings[this.settingsKey] = this.getValue();
    }

    /**
     * Restore from settings
     */
    restoreFromSettings(settings) {
        if (settings && settings[this.settingsKey] !== undefined) {
            this.setValue(settings[this.settingsKey]);
        }
    }
}

/**
 * TransformParamsControl - manages transform parameter sliders
 * Creates dynamic controls based on the selected transform type
 */
export class TransformParamsControl extends Control {
    constructor(defaultValue, options = {}) {
        super('transform-params', defaultValue, options);
        this.transformControl = null;
        this.currentParams = defaultValue || {};

        // Transform parameter definitions (matches transforms.js)
        this.transformParams = {
            identity: [],
            power: [
                { name: 'alpha', label: 'Exponent (α)', min: TRANSFORM_PARAM_MIN, max: TRANSFORM_PARAM_MAX, step: TRANSFORM_PARAM_STEP, default: 0.5,
                  info: 'α < 1.0: zoom into origin; α > 1.0: compress origin' }
            ],
            log: [],  // No parameters - stretches near zero automatically
            exp: [
                { name: 'alpha', label: 'Growth Rate (α)', min: TRANSFORM_PARAM_MIN, max: TRANSFORM_PARAM_MAX, step: TRANSFORM_PARAM_STEP, default: 0.5,
                  info: 'Higher α = stronger exponential growth. Use small values (0.1-0.5) to avoid overflow.' }
            ],
            softsign: [],  // No parameters - simple compression to [-1,1]
            tanh: [
                { name: 'beta', label: 'Compression (β)', min: TRANSFORM_PARAM_MIN, max: TRANSFORM_PARAM_MAX, step: TRANSFORM_PARAM_STEP, default: 1.0,
                  info: 'Higher = more compression. Maps infinite space to [-1,1]' }
            ],
            sigmoid: [
                { name: 'k', label: 'Steepness (k)', min: TRANSFORM_PARAM_MIN, max: TRANSFORM_PARAM_MAX, step: TRANSFORM_PARAM_STEP, default: 1.0,
                  info: 'Higher = steeper transition. Maps infinite space to [-1,1] with logistic curve.' }
            ],
            rational: [
                { name: 'a', label: 'Width (a)', min: TRANSFORM_PARAM_MIN, max: TRANSFORM_PARAM_MAX, step: TRANSFORM_PARAM_STEP, default: 1.0,
                  info: 'Controls bell curve width. Higher = wider/shallower, lower = narrower/sharper. T(x) = x/√(x²+a), J = a/(x²+a)^(3/2)' }
            ],
            sine: [
                { name: 'amplitude', label: 'Amplitude', min: TRANSFORM_PARAM_MIN, max: TRANSFORM_PARAM_MAX, step: TRANSFORM_PARAM_STEP, default: 0.5,
                  info: 'Strength of distortion' },
                { name: 'frequency', label: 'Frequency', min: TRANSFORM_PARAM_MIN, max: TRANSFORM_PARAM_MAX, step: TRANSFORM_PARAM_STEP, default: 1.0,
                  info: 'Number of waves per unit length' }
            ],
            radial_power: [
                { name: 'alpha', label: 'Radial Exponent (α)', min: TRANSFORM_PARAM_MIN, max: TRANSFORM_PARAM_MAX, step: TRANSFORM_PARAM_STEP, default: 0.5,
                  info: 'α < 1.0: zoom into origin; α > 1.0: compress origin' }
            ],
            custom: []
        };
    }

    /**
     * Set reference to transform control
     */
    setTransformControl(transformControl) {
        this.transformControl = transformControl;
    }

    /**
     * Get current transform type
     */
    getTransformType() {
        return this.transformControl ? this.transformControl.getValue() : 'identity';
    }

    /**
     * Get current parameter values
     */
    getValue() {
        const transformType = this.getTransformType();
        const params = this.transformParams[transformType] || [];
        const values = {};

        params.forEach((param, index) => {
            const element = $(`#transform-param-${index}`);
            if (element.length) {
                values[param.name] = parseFloat(element.val());
            } else {
                values[param.name] = param.default;
            }
        });

        return values;
    }

    /**
     * Set parameter values
     */
    setValue(params) {
        this.currentParams = params || {};
        this.updateControls();
    }

    /**
     * Update transform parameter controls based on transform type
     */
    updateControls() {
        const transformType = this.getTransformType();
        const container = $('#transform-controls');

        if (container.length === 0) return;

        container.empty();

        const params = this.transformParams[transformType] || [];

        if (params.length === 0) {
            // No parameters for this transform
            // Update accordion height even when removing controls
            this.updateAccordionHeight();
            return;
        }

        params.forEach((param, index) => {
            const currentValue = this.currentParams[param.name] !== undefined
                ? this.currentParams[param.name]
                : param.default;

            const group = $('<div class="control-group"></div>');

            // Format value in scientific notation
            const formatScientific = (v) => {
                if (Math.abs(v) >= 10 || Math.abs(v) < 0.1) {
                    return v.toExponential(2);
                } else {
                    return v.toFixed(3);
                }
            };

            // Label with value display
            group.append(`
                <label>${param.label}: <span class="range-value" id="transform-param-${index}-value">${formatScientific(currentValue)}</span></label>
            `);

            // Slider with +/- buttons (adaptive increment)
            const sliderControl = $('<div class="slider-control"></div>');
            sliderControl.append(`
                <button class="slider-btn" data-slider="transform-param-${index}" data-action="decrease-large">--</button>
                <button class="slider-btn" data-slider="transform-param-${index}" data-action="decrease">-</button>
                <input type="range" id="transform-param-${index}">
                <button class="slider-btn" data-slider="transform-param-${index}" data-action="increase">+</button>
                <button class="slider-btn" data-slider="transform-param-${index}" data-action="increase-large">++</button>
            `);

            group.append(sliderControl);

            // Info text
            if (param.info) {
                group.append(`<div class="info">${param.info}</div>`);
            }

            // Append to container FIRST so element is in DOM
            container.append(group);

            // THEN set slider attributes (must set min/max BEFORE value)
            const $slider = $(`#transform-param-${index}`);
            $slider.attr('min', param.min);
            $slider.attr('max', param.max);
            $slider.attr('step', 0.0001); // Very small step for smooth adjustment
            $slider.val(currentValue); // Set value AFTER min/max to avoid normalization issues
        });

        // Update value displays
        params.forEach((param, index) => {
            const value = this.currentParams[param.name] !== undefined
                ? this.currentParams[param.name]
                : param.default;
            const formatScientific = (v) => {
                if (Math.abs(v) >= 10 || Math.abs(v) < 0.1) {
                    return v.toExponential(2);
                } else {
                    return v.toFixed(3);
                }
            };
            $(`#transform-param-${index}-value`).text(formatScientific(value));
        });

        // Attach change listeners
        this.attachParamListeners();

        // Update accordion height to accommodate new controls
        this.updateAccordionHeight();
    }

    /**
     * Update accordion section height to fit content
     */
    updateAccordionHeight() {
        // Use setTimeout to allow DOM to update first
        setTimeout(() => {
            // Find the accordion section containing transform controls
            const $accordionSection = $('#transform-controls').closest('.accordion-section');
            if ($accordionSection.length && !$accordionSection.hasClass('collapsed')) {
                // Recalculate and update max-height
                $accordionSection.css('max-height', $accordionSection[0].scrollHeight + 'px');
            }
        }, 0);
    }

    /**
     * Attach listeners to parameter sliders
     */
    attachParamListeners() {
        const callback = this.onChangeCallback;
        const transformType = this.getTransformType();
        const params = this.transformParams[transformType] || [];

        // Remove old listeners
        $(document).off('input change', '[id^="transform-param-"]');

        // Add slider input listeners
        params.forEach((param, index) => {
            $(`#transform-param-${index}`).on('input', (e) => {
                const value = parseFloat(e.target.value);

                const formatScientific = (v) => {
                    if (Math.abs(v) >= 10 || Math.abs(v) < 0.1) {
                        return v.toExponential(2);
                    } else {
                        return v.toFixed(3);
                    }
                };

                $(`#transform-param-${index}-value`).text(formatScientific(value));
                this.currentParams[param.name] = value;
                if (this.onChange) this.onChange(this.currentParams);
                if (callback) callback();
            });
        });

        // Note: Button handlers are managed by the global .slider-btn handler
        // which dispatches to handleButtonAction() for adaptive increments
    }

    /**
     * Handle button actions for dynamically created transform parameter sliders
     * @param {string} sliderId - The slider ID (e.g., 'transform-param-0')
     * @param {string} action - The button action
     * @returns {boolean} True if handled
     */
    handleTransformParamButton(sliderId, action) {
        const slider = $(`#${sliderId}`);
        if (!slider.length) return false;

        const currentValue = parseFloat(slider.val());
        const min = parseFloat(slider.attr('min'));
        const max = parseFloat(slider.attr('max'));

        // Calculate adaptive increment (same logic as AdaptiveSliderControl)
        const absValue = Math.abs(currentValue);
        let increment = absValue < 0.0001 ? 0.0001 : Math.pow(10, Math.floor(Math.log10(absValue)) - 1);
        increment = Math.max(0.0001, increment);

        if (action === 'increase-large' || action === 'decrease-large') {
            increment *= 10;
        }

        let newValue = currentValue;
        if (action === 'increase' || action === 'increase-large') {
            newValue = Math.min(max, currentValue + increment);
        } else if (action === 'decrease' || action === 'decrease-large') {
            newValue = Math.max(min, currentValue - increment);
        } else {
            return false;
        }

        if (newValue !== currentValue) {
            slider.val(newValue).trigger('input');
            return true;
        }
        return false;
    }

    /**
     * Attach event listeners
     */
    attachListeners(callback) {
        this.onChangeCallback = callback;

        // Initial setup
        this.updateControls();
    }

    /**
     * Reset to default values
     */
    reset() {
        const transformType = this.getTransformType();
        const params = this.transformParams[transformType] || [];
        const defaults = {};

        params.forEach(param => {
            defaults[param.name] = param.default;
        });

        this.setValue(defaults);
    }
}
