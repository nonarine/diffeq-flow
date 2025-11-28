/**
 * Custom control classes for complex UI controls (Version 2)
 * Refactored to eliminate duplication with transform parameter definitions
 */

import { Control, CheckboxControl } from './control-base.js';
import { ParameterControl, AnimatableParameterControl } from './parameter-control.js';
import { getTransform } from '../math/transforms.js';
import { logger } from '../utils/debug-logger.js';
import { resizeAccordion } from './accordion-utils.js';

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
        this.coordinateSystem = null; // Current coordinate system
    }

    /**
     * Set reference to dimensions control (needed to know how many inputs to create)
     */
    setDimensionsControl(dimensionsControl) {
        this.dimensionsControl = dimensionsControl;
    }

    /**
     * Update coordinate system and refresh variable labels
     * @param {CoordinateSystem} coordinateSystem - The new coordinate system
     * @param {boolean} updateUI - Whether to refresh the UI (default: true)
     */
    setCoordinateSystem(coordinateSystem, updateUI = true) {
        this.coordinateSystem = coordinateSystem;

        // Update varNames from coordinate system
        if (coordinateSystem && coordinateSystem.getDisplayLabels) {
            this.varNames = coordinateSystem.getDisplayLabels();
        } else {
            // Fallback to Cartesian
            this.varNames = ['x', 'y', 'z', 'w', 'u', 'v'];
        }

        // Refresh the inputs with new labels (preserve current values)
        // Skip during initialization to avoid overwriting saved values
        if (updateUI) {
            this.updateInputs();
        }
    }

    /**
     * Get current dimension count
     */
    getDimensions() {
        if (this.dimensionsControl) {
            return this.dimensionsControl.getValue();
        }
        // Get from web component
        const dimensionsEl = document.getElementById('dimensions');
        if (dimensionsEl && dimensionsEl.getValue) {
            return dimensionsEl.getValue();
        }
        return 2;
    }

    /**
     * Get current expression values
     */
    getValue() {
        const dimensions = this.getDimensions();
        const expressions = [];
        for (let i = 0; i < dimensions; i++) {
            const value = $(`#expr-${i}`).val();
            let expr = value ? value.trim() : '0';

            // Convert Unicode symbols to ASCII (θ → theta, φ → phi, etc.)
            if (expr && window.UnicodeAutocomplete && window.UnicodeAutocomplete.unicodeToAscii) {
                expr = window.UnicodeAutocomplete.unicodeToAscii(expr);
            }

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
            // Get current values before clearing - read ALL existing inputs, not just current dimension count
            const firstElement = $(`#expr-0`);
            logger.verbose('firstElement exists:', firstElement.length > 0);
            try {
                if (firstElement.length > 0) {
                    // Read all existing expression inputs (find max index)
                    const existingValues = [];
                    let i = 0;
                    while ($(`#expr-${i}`).length > 0) {
                        const value = $(`#expr-${i}`).val();
                        existingValues.push(value ? value.trim() : '0');
                        i++;
                    }
                    valuesToUse = existingValues;
                    logger.verbose('Got current values from existing inputs:', valuesToUse);
                } else {
                    valuesToUse = this.defaultValue;
                    logger.verbose('Using defaultValue');
                }
            } catch (error) {
                logger.error('Error getting values:', error);
                valuesToUse = this.defaultValue;
            }
        }

        // Pad valuesToUse to match new dimensions if needed
        // This preserves existing values when increasing dimensions
        if (valuesToUse.length < dimensions) {
            const padded = [...valuesToUse];
            for (let i = valuesToUse.length; i < dimensions; i++) {
                padded[i] = '0'; // Use '0' for new dimensions
            }
            valuesToUse = padded;
            logger.verbose('Padded values to match dimensions:', valuesToUse);
        }

        logger.verbose('Values to use:', valuesToUse);

        // Clear and rebuild
        container.empty();
        logger.verbose('Container emptied, now creating', dimensions, 'inputs');

        for (let i = 0; i < dimensions; i++) {
            // Use fallback variable names if coordinate system hasn't updated yet
            const fallbackVarNames = ['x', 'y', 'z', 'w', 'u', 'v'];
            const varName = this.varNames[i] || fallbackVarNames[i] || `v${i}`;
            const defaultValue = valuesToUse[i] || '0';

            const div = $('<div class="dimension-input"></div>');
            div.append(`<label>d${varName}/dt =</label>`);
            div.append(`<input type="text" id="expr-${i}" value="${defaultValue}">`);

            container.append(div);
            logger.verbose('Created input', i, 'with value:', defaultValue);
        }

        logger.verbose('All inputs created, container now has', container.children().length, 'children');

        // Reattach listeners to new inputs
        this.attachInputListeners();

        // Attach unicode autocomplete to expression inputs
        if (window.unicodeAutocomplete) {
            window.unicodeAutocomplete.attachToAll('[id^="expr-"]');
        }

        // Update accordion height to accommodate new inputs
        this.updateAccordionHeight();
    }

    /**
     * Update accordion section height to fit content
     */
    updateAccordionHeight() {
        resizeAccordion('#dimension-inputs', 0);
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
        const { mapper } = this.getContext();

        if (mapper === 'custom') {
            const horizontalElement = $('#mapper-horizontal-expr');
            const verticalElement = $('#mapper-vertical-expr');
            const depthElement = $('#mapper-depth-expr');

            if (horizontalElement.length && verticalElement.length) {
                return {
                    horizontalExpr: horizontalElement.val() || 'x',
                    verticalExpr: verticalElement.val() || 'y',
                    depthExpr: depthElement.val() || ''
                };
            }
            return this.currentParams || { horizontalExpr: 'x', verticalExpr: 'y', depthExpr: '' };
        }

        const dim1Element = $('#mapper-dim1');
        const dim2Element = $('#mapper-dim2');

        if (dim1Element.length && dim2Element.length) {
            const dim1 = parseInt(dim1Element.val());
            const dim2 = parseInt(dim2Element.val());

            // Validate dimensions are valid numbers
            if (isNaN(dim1) || isNaN(dim2)) {
                console.warn('Invalid mapper dimensions, using defaults');
                return this.defaultValue;
            }

            return { dim1, dim2 };
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

        } else if (mapper === 'custom') {
            const varNames = this.varNames.slice(0, dimensions).join(', ');

            // Horizontal expression
            const group1 = $('<div class="control-group"></div>');
            group1.append(`<label>Horizontal (X):</label>`);
            const currentHorizontal = this.currentParams?.horizontalExpr || 'x';
            const input1 = $(`<input type="text" id="mapper-horizontal-expr" value="${currentHorizontal}" placeholder="e.g., sin(x) + sin(y)" style="font-family: monospace; width: 100%;" />`);
            group1.append(input1);
            container.append(group1);

            // Vertical expression
            const group2 = $('<div class="control-group"></div>');
            group2.append(`<label>Vertical (Y):</label>`);
            const currentVertical = this.currentParams?.verticalExpr || 'y';
            const input2 = $(`<input type="text" id="mapper-vertical-expr" value="${currentVertical}" placeholder="e.g., -cos(x) - cos(y)" style="font-family: monospace; width: 100%;" />`);
            group2.append(input2);
            container.append(group2);

            // Depth expression (optional)
            const group3 = $('<div class="control-group"></div>');
            group3.append(`<label>Depth (Z, optional):</label>`);
            const currentDepth = this.currentParams?.depthExpr || '';
            const input3 = $(`<input type="text" id="mapper-depth-expr" value="${currentDepth}" placeholder="optional, e.g., z" style="font-family: monospace; width: 100%;" />`);
            group3.append(input3);
            container.append(group3);

            const info = $('<div class="info">Define math expressions using variables: ' + varNames + '. Functions: sin, cos, tan, exp, log, sqrt, abs, etc.</div>');
            container.append(info);

            // Attach change listeners
            this.attachCustomListener();
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
     * Attach listeners to custom mapper text inputs
     */
    attachCustomListener() {
        const callback = this.onChangeCallback;

        // Remove old listeners
        $(document).off('input', '#mapper-horizontal-expr, #mapper-vertical-expr, #mapper-depth-expr');

        // Add new listeners
        $('#mapper-horizontal-expr, #mapper-vertical-expr, #mapper-depth-expr').on('input', () => {
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
 *
 * REFACTORED VERSION: No longer duplicates parameter definitions!
 * - Reads parameters from transform's getParameters() method (single source of truth)
 * - Uses ParameterControl instances for rendering and value management
 * - Eliminates ~200 lines of duplicate code
 */
export class TransformParamsControl extends Control {
    constructor(defaultValue, options = {}) {
        super('transform-params', defaultValue, options);
        this.transformControl = null;
        this.currentParams = defaultValue || {};
        this.parameterControls = new Map(); // Maps control ID -> ParameterControl instance
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
        const values = {};

        // Collect values from all parameter controls
        for (const [controlId, paramControl] of this.parameterControls.entries()) {
            const paramName = paramControl.settingsKey;
            values[paramName] = paramControl.getValue();
        }

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
     * Reads parameter definitions directly from the transform instance
     */
    updateControls() {
        const transformType = this.getTransformType();
        const container = $('#transform-controls');

        if (container.length === 0) return;

        // Clear old controls
        container.empty();
        this.parameterControls.clear();

        // Get transform instance
        const transform = getTransform(transformType);
        if (!transform) {
            logger.warn(`Transform not found: ${transformType}`);
            this.updateAccordionHeight();
            return;
        }

        // Get parameter definitions from transform (single source of truth!)
        const paramDefs = transform.getParameters();

        if (paramDefs.length === 0) {
            // No parameters for this transform
            this.updateAccordionHeight();
            return;
        }

        // Create AnimatableParameterControl for each parameter
        paramDefs.forEach((paramDef, index) => {
            const controlId = `transform-param-${index}`;
            const defaultValue = this.currentParams[paramDef.name] ?? paramDef.default;

            // Create animatable parameter control
            const paramControl = new AnimatableParameterControl(
                controlId,
                paramDef,
                defaultValue,
                {
                    settingsKey: paramDef.name, // Use parameter name as settings key
                    onChange: (value) => {
                        this.currentParams[paramDef.name] = value;
                        if (this.onChange) this.onChange(this.currentParams);
                    }
                }
            );

            // Render and append to container
            container.append(paramControl.render());

            // Attach listeners
            paramControl.attachListeners(this.onChangeCallback);

            // Store reference for button handling
            this.parameterControls.set(controlId, paramControl);
        });

        // Update accordion height to accommodate new controls
        this.updateAccordionHeight();
    }

    /**
     * Update accordion section height to fit content
     */
    updateAccordionHeight() {
        resizeAccordion('#transform-controls', 0);
    }

    /**
     * Handle button actions for dynamically created transform parameter sliders
     * Delegates to the appropriate ParameterControl instance
     *
     * @param {string} sliderId - The slider ID (e.g., 'transform-param-0')
     * @param {string} action - The button action
     * @returns {boolean} True if handled
     */
    handleTransformParamButton(sliderId, action) {
        const control = this.parameterControls.get(sliderId);
        if (control) {
            return control.handleButtonAction(action);
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
     * Reset to default value
     */
    reset() {
        this.currentParams = this.defaultValue;
        this.updateControls();
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
