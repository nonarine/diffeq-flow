/**
 * Example of refactored controls using the new control system
 *
 * This demonstrates how to migrate the existing controls.js to use
 * the composable control classes.
 *
 * USAGE PATTERN:
 * 1. Create a ControlManager instance
 * 2. Register all controls with their default values
 * 3. Attach listeners to all controls
 * 4. Load saved settings
 * 5. The manager handles save/restore/reset automatically
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

/**
 * Example: Initialize the refactored control system
 */
export function initRefactoredControls(renderer, callback) {
    // Create the control manager
    const manager = new ControlManager({
        storageKey: 'vectorFieldSettings',
        debounceTime: 300,
        onApply: (settings) => {
            try {
                // Build config for renderer
                const config = buildRendererConfig(settings, manager);

                // Apply to renderer
                renderer.updateConfig(config);

                // Save to localStorage on success
                manager.saveToStorage();

                // Clear any error messages
                hideError();
            } catch (error) {
                // Show error but keep visualization running
                showError(error.message);
            }
        }
    });

    // Register all controls with their default values
    // This replaces the huge defaultSettings object and all the manual wiring

    // === Basic controls ===
    manager.register(new SliderControl('dimensions', 2, {
        min: 2,
        max: 6,
        step: 1,
        displayId: 'dim-value',
        displayFormat: v => v.toFixed(0),
        onChange: (value) => {
            // Special handler: update dimension inputs when dimensions change
            updateDimensionInputs(value, manager);
        }
    }));

    manager.register(new SelectControl('integrator', 'rk2'));
    manager.register(new SelectControl('mapper', 'select', {
        onChange: (value) => {
            // Special handler: update mapper controls when mapper type changes
            updateMapperControls(value, manager);
        }
    }));

    manager.register(new SelectControl('color-mode', 'white', {
        settingsKey: 'colorMode',
        onChange: (value) => {
            updateColorModeUI(value);
        }
    }));

    manager.register(new SelectControl('theme-selector', 'dark', {
        settingsKey: 'theme',
        onChange: (value) => {
            // Apply theme immediately (no debounce)
            if (value === 'light') {
                $('body').addClass('light-theme');
            } else {
                $('body').removeClass('light-theme');
            }
            manager.saveToStorage(); // Save immediately for theme
        }
    }));

    // === Linear sliders ===
    manager.register(new SliderControl('timestep', 0.01, {
        min: 0.001,
        max: 0.1,
        step: 0.001,
        displayId: 'timestep-value',
        displayFormat: v => v.toFixed(4)
    }));

    manager.register(new SliderControl('particles', 1000, {
        min: 100,
        max: 10000,
        step: 100,
        displayId: 'particles-value',
        displayFormat: v => v.toFixed(0)
    }));

    manager.register(new SliderControl('drop', 0.0, {
        settingsKey: 'dropProbability',
        min: 0,
        max: 0.01,
        step: 0.0001,
        displayId: 'drop-value',
        displayFormat: v => v.toFixed(4)
    }));

    manager.register(new SliderControl('white-point', 2.0, {
        settingsKey: 'whitePoint',
        min: 1.0,
        max: 10.0,
        step: 0.1,
        displayId: 'white-point-value',
        displayFormat: v => v.toFixed(1)
    }));

    manager.register(new PercentSliderControl('color-saturation', 1.0, {
        settingsKey: 'colorSaturation',
        displayId: 'color-saturation-value',
        displayFormat: v => v.toFixed(2)
    }));

    manager.register(new PercentSliderControl('brightness-desat', 0.0, {
        settingsKey: 'brightnessDesaturation',
        displayId: 'brightness-desat-value',
        displayFormat: v => v.toFixed(2)
    }));

    // === Logarithmic sliders ===
    manager.register(new LogSliderControl('fade', 0.999, {
        settingsKey: 'fadeOpacity',
        minValue: 0.9,
        maxValue: 0.9999,
        displayId: 'fade-value',
        displayFormat: v => v.toFixed(4)
    }));

    manager.register(new LogSliderControl('exposure', 1.0, {
        minValue: 0.01,
        maxValue: 10.0,
        displayId: 'exposure-value',
        displayFormat: v => v.toFixed(2)
    }));

    manager.register(new LogSliderControl('gamma', 2.2, {
        minValue: 0.2,
        maxValue: 10.0,
        displayId: 'gamma-value',
        displayFormat: v => v.toFixed(2)
    }));

    manager.register(new LogSliderControl('particle-intensity', 1.0, {
        settingsKey: 'particleIntensity',
        minValue: 0.001,
        maxValue: 100.0,
        displayId: 'particle-intensity-value',
        displayFormat: v => v.toFixed(3)
    }));

    // === Checkboxes ===
    manager.register(new CheckboxControl('drop-low-velocity', false, {
        settingsKey: 'dropLowVelocity'
    }));

    manager.register(new CheckboxControl('use-hdr', true, {
        settingsKey: 'useHDR'
    }));

    manager.register(new CheckboxControl('bloom-enabled', false, {
        settingsKey: 'bloomEnabled'
    }));

    manager.register(new CheckboxControl('use-custom-gradient', false, {
        settingsKey: 'useCustomGradient'
    }));

    // === Text inputs ===
    manager.register(new TextControl('color-expression', 'x * y', {
        settingsKey: 'colorExpression'
    }));

    // === Tone mapping operator (with special visibility handler) ===
    manager.register(new SelectControl('tonemap-operator', 'aces', {
        settingsKey: 'tonemapOperator',
        onChange: (value) => {
            updateWhitePointVisibility(value);
        }
    }));

    // === Bloom sliders (even though hidden, still manage them) ===
    manager.register(new PercentSliderControl('bloom-intensity', 0.3, {
        settingsKey: 'bloomIntensity',
        min: 0,
        max: 200, // Allows values 0.0 - 2.0
        displayId: 'bloom-intensity-value',
        displayFormat: v => v.toFixed(2)
    }));

    manager.register(new SliderControl('bloom-radius', 1.0, {
        settingsKey: 'bloomRadius',
        min: 0.5,
        max: 3.0,
        step: 0.1,
        displayId: 'bloom-radius-value',
        displayFormat: v => v.toFixed(1)
    }));

    manager.register(new PercentSliderControl('bloom-alpha', 1.0, {
        settingsKey: 'bloomAlpha',
        displayId: 'bloom-alpha-value',
        displayFormat: v => v.toFixed(2)
    }));

    // === Wire up special controls that need custom handling ===

    // Preset selector (doesn't save to settings, just loads presets)
    $('#preset-selector').on('change', function() {
        const presetName = $(this).val();
        if (presetName) {
            loadPreset(presetName, manager);
            $(this).val(''); // Reset to placeholder
        }
    });

    // Default Settings button
    $('#default-settings').on('click', function() {
        manager.resetAll(); // Reset all controls to defaults
        manager.clearStorage(); // Clear localStorage
        manager.apply(); // Apply immediately
    });

    // Share URL button
    $('#share-url').on('click', function() {
        const settings = manager.getSettings();
        shareSettings(settings);
    });

    // Reset button (canvas bbox reset)
    $('#reset').on('click', function() {
        resetCanvasBBox(renderer);
    });

    // Reset Particles button
    $('#reset-particles').on('click', function() {
        renderer.clearScreen();
    });

    // === Initialize everything ===

    // Load saved settings from localStorage (or URL parameter)
    const savedSettings = loadSettingsFromURLOrStorage();
    if (savedSettings) {
        manager.setSettings(savedSettings);
    }

    // Attach event listeners to all controls
    manager.attachAllListeners();

    // Special initialization for complex controls
    updateDimensionInputs(manager.get('dimensions').getValue(), manager);
    updateMapperControls(manager.get('mapper').getValue(), manager);
    updateColorModeUI(manager.get('color-mode').getValue());
    updateWhitePointVisibility(manager.get('tonemap-operator').getValue());

    // Call the initialization callback
    if (callback) {
        callback({
            manager,
            saveSettings: () => manager.saveToStorage()
        });
    }

    return manager;
}

/**
 * Build renderer config from settings
 */
function buildRendererConfig(settings, manager) {
    // Collect expressions from dimension inputs
    const dimensions = settings.dimensions || 2;
    const expressions = [];
    for (let i = 0; i < dimensions; i++) {
        const expr = $(`#expr-${i}`).val().trim();
        expressions.push(expr || '0');
    }

    // Collect mapper params
    const mapperParams = {
        dim1: parseInt($('#mapper-dim1').val() || 0),
        dim2: parseInt($('#mapper-dim2').val() || 1)
    };

    // Return full config object
    return {
        dimensions: settings.dimensions,
        expressions: expressions,
        integratorType: settings.integrator,
        mapperType: settings.mapper,
        mapperParams: mapperParams,
        timestep: settings.timestep,
        particleCount: settings.particles,
        fadeOpacity: settings.fadeOpacity,
        dropProbability: settings.dropProbability,
        dropLowVelocity: settings.dropLowVelocity,
        useHDR: settings.useHDR,
        tonemapOperator: settings.tonemapOperator,
        exposure: settings.exposure,
        gamma: settings.gamma,
        whitePoint: settings.whitePoint,
        particleIntensity: settings.particleIntensity,
        colorSaturation: settings.colorSaturation,
        brightnessDesaturation: settings.brightnessDesaturation,
        bloomEnabled: settings.bloomEnabled,
        bloomIntensity: settings.bloomIntensity,
        bloomRadius: settings.bloomRadius,
        bloomAlpha: settings.bloomAlpha,
        colorMode: settings.colorMode,
        colorExpression: settings.colorExpression,
        colorGradient: settings.colorGradient || getDefaultGradient(),
        useCustomGradient: settings.useCustomGradient
    };
}

/**
 * Helper functions (these would be imported or defined elsewhere)
 */

function updateDimensionInputs(dimensions, manager) {
    // Create dimension input fields dynamically
    // Same as existing implementation
}

function updateMapperControls(mapperType, manager) {
    // Update mapper UI based on type
    // Same as existing implementation
}

function updateColorModeUI(colorMode) {
    // Show/hide color mode specific controls
    // Same as existing implementation
}

function updateWhitePointVisibility(operator) {
    const operatorsWithWhitePoint = ['reinhard_extended', 'uncharted2', 'hable', 'luminance_extended'];
    $('#white-point-control').toggle(operatorsWithWhitePoint.includes(operator));
}

function loadSettingsFromURLOrStorage() {
    // Check URL params, fall back to localStorage
    // Same as existing implementation
    return null;
}

function loadPreset(name, manager) {
    // Load preset and update controls
}

function shareSettings(settings) {
    // Encode and copy URL to clipboard
}

function resetCanvasBBox(renderer) {
    // Reset viewport
}

function showError(message) {
    $('#error-message').text(message).show();
}

function hideError() {
    $('#error-message').hide();
}

function getDefaultGradient() {
    // Return default gradient
    return [];
}
