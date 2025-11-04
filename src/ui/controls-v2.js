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
import { DimensionInputsControl, MapperParamsControl, GradientControl } from './custom-controls.js';
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
        settingsKey: 'integratorType'
    }));

    const timestepControl = manager.register(new SliderControl('timestep', 0.01, {
        min: 0.001,
        max: 0.1,
        step: 0.001,
        displayId: 'timestep-value',
        displayFormat: v => v.toFixed(4)
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

    const tonemapOperatorControl = manager.register(new SelectControl('tonemap-operator', 'aces', {
        settingsKey: 'tonemapOperator',
        onChange: (value) => {
            updateWhitePointVisibility(value);
        }
    }));

    const exposureControl = manager.register(new LogSliderControl('exposure', 1.0, {
        minValue: 0.001,
        maxValue: 10.0,
        displayId: 'exposure-value',
        displayFormat: v => v.toFixed(3)
    }));

    const gammaControl = manager.register(new LogSliderControl('gamma', 2.2, {
        minValue: 0.2,
        maxValue: 10.0,
        displayId: 'gamma-value',
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

        let newValue = currentValue;
        if (action === 'increase') {
            newValue = Math.min(max, currentValue + step);
        } else if (action === 'decrease') {
            newValue = Math.max(min, currentValue - step);
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
    if (savedSettings) {
        manager.applySettings(savedSettings);
    }

    // Initialize special UI states
    updateWhitePointVisibility(manager.get('tonemap-operator').getValue());
    updateExpressionControls(manager.get('color-mode').getValue());
    updateGradientButtonVisibility(manager.get('color-mode').getValue());

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
        return;
    }

    // Get current settings
    const currentSettings = manager.getSettings();

    // Update dimensions
    const dimensionsControl = manager.get('dimensions');
    if (dimensionsControl) {
        dimensionsControl.setValue(preset.dimensions);
    }

    // Wait for dimension inputs to be created
    setTimeout(() => {
        // Update expressions
        const expressionsControl = manager.get('expressions');
        if (expressionsControl) {
            expressionsControl.setValue(preset.expressions);
        }

        // Apply changes
        manager.apply();
    }, 100);
}

/**
 * Export loadPreset for global access
 */
export { loadPreset };
