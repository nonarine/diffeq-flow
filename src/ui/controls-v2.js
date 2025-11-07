/**
 * UI controls management using ControlManager system
 * Replaces legacy controls.js with composable control architecture
 */

import {
    ControlManager,
    SliderControl,
    LogSliderControl,
    PercentSliderControl,
    TextControl,
    SelectControl,
    CheckboxControl
} from './control-base.js';
import { DimensionInputsControl, MapperParamsControl, GradientControl, TransformParamsControl } from './custom-controls.js';
import { initGradientEditor } from './gradient-editor.js';
import { getDefaultGradient } from '../math/gradients.js';
import { logger } from '../utils/debug-logger.js';

/**
 * Initialize UI controls with ControlManager
 * @param {Renderer} renderer - The renderer instance
 * @param {Function} callback - Called when initialization is complete
 */
export function initControls(renderer, callback) {
    // Create the control manager
    const manager = new ControlManager({
        storageKey: 'vectorFieldSettings',
        debounceTime: 300,
        onApply: (settings) => {
            try {
                // Transform implicitIterations into integratorParams
                if (settings.implicitIterations !== undefined) {
                    settings.integratorParams = { iterations: settings.implicitIterations };
                }

                // Apply settings directly to renderer
                renderer.updateConfig(settings);

                // Save to localStorage (including bbox for pan/zoom state)
                const settingsToSave = manager.getSettings();
                if (renderer && renderer.bbox) {
                    settingsToSave.bbox = {
                        min: [...renderer.bbox.min],
                        max: [...renderer.bbox.max]
                    };
                }
                localStorage.setItem('vectorFieldSettings', JSON.stringify(settingsToSave));

                // Clear any error messages
                hideError();
            } catch (error) {
                // Show error but keep visualization running with last good config
                showError(error.message);
                logger.error('Failed to apply settings', error);
            }
        }
    });

    // ========================================
    // Register all controls
    // ========================================

    // === Dimension and integration controls ===

    const dimensionsControl = manager.register(new SliderControl('dimensions', 2, {
        min: 2,
        max: 6,
        step: 1,
        displayId: 'dim-value',
        displayFormat: v => v.toFixed(0),
        onChange: (value) => {
            // Update dimension inputs when dimensions change
            const expressionsControl = manager.get('expressions');
            if (expressionsControl) {
                expressionsControl.updateInputs(value);
            }

            // Update mapper controls
            const mapperParamsControl = manager.get('mapperParams');
            if (mapperParamsControl) {
                mapperParamsControl.updateControls();
            }
        }
    }));

    const integratorControl = manager.register(new SelectControl('integrator', 'rk2', {
        settingsKey: 'integratorType',
        onChange: (value) => {
            // Show/hide implicit method controls based on integrator type
            const isImplicit = value.startsWith('implicit-') || value === 'trapezoidal';
            $('#implicit-iterations-group').toggle(isImplicit);
            $('#solution-method-group').toggle(isImplicit);

            // Update accordion height to accommodate shown/hidden controls
            const $accordionSection = $('#integrator').closest('.accordion-section');
            if ($accordionSection.length && !$accordionSection.hasClass('collapsed')) {
                $accordionSection.css('max-height', $accordionSection[0].scrollHeight + 'px');
            }
        }
    }));

    const solutionMethodControl = manager.register(new SelectControl('solution-method', 'fixed-point', {
        settingsKey: 'solutionMethod'
    }));

    const timestepControl = manager.register(new SliderControl('timestep', 0.01, {
        min: 0.001,
        max: 2.5,
        step: 0.01,
        displayId: 'timestep-value',
        displayFormat: v => v.toFixed(4)
    }));

    const implicitIterationsControl = manager.register(new SliderControl('implicit-iterations', 4, {
        settingsKey: 'implicitIterations',
        min: 1,
        max: 10,
        step: 1,
        displayId: 'implicit-iterations-value',
        displayFormat: v => v.toFixed(0)
    }));

    // === Particle controls ===

    const particleCountControl = manager.register(new SliderControl('particles', 1000, {
        settingsKey: 'particleCount',
        min: 100,
        max: 5000000,
        step: 10000,
        displayId: 'particles-value',
        displayFormat: v => v.toFixed(0)
    }));

    const fadeControl = manager.register(new LogSliderControl('fade', 0.999, {
        settingsKey: 'fadeOpacity',
        minValue: 0.9,
        maxValue: 0.9999,
        displayId: 'fade-value',
        displayFormat: v => v.toFixed(4)
    }));

    const dropControl = manager.register(new SliderControl('drop', 0.0, {
        settingsKey: 'dropProbability',
        min: 0,
        max: 0.01,
        step: 0.0001,
        displayId: 'drop-value',
        displayFormat: v => v.toFixed(4)
    }));

    const dropLowVelocityControl = manager.register(new CheckboxControl('drop-low-velocity', false, {
        settingsKey: 'dropLowVelocity'
    }));

    // === Transform controls ===

    const transformControl = manager.register(new SelectControl('transform', 'identity', {
        settingsKey: 'transformType',
        onChange: (value) => {
            // Update transform params UI when transform type changes
            const transformParamsControl = manager.get('transformParams');
            if (transformParamsControl) {
                transformParamsControl.updateControls();
            }
        }
    }));

    const transformParamsControl = manager.register(new TransformParamsControl({}, {
        settingsKey: 'transformParams'
    }));

    // Set up transform params cross-reference
    transformParamsControl.setTransformControl(transformControl);

    // === Mapper controls ===

    const mapperControl = manager.register(new SelectControl('mapper', 'select', {
        settingsKey: 'mapperType',
        onChange: (value) => {
            // Update mapper params UI when mapper type changes
            const mapperParamsControl = manager.get('mapperParams');
            if (mapperParamsControl) {
                mapperParamsControl.updateControls();
            }
        }
    }));

    const mapperParamsControl = manager.register(new MapperParamsControl({ dim1: 0, dim2: 1 }, {
        settingsKey: 'mapperParams'
    }));

    // Set up mapper params cross-references
    mapperParamsControl.setRelatedControls(dimensionsControl, mapperControl);

    // === Color mode controls ===

    const colorModeControl = manager.register(new SelectControl('color-mode', 'white', {
        settingsKey: 'colorMode',
        onChange: (value) => {
            updateExpressionControls(value);
            updateGradientButtonVisibility(value);
            updateVelocityScalingVisibility(value);
        }
    }));

    const colorExpressionControl = manager.register(new TextControl('color-expression', 'x * y', {
        settingsKey: 'colorExpression'
    }));

    const useCustomGradientControl = manager.register(new CheckboxControl('use-custom-gradient', false, {
        settingsKey: 'useCustomGradient'
    }));

    const gradientControl = manager.register(new GradientControl(getDefaultGradient(), {
        settingsKey: 'colorGradient'
    }));

    const velocityScaleModeControl = manager.register(new SelectControl('velocity-scale-mode', 'percentile95', {
        settingsKey: 'velocityScaleMode'
    }));

    const velocityLogScaleControl = manager.register(new CheckboxControl('velocity-log-scale', false, {
        settingsKey: 'velocityLogScale'
    }));

    // === Expression inputs (custom control) ===

    const expressionsControl = manager.register(new DimensionInputsControl(['-y', 'x'], {
        settingsKey: 'expressions'
    }));

    // Set up expressions cross-reference to dimensions
    expressionsControl.setDimensionsControl(dimensionsControl);

    // === HDR and tone mapping controls ===

    const useHDRControl = manager.register(new CheckboxControl('use-hdr', true, {
        settingsKey: 'useHDR'
    }));

    const useDepthTestControl = manager.register(new CheckboxControl('use-depth-test', false, {
        settingsKey: 'useDepthTest'
    }));

    // === Supersampling ===

    const supersampleFactorControl = manager.register(new SliderControl('supersample-factor', 1.0, {
        displayId: 'supersample-factor-value',
        displayFormat: v => v.toFixed(1) + 'x',
        settingsKey: 'supersampleFactor'
    }));

    // === SMAA antialiasing controls ===

    const smaaEnabledControl = manager.register(new CheckboxControl('smaa-enabled', true, {
        settingsKey: 'smaaEnabled'
    }));

    const smaaIntensityControl = manager.register(new PercentSliderControl('smaa-intensity', 0.75, {
        displayId: 'smaa-intensity-value',
        displayFormat: v => v.toFixed(2)
    }));

    const smaaThresholdControl = manager.register(new PercentSliderControl('smaa-threshold', 0.10, {
        displayId: 'smaa-threshold-value',
        displayFormat: v => v.toFixed(2)
    }));

    // === Bilateral filter controls ===

    const bilateralEnabledControl = manager.register(new CheckboxControl('bilateral-enabled', false, {
        settingsKey: 'bilateralEnabled'
    }));

    // Spatial sigma: slider 10-100 → value 0.5-5.0 (divide by 20)
    class BilateralSpatialControl extends SliderControl {
        getValue() {
            const element = $(`#${this.id}`);
            return parseFloat(element.val()) / 20.0;
        }
        setValue(value) {
            const element = $(`#${this.id}`);
            element.val(value * 20.0);
            this.updateDisplay(value);
        }
    }

    const bilateralSpatialControl = manager.register(new BilateralSpatialControl('bilateral-spatial', 4.0, {
        min: 10,
        max: 100,
        step: 1,
        displayId: 'bilateral-spatial-value',
        displayFormat: v => v.toFixed(1),
        settingsKey: 'bilateralSpatialSigma'
    }));

    // Intensity sigma: slider 1-50 → value 0.01-0.5 (divide by 100)
    class BilateralIntensityControl extends SliderControl {
        getValue() {
            const element = $(`#${this.id}`);
            return parseFloat(element.val()) / 100.0;
        }
        setValue(value) {
            const element = $(`#${this.id}`);
            element.val(value * 100.0);
            this.updateDisplay(value);
        }
    }

    const bilateralIntensityControl = manager.register(new BilateralIntensityControl('bilateral-intensity', 0.20, {
        min: 1,
        max: 50,
        step: 0.1,
        displayId: 'bilateral-intensity-value',
        displayFormat: v => v.toFixed(2),
        settingsKey: 'bilateralIntensitySigma'
    }));

    // === Tone mapping controls ===

    const tonemapOperatorControl = manager.register(new SelectControl('tonemap-operator', 'aces', {
        settingsKey: 'tonemapOperator',
        onChange: (value) => {
            updateWhitePointVisibility(value);
        }
    }));

    const exposureControl = manager.register(new LogSliderControl('exposure', 1.0, {
        minValue: 0.0001,
        maxValue: 10.0,
        displayId: 'exposure-value',
        displayFormat: v => v.toFixed(4)
    }));

    const gammaControl = manager.register(new LogSliderControl('gamma', 2.2, {
        minValue: 0.2,
        maxValue: 10.0,
        displayId: 'gamma-value',
        displayFormat: v => v.toFixed(2)
    }));

    const luminanceGammaControl = manager.register(new LogSliderControl('luminance-gamma', 1.0, {
        settingsKey: 'luminanceGamma',
        minValue: 0.2,
        maxValue: 10.0,
        displayId: 'luminance-gamma-value',
        displayFormat: v => v.toFixed(2)
    }));

    const whitePointControl = manager.register(new SliderControl('white-point', 2.0, {
        settingsKey: 'whitePoint',
        min: 1.0,
        max: 10.0,
        step: 0.1,
        displayId: 'white-point-value',
        displayFormat: v => v.toFixed(1)
    }));

    const particleIntensityControl = manager.register(new LogSliderControl('particle-intensity', 1.0, {
        settingsKey: 'particleIntensity',
        minValue: 0.001,
        maxValue: 100.0,
        displayId: 'particle-intensity-value',
        displayFormat: v => v.toFixed(3)
    }));

    const colorSaturationControl = manager.register(new PercentSliderControl('color-saturation', 1.0, {
        settingsKey: 'colorSaturation',
        displayId: 'color-saturation-value',
        displayFormat: v => v.toFixed(2)
    }));

    const brightnessDesatControl = manager.register(new PercentSliderControl('brightness-desat', 0.0, {
        settingsKey: 'brightnessDesaturation',
        displayId: 'brightness-desat-value',
        displayFormat: v => v.toFixed(2)
    }));

    const saturationBuildupControl = manager.register(new PercentSliderControl('saturation-buildup', 0.0, {
        settingsKey: 'brightnessSaturation',
        displayId: 'saturation-buildup-value',
        displayFormat: v => v.toFixed(2)
    }));

    // === Bloom controls (hidden but wired) ===

    const bloomEnabledControl = manager.register(new CheckboxControl('bloom-enabled', false, {
        settingsKey: 'bloomEnabled'
    }));

    const bloomIntensityControl = manager.register(new PercentSliderControl('bloom-intensity', 0.3, {
        settingsKey: 'bloomIntensity',
        min: 0,
        max: 200, // Allows 0.0-2.0 range
        displayId: 'bloom-intensity-value',
        displayFormat: v => v.toFixed(2)
    }));

    const bloomRadiusControl = manager.register(new SliderControl('bloom-radius', 1.0, {
        settingsKey: 'bloomRadius',
        min: 0.5,
        max: 3.0,
        step: 0.1,
        displayId: 'bloom-radius-value',
        displayFormat: v => v.toFixed(1)
    }));

    const bloomAlphaControl = manager.register(new PercentSliderControl('bloom-alpha', 1.0, {
        settingsKey: 'bloomAlpha',
        displayId: 'bloom-alpha-value',
        displayFormat: v => v.toFixed(2)
    }));

    // === Theme control (special handling for immediate application) ===

    const themeControl = manager.register(new SelectControl('theme-selector', 'dark', {
        settingsKey: 'theme',
        onChange: (value) => {
            // Apply theme immediately (no debounce)
            if (value === 'light') {
                $('body').addClass('light-theme');
            } else {
                $('body').removeClass('light-theme');
            }
            // Save immediately
            manager.saveToStorage();
        }
    }));

    // ========================================
    // Non-managed controls (special buttons)
    // ========================================

    // Preset selector (loads presets, doesn't save)
    $('#preset-selector').on('change', function() {
        const presetName = $(this).val();
        if (presetName) {
            loadPreset(presetName, manager);
            $(this).val(''); // Reset to placeholder
        }
    });

    // Default Settings button
    $('#default-settings').on('click', function() {
        manager.resetAll();
        manager.clearStorage();
        manager.apply(); // Apply immediately (no debounce)
    });

    // Share URL button
    $('#share-url').on('click', function() {
        const settings = manager.getSettings();
        shareSettings(settings);
    });

    // Reset button (resets camera bbox, not settings)
    $('#reset').on('click', function() {
        const canvas = renderer.gl.canvas;
        const aspectRatio = canvas.width / canvas.height;
        const height = 10; // -5 to 5
        const width = height * aspectRatio;

        renderer.updateConfig({
            bbox: {
                min: [-width / 2, -5],
                max: [width / 2, 5]
            },
            reinitializeParticles: true
        });
    });

    // Reset Particles button (clears screen trails)
    $('#reset-particles').on('click', function() {
        renderer.clearScreen();
    });

    // Storage strategy selector (requires page reload)
    const urlParams = new URLSearchParams(window.location.search);
    const currentStrategy = urlParams.get('storage') || 'float';
    $('#storage-strategy').val(currentStrategy);

    $('#storage-strategy').on('change', function() {
        const newStrategy = $(this).val();

        // Save current settings before reload
        manager.saveToStorage();

        // Reload page with new storage strategy
        const url = new URL(window.location);
        url.searchParams.set('storage', newStrategy);
        window.location.href = url.toString();
    });

    // Slider +/- buttons (trigger slider input events)
    $('.slider-btn').on('click', function() {
        const sliderId = $(this).data('slider');
        const action = $(this).data('action');
        const slider = $(`#${sliderId}`);

        if (!slider.length) return;

        const currentValue = parseFloat(slider.val());
        const step = parseFloat(slider.attr('step')) || 1;
        const min = parseFloat(slider.attr('min'));
        const max = parseFloat(slider.attr('max'));

        // Custom step sizes for different sliders and actions
        let increment = step;
        if (sliderId === 'timestep') {
            // Timestep has custom increments for fine control
            if (action === 'increase' || action === 'decrease') {
                increment = 0.001;  // Fine adjustment
            } else if (action === 'increase-large' || action === 'decrease-large') {
                increment = 0.01;   // Coarse adjustment
            }
        } else if (action === 'increase-large' || action === 'decrease-large') {
            // For other sliders, large steps are 10x normal step
            increment = step * 10;
        }

        let newValue = currentValue;
        if (action === 'increase' || action === 'increase-large') {
            newValue = Math.min(max, currentValue + increment);
        } else if (action === 'decrease' || action === 'decrease-large') {
            newValue = Math.max(min, currentValue - increment);
        } else if (action === 'reset') {
            // Reset to control's default value
            const control = manager.get(sliderId);
            if (control) {
                newValue = control.defaultValue;
            }
        }

        if (newValue !== currentValue) {
            slider.val(newValue).trigger('input');
        }
    });

    // ========================================
    // Gradient editor integration
    // ========================================

    let gradientEditor = null;

    function showGradientPanel() {
        const panel = $('#gradient-panel');
        updateGradientButtonVisibility(manager.get('color-mode').getValue());
        panel.show();

        // Initialize gradient editor if not already done
        if (!gradientEditor) {
            gradientEditor = initGradientEditor(
                'main-gradient-editor',
                gradientControl.getValue(),
                (newGradient) => {
                    gradientControl.notifyChange(newGradient);
                }
            );
            gradientControl.setGradientEditor(gradientEditor);
        } else {
            // Update gradient if it changed while editor was hidden
            gradientEditor.setGradient(gradientControl.getValue());
        }
    }

    function hideGradientPanel() {
        $('#gradient-panel').hide();
    }

    // Open gradient editor button
    $('#open-gradient-editor').on('click', function() {
        showGradientPanel();
    });

    // Close gradient panel when clicking outside
    $(document).on('click', function(e) {
        const panel = $('#gradient-panel');
        const openButton = $('#open-gradient-editor');

        if ($(e.target).is(openButton) ||
            $(e.target).closest('#gradient-panel').length > 0) {
            return;
        }

        if (panel.is(':visible')) {
            hideGradientPanel();
        }
    });

    // Prevent clicks inside gradient panel from closing it
    $('#gradient-panel').on('click', function(e) {
        e.stopPropagation();
    });

    // ========================================
    // Rendering settings panel
    // ========================================

    function showRenderingPanel() {
        $('#rendering-panel').show();
        updateWhitePointVisibility(manager.get('tonemap-operator').getValue());
    }

    function hideRenderingPanel() {
        $('#rendering-panel').hide();
    }

    $('#open-rendering-settings').on('click', function() {
        showRenderingPanel();
    });

    // Close rendering panel when clicking outside
    $(document).on('click', function(e) {
        const panel = $('#rendering-panel');
        const openButton = $('#open-rendering-settings');

        if ($(e.target).is(openButton) ||
            $(e.target).closest('#rendering-panel').length > 0) {
            return;
        }

        if (panel.is(':visible')) {
            hideRenderingPanel();
        }
    });

    // ========================================
    // Initialization
    // ========================================

    // First, initialize controls (creates DOM elements and attaches listeners)
    manager.initializeControls();

    // Then load and apply saved settings
    const savedSettings = loadSettingsFromURLOrStorage();

    // WORKAROUND: Newton's method fails to compile correctly on initial page load
    // (possibly due to Nerdamer not being fully initialized, or timing issues with
    // symbolic differentiation during shader compilation). To avoid this, we always
    // start in fixed-point mode and switch to Newton after a delay if needed.
    let delayedSolutionMethod = null;
    if (savedSettings && savedSettings.solutionMethod === 'newton') {
        logger.info('Newton\'s method detected in saved settings - will apply after delay');
        delayedSolutionMethod = 'newton';
        savedSettings.solutionMethod = 'fixed-point'; // Force fixed-point initially
    }

    if (savedSettings) {
        manager.applySettings(savedSettings);
    }

    // Apply Newton's method after a delay if it was in saved settings
    if (delayedSolutionMethod === 'newton') {
        logger.info('Scheduling delayed Newton\'s method activation in 3 seconds...');
        setTimeout(() => {
            logger.info('Applying delayed Newton\'s method activation');
            // Replicate exactly what happens when you select from the dropdown:
            // 1. Set the value in the DOM element
            $('#solution-method').val('newton');
            // 2. Trigger the 'change' event (this fires onChange handler + debounced apply)
            $('#solution-method').trigger('change');
            logger.info('Triggered solution-method dropdown change event');
        }, 3000); // 3 second delay
    }

    // Initialize special UI states
    updateWhitePointVisibility(manager.get('tonemap-operator').getValue());
    updateExpressionControls(manager.get('color-mode').getValue());
    updateGradientButtonVisibility(manager.get('color-mode').getValue());
    updateVelocityScalingVisibility(manager.get('color-mode').getValue());

    // Initialize implicit method controls visibility
    const currentIntegrator = manager.get('integrator').getValue();
    const isImplicit = currentIntegrator.startsWith('implicit-') || currentIntegrator === 'trapezoidal';
    $('#implicit-iterations-group').toggle(isImplicit);
    $('#solution-method-group').toggle(isImplicit);

    // Apply initial theme
    const theme = manager.get('theme-selector').getValue();
    if (theme === 'light') {
        $('body').addClass('light-theme');
    }

    // Load presets data
    loadPresets();

    // Create save function that includes bbox (pan/zoom state)
    function saveAllSettings() {
        const settings = manager.getSettings();

        // Add bbox from renderer
        if (renderer && renderer.bbox) {
            settings.bbox = {
                min: [...renderer.bbox.min],
                max: [...renderer.bbox.max]
            };
        }

        // Save to localStorage
        localStorage.setItem('vectorFieldSettings', JSON.stringify(settings));
        return settings;
    }

    // Call initialization callback
    if (callback) {
        callback({
            manager,
            state: manager.getSettings(), // For compatibility
            saveSettings: saveAllSettings // Use wrapper that includes bbox
        });
    }

    // Restore bbox if present in saved settings
    if (savedSettings && savedSettings.bbox) {
        renderer.updateConfig({
            bbox: savedSettings.bbox,
            reinitializeParticles: false
        });
    }

    // Return manager for external access
    return manager;
}

// ========================================
// Helper Functions
// ========================================

/**
 * Update white point visibility based on operator
 */
function updateWhitePointVisibility(operator) {
    const operatorsWithWhitePoint = ['reinhard_extended', 'uncharted2', 'hable', 'luminance_extended'];
    const showWhitePoint = operatorsWithWhitePoint.includes(operator);
    $('#white-point-control').toggle(showWhitePoint);
}

/**
 * Update expression controls visibility
 */
function updateExpressionControls(colorMode) {
    if (colorMode === 'expression') {
        $('#expression-controls').show();
    } else {
        $('#expression-controls').hide();
    }
}

/**
 * Update gradient button visibility
 */
function updateGradientButtonVisibility(colorMode) {
    const supportsGradient = colorMode === 'expression' ||
                              colorMode === 'velocity_magnitude' ||
                              colorMode === 'velocity_angle' ||
                              colorMode === 'velocity_combined';

    if (supportsGradient) {
        $('#gradient-button-container').show();
    } else {
        $('#gradient-button-container').hide();
    }

    // Show/hide preset toggle based on mode
    if (colorMode === 'expression') {
        $('#gradient-preset-toggle').hide();
    } else {
        $('#gradient-preset-toggle').show();
    }
}

/**
 * Update velocity scaling controls visibility
 */
function updateVelocityScalingVisibility(colorMode) {
    const usesVelocity = colorMode === 'velocity_magnitude' ||
                         colorMode === 'velocity_combined';

    if (usesVelocity) {
        $('#velocity-scaling-container').show();
        $('#velocity-log-container').show();
    } else {
        $('#velocity-scaling-container').hide();
        $('#velocity-log-container').hide();
    }
}

/**
 * Load settings from URL parameter or localStorage
 */
function loadSettingsFromURLOrStorage() {
    try {
        // First, check for URL parameter (?s=base64string)
        const urlParams = new URLSearchParams(window.location.search);
        const urlSettings = urlParams.get('s');

        let settings = null;

        if (urlSettings) {
            // Decode from URL parameter
            settings = decodeSettings(urlSettings);
            if (settings) {
                console.log('Loaded settings from URL parameter');
                // Save to localStorage for future visits
                localStorage.setItem('vectorFieldSettings', JSON.stringify(settings));

                // Clean URL by removing the 's' parameter (keep other params like 'storage')
                urlParams.delete('s');
                const newSearch = urlParams.toString();
                const newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '');
                window.history.replaceState({}, '', newUrl);
                console.log('URL cleaned, settings now in localStorage');
            }
        } else {
            // Fall back to localStorage
            const saved = localStorage.getItem('vectorFieldSettings');
            if (saved) {
                settings = JSON.parse(saved);
                console.log('Loaded settings from localStorage');
            }
        }

        return settings;
    } catch (e) {
        console.warn('Failed to load settings:', e);
        return null;
    }
}

/**
 * Decode settings from base64 URL string
 */
function decodeSettings(base64) {
    try {
        // Restore standard base64 characters
        let normalized = base64
            .replace(/-/g, '+')
            .replace(/_/g, '/');

        // Restore padding
        while (normalized.length % 4) {
            normalized += '=';
        }

        const json = atob(normalized);
        return JSON.parse(json);
    } catch (e) {
        console.error('Failed to decode settings:', e);
        return null;
    }
}

/**
 * Encode settings to base64 URL string
 */
function encodeSettings(settings) {
    try {
        const json = JSON.stringify(settings);
        // Use btoa for base64 encoding, with URL-safe replacements
        const base64 = btoa(json)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, ''); // Remove padding
        return base64;
    } catch (e) {
        console.error('Failed to encode settings:', e);
        return null;
    }
}

/**
 * Share settings via URL
 */
function shareSettings(settings) {
    const encoded = encodeSettings(settings);

    if (!encoded) {
        alert('Failed to encode settings');
        return;
    }

    // Build URL with settings parameter
    const url = new URL(window.location.href);
    // Keep storage parameter if present
    url.search = '';
    const storageParam = new URLSearchParams(window.location.search).get('storage');
    if (storageParam) {
        url.searchParams.set('storage', storageParam);
    }
    url.searchParams.set('s', encoded);

    const shareUrl = url.toString();

    // Copy to clipboard (only available in secure contexts: HTTPS or localhost)
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl).then(() => {
            const button = $('#share-url');
            const originalText = button.text();
            button.text('URL Copied!');
            setTimeout(() => {
                button.text(originalText);
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy URL to clipboard:', err);
            // Fallback: show the URL in an alert
            alert('Share this URL:\n\n' + shareUrl);
        });
    } else {
        // Clipboard API not available (HTTP, not HTTPS)
        // Fallback: select the URL in a temporary input field
        const tempInput = document.createElement('input');
        tempInput.value = shareUrl;
        document.body.appendChild(tempInput);
        tempInput.select();
        tempInput.setSelectionRange(0, 99999); // For mobile

        try {
            // Try old execCommand method
            const success = document.execCommand('copy');
            document.body.removeChild(tempInput);

            if (success) {
                const button = $('#share-url');
                const originalText = button.text();
                button.text('URL Copied!');
                setTimeout(() => {
                    button.text(originalText);
                }, 2000);
            } else {
                throw new Error('execCommand failed');
            }
        } catch (err) {
            document.body.removeChild(tempInput);
            // Final fallback: show the URL
            alert('Copy this URL to share:\n\n' + shareUrl);
        }
    }
}

/**
 * Show error message
 */
function showError(message) {
    $('#error-message').text(message).show();
}

/**
 * Hide error message
 */
function hideError() {
    $('#error-message').hide();
}

/**
 * Load preset examples
 */
function loadPresets() {
    window.presets = {
        '2d_rotation': {
            dimensions: 2,
            expressions: ['-y', 'x'],
            name: 'Simple Rotation'
        },
        '2d_vortex': {
            dimensions: 2,
            expressions: ['-y + x*(1 - x*x - y*y)', 'x + y*(1 - x*x - y*y)'],
            name: 'Vortex'
        },
        '2d_vanderpol': {
            dimensions: 2,
            expressions: ['y', '(1 - x*x)*y - x'],
            name: 'Van der Pol Oscillator'
        },
        '3d_lorenz': {
            dimensions: 3,
            expressions: ['10*(y - x)', 'x*(28 - z) - y', 'x*y - 2.67*z'],
            name: 'Lorenz Attractor'
        },
        '3d_rossler': {
            dimensions: 3,
            expressions: ['-y - z', 'x + 0.2*y', '0.2 + z*(x - 5.7)'],
            name: 'Rössler Attractor'
        },
        '4d_hypersphere': {
            dimensions: 4,
            expressions: ['-y', 'x', '-w', 'z'],
            name: '4D Hypersphere Rotation'
        }
    };
}

/**
 * Load a specific preset
 */
function loadPreset(name, manager) {
    const preset = window.presets[name];
    if (!preset) {
        console.error('Preset not found:', name);
        logger.error(`Preset not found: ${name}`);
        return;
    }

    logger.info(`Loading preset: ${preset.name || name} (dimensions=${preset.dimensions}, expressions=${preset.expressions.length})`);

    // Update dimensions
    const dimensionsControl = manager.get('dimensions');
    if (dimensionsControl) {
        logger.verbose(`Setting dimensions to ${preset.dimensions}`);
        dimensionsControl.setValue(preset.dimensions);
        const actualValue = dimensionsControl.getValue();
        logger.verbose(`Dimensions value after set: ${actualValue}`);
    }

    // Update expressions (which will also update input count)
    const expressionsControl = manager.get('dimension-inputs');
    if (expressionsControl) {
        logger.verbose(`PRESET expressions to set: [${preset.expressions.join(', ')}]`);
        expressionsControl.setValue(preset.expressions);

        // Check what got set in the DOM
        for (let i = 0; i < preset.expressions.length; i++) {
            const domValue = $(`#expr-${i}`).val();
            logger.verbose(`  expr-${i} DOM value: "${domValue}"`);
        }

        const actualExpressions = expressionsControl.getValue();
        logger.verbose(`Expressions after getValue(): [${actualExpressions.join(', ')}]`);
    } else {
        logger.error('Could not find dimension-inputs control!');
    }

    // Update mapper controls to match new dimensions
    const mapperParamsControl = manager.get('mapperParams');
    if (mapperParamsControl) {
        logger.verbose('Updating mapper controls');
        mapperParamsControl.updateControls();
    }

    // Apply changes immediately (no debounce for preset loading)
    logger.verbose('Applying preset settings to renderer');
    manager.apply();
    logger.info(`Preset ${preset.name || name} loaded successfully`);
}

/**
 * Export loadPreset for global access
 */
export { loadPreset };
