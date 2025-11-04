/**
 * Custom control classes for complex UI controls
 * Extends the base Control class for specialized behaviors
 */

import { Control } from './control-base.js';

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

        const container = $('#dimension-inputs');
        if (container.length === 0) {
            console.error('Could not find #dimension-inputs element');
            return;
        }

        // Determine what values to use
        let valuesToUse;
        if (newValues && Array.isArray(newValues)) {
            // Use provided new values
            valuesToUse = newValues;
        } else {
            // Get current values before clearing (check if elements exist first)
            const firstElement = $(`#expr-0`);
            valuesToUse = firstElement.length > 0 ? this.getValue() : this.defaultValue;
        }

        // Clear and rebuild
        container.empty();

        for (let i = 0; i < dimensions; i++) {
            const varName = this.varNames[i];
            const defaultValue = valuesToUse[i] || this.defaultValue[i] || '0';

            const div = $('<div class="dimension-input"></div>');
            div.append(`<label>d${varName}/dt =</label>`);
            div.append(`<input type="text" id="expr-${i}" value="${defaultValue}">`);

            container.append(div);
        }

        // Reattach listeners to new inputs
        this.attachInputListeners();
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
