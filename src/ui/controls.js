/**
 * UI controls management
 */

import { initGradientEditor } from './gradient-editor.js';
import { getDefaultGradient } from '../math/gradients.js';
import { logger } from '../utils/debug-logger.js';

/**
 * Logarithmic scale helpers
 * Convert between linear slider values [0, 100] and logarithmic actual values
 */
function linearToLog(sliderValue, minValue, maxValue) {
    // sliderValue is in [0, 100]
    // Returns actual value in [minValue, maxValue] with logarithmic scaling
    const minLog = Math.log(minValue);
    const maxLog = Math.log(maxValue);
    const scale = (maxLog - minLog) / 100;
    return Math.exp(minLog + scale * sliderValue);
}

function logToLinear(actualValue, minValue, maxValue) {
    // actualValue is in [minValue, maxValue]
    // Returns slider position in [0, 100]
    const minLog = Math.log(minValue);
    const maxLog = Math.log(maxValue);
    const scale = (maxLog - minLog) / 100;
    return (Math.log(actualValue) - minLog) / scale;
}

/**
 * Initialize UI controls and event handlers
 * @param {Renderer} renderer - The renderer instance
 * @param {Function} callback - Called when initialization is complete
 */
export function initControls(renderer, callback) {
    // Default settings
    const defaultSettings = {
        dimensions: 2,
        expressions: ['-y', 'x'],
        integrator: 'rk2',
        mapper: 'select',
        mapperParams: { dim1: 0, dim2: 1 },
        timestep: 0.01,
        particleCount: 1000,
        fadeOpacity: 0.999,
        dropProbability: 0,
        dropLowVelocity: false,
        useHDR: true,
        tonemapOperator: 'aces',
        exposure: 1.0,
        gamma: 2.2,
        whitePoint: 2.0,
        particleIntensity: 1.0,
        colorSaturation: 1.0,
        brightnessDesaturation: 0.0,
        bloomEnabled: false,
        bloomIntensity: 0.3,
        bloomRadius: 1.0,
        bloomAlpha: 1.0,
        colorMode: 'white',
        colorExpression: 'x * y',
        colorGradient: getDefaultGradient(),
        useCustomGradient: false,
        theme: 'dark'
    };

    const state = { ...defaultSettings };

    // Shared gradient editor instance
    let gradientEditor = null;

    // Update white point visibility based on operator
    function updateWhitePointVisibility() {
        const operatorsWithWhitePoint = ['reinhard_extended', 'uncharted2', 'hable', 'luminance_extended'];
        const showWhitePoint = operatorsWithWhitePoint.includes(state.tonemapOperator);
        $('#white-point-control').toggle(showWhitePoint);
    }

    // Update dimension inputs
    function updateDimensionInputs() {
        const container = $('#dimension-inputs');
        if (container.length === 0) {
            console.error('Could not find #dimension-inputs element');
            return;
        }
        container.empty();

        const varNames = ['x', 'y', 'z', 'w', 'u', 'v'];

        for (let i = 0; i < state.dimensions; i++) {
            const varName = varNames[i];
            const defaultValue = state.expressions[i] || '0';

            const div = $('<div class="dimension-input"></div>');
            div.append(`<label>d${varName}/dt =</label>`);
            div.append(`<input type="text" id="expr-${i}" value="${defaultValue}">`);

            container.append(div);
        }

        // Update expressions array
        state.expressions = state.expressions.slice(0, state.dimensions);
        while (state.expressions.length < state.dimensions) {
            state.expressions.push('0');
        }
    }

    // Update mapper controls
    function updateMapperControls() {
        const container = $('#mapper-controls');
        container.empty();

        const varNames = ['x', 'y', 'z', 'w', 'u', 'v'];

        if (state.mapper === 'select') {
            const row = $('<div class="control-row"></div>');

            const group1 = $('<div class="control-group" style="flex: 1;"></div>');
            group1.append(`<label>Horizontal</label>`);

            const select1 = $('<select id="mapper-dim1"></select>');
            for (let i = 0; i < state.dimensions; i++) {
                const selected = i === state.mapperParams.dim1 ? 'selected' : '';
                select1.append(`<option value="${i}" ${selected}>${varNames[i]}</option>`);
            }
            group1.append(select1);

            const group2 = $('<div class="control-group" style="flex: 1;"></div>');
            group2.append(`<label>Vertical</label>`);

            const select2 = $('<select id="mapper-dim2"></select>');
            for (let i = 0; i < state.dimensions; i++) {
                const selected = i === state.mapperParams.dim2 ? 'selected' : '';
                select2.append(`<option value="${i}" ${selected}>${varNames[i]}</option>`);
            }
            group2.append(select2);

            row.append(group1);
            row.append(group2);
            container.append(row);

            // Add event listeners
            $('#mapper-dim1').on('change', function() {
                state.mapperParams.dim1 = parseInt($(this).val());
            });

            $('#mapper-dim2').on('change', function() {
                state.mapperParams.dim2 = parseInt($(this).val());
            });
        } else if (state.mapper === 'project') {
            const info = $('<div class="info">Linear projection uses default 2D projection</div>');
            container.append(info);
        }
    }

    // Update expression controls visibility
    function updateExpressionControls() {
        if (state.colorMode === 'expression') {
            $('#expression-controls').show();
        } else {
            $('#expression-controls').hide();
        }
    }

    // Update gradient button visibility
    function updateGradientButtonVisibility() {
        // Show gradient button for modes that support gradients
        const supportsGradient = state.colorMode === 'expression' ||
                                  state.colorMode === 'velocity_magnitude' ||
                                  state.colorMode === 'velocity_angle' ||
                                  state.colorMode === 'velocity_combined';

        if (supportsGradient) {
            $('#gradient-button-container').show();
        } else {
            $('#gradient-button-container').hide();
        }

        // Show/hide the preset toggle based on mode
        if (state.colorMode === 'expression') {
            $('#gradient-preset-toggle').hide();
        } else {
            $('#gradient-preset-toggle').show();
        }
    }

    // Show/hide gradient panel
    function showGradientPanel() {
        const panel = $('#gradient-panel');

        // Update preset toggle visibility based on current mode
        updateGradientButtonVisibility();

        panel.show();

        // Initialize gradient editor if not already done
        if (!gradientEditor) {
            gradientEditor = initGradientEditor(
                'main-gradient-editor',
                state.colorGradient,
                (newGradient) => {
                    state.colorGradient = newGradient;
                    debouncedApply();
                }
            );
        } else {
            // Update gradient if it changed while editor was hidden
            gradientEditor.setGradient(state.colorGradient);
        }
    }

    function hideGradientPanel() {
        $('#gradient-panel').hide();
    }

    // Load presets first
    loadPresets();

    // Track last known good configuration (must be declared before initialize())
    let lastGoodConfig = null;

    // Synchronous initialization
    function initialize() {
        // Read actual DOM values (browser may have cached them)
        state.dimensions = parseInt($('#dimensions').val()) || 2;
        state.integrator = $('#integrator').val() || 'rk2';
        state.mapper = $('#mapper').val() || 'select';
        state.timestep = parseFloat($('#timestep').val()) || 0.01;
        state.particleCount = parseInt($('#particles').val()) || 1000;

        // Convert fade slider from logarithmic scale [0, 100] to actual value [0.9, 0.9999]
        const fadeSliderValue = parseFloat($('#fade').val());
        state.fadeOpacity = isNaN(fadeSliderValue) ? 0.999 : linearToLog(fadeSliderValue, 0.9, 0.9999);

        // Handle dropProbability specially: 0 is a valid value, don't fall back to default
        const dropValue = parseFloat($('#drop').val());
        state.dropProbability = isNaN(dropValue) ? 0 : dropValue;

        // Update display values
        $('#dim-value').text(state.dimensions);
        $('#timestep-value').text(state.timestep.toFixed(4));
        $('#particles-value').text(state.particleCount);
        $('#fade-value').text(state.fadeOpacity.toFixed(4));
        $('#drop-value').text(state.dropProbability.toFixed(4));

        updateDimensionInputs();
        updateMapperControls();
        updateExpressionControls();
        updateGradientButtonVisibility();

        // Restore expressions from savedSettings if present
        if (savedSettings && savedSettings.expressions) {
            savedSettings.expressions.forEach((expr, i) => {
                if (i < state.dimensions) {
                    $(`#expr-${i}`).val(expr);
                    state.expressions[i] = expr;
                }
            });
        }

        // Restore mapperParams from savedSettings if present
        if (savedSettings && savedSettings.mapperParams) {
            state.mapperParams = savedSettings.mapperParams;
            updateMapperControls();
        }

        // Restore colorMode, theme, dropLowVelocity, HDR, and expression settings from savedSettings
        if (savedSettings && savedSettings.colorMode) {
            state.colorMode = savedSettings.colorMode;
        }
        if (savedSettings && savedSettings.theme) {
            state.theme = savedSettings.theme;
        }
        if (savedSettings && savedSettings.dropLowVelocity !== undefined) {
            state.dropLowVelocity = savedSettings.dropLowVelocity;
        }
        if (savedSettings && savedSettings.useHDR !== undefined) {
            state.useHDR = savedSettings.useHDR;
        }
        if (savedSettings && savedSettings.tonemapOperator) {
            state.tonemapOperator = savedSettings.tonemapOperator;
        }
        if (savedSettings && savedSettings.exposure !== undefined) {
            state.exposure = savedSettings.exposure;
        }
        if (savedSettings && savedSettings.gamma !== undefined) {
            state.gamma = savedSettings.gamma;
        }
        if (savedSettings && savedSettings.whitePoint !== undefined) {
            state.whitePoint = savedSettings.whitePoint;
        }
        if (savedSettings && savedSettings.particleIntensity !== undefined) {
            state.particleIntensity = savedSettings.particleIntensity;
        }
        if (savedSettings && savedSettings.colorSaturation !== undefined) {
            state.colorSaturation = savedSettings.colorSaturation;
        }
        if (savedSettings && savedSettings.brightnessDesaturation !== undefined) {
            state.brightnessDesaturation = savedSettings.brightnessDesaturation;
        }
        if (savedSettings && savedSettings.bloomEnabled !== undefined) {
            state.bloomEnabled = savedSettings.bloomEnabled;
        }
        if (savedSettings && savedSettings.bloomIntensity !== undefined) {
            state.bloomIntensity = savedSettings.bloomIntensity;
        }
        if (savedSettings && savedSettings.bloomRadius !== undefined) {
            state.bloomRadius = savedSettings.bloomRadius;
        }
        if (savedSettings && savedSettings.bloomAlpha !== undefined) {
            state.bloomAlpha = savedSettings.bloomAlpha;
        }
        if (savedSettings && savedSettings.colorExpression) {
            state.colorExpression = savedSettings.colorExpression;
        }
        if (savedSettings && savedSettings.colorGradient) {
            state.colorGradient = savedSettings.colorGradient;
        }
        if (savedSettings && savedSettings.useCustomGradient !== undefined) {
            state.useCustomGradient = savedSettings.useCustomGradient;
        }

        // NOW update UI sliders to match the restored state
        // (Must happen AFTER state restoration above)
        $('#fade').val(logToLinear(state.fadeOpacity, 0.9, 0.9999));
        $('#exposure').val(logToLinear(state.exposure, 0.01, 10.0));
        $('#gamma').val(logToLinear(state.gamma, 0.2, 10.0));
        $('#particle-intensity').val(logToLinear(state.particleIntensity, 0.001, 100.0));
        $('#color-saturation').val(state.colorSaturation * 100.0);
        $('#brightness-desat').val(state.brightnessDesaturation * 100.0);
        // Bloom disabled by default (hidden controls)
        // $('#bloom-enabled').prop('checked', state.bloomEnabled);
        $('#bloom-intensity').val(state.bloomIntensity * 100.0);
        $('#bloom-radius').val(state.bloomRadius);
        $('#bloom-alpha').val(state.bloomAlpha * 100.0);

        // Update displayed values
        $('#exposure-value').text(state.exposure.toFixed(2));
        $('#gamma-value').text(state.gamma.toFixed(2));
        $('#white-point-value').text(state.whitePoint.toFixed(1));
        $('#particle-intensity-value').text(state.particleIntensity.toFixed(3));
        $('#color-saturation-value').text(state.colorSaturation.toFixed(2));
        $('#brightness-desat-value').text(state.brightnessDesaturation.toFixed(2));
        $('#bloom-intensity-value').text(state.bloomIntensity.toFixed(2));
        $('#bloom-radius-value').text(state.bloomRadius.toFixed(1));
        $('#bloom-alpha-value').text(state.bloomAlpha.toFixed(2));

        // Initialize white point visibility
        updateWhitePointVisibility();

        // Call callback if provided
        if (callback) {
            callback({ state, saveSettings });

            // Apply bbox from savedSettings if present
            if (savedSettings && savedSettings.bbox) {
                renderer.updateConfig({
                    bbox: savedSettings.bbox,
                    reinitializeParticles: false
                });
            }

            // Store initial config as last known good after callback completes
            lastGoodConfig = {
                dimensions: state.dimensions,
                expressions: state.expressions,
                integratorType: state.integrator,
                mapperType: state.mapper,
                mapperParams: state.mapperParams,
                timestep: state.timestep,
                particleCount: state.particleCount,
                fadeOpacity: state.fadeOpacity,
                dropProbability: state.dropProbability,
                dropLowVelocity: state.dropLowVelocity
            };
        }
    }

    // Get current settings as an object
    function getCurrentSettings() {
        return {
            dimensions: state.dimensions,
            expressions: state.expressions,
            integrator: state.integrator,
            mapper: state.mapper,
            mapperParams: state.mapperParams,
            timestep: state.timestep,
            particleCount: state.particleCount,
            fadeOpacity: state.fadeOpacity,
            dropProbability: state.dropProbability,
            dropLowVelocity: state.dropLowVelocity,
            useHDR: state.useHDR,
            tonemapOperator: state.tonemapOperator,
            exposure: state.exposure,
            gamma: state.gamma,
            whitePoint: state.whitePoint,
            particleIntensity: state.particleIntensity,
            colorSaturation: state.colorSaturation,
            brightnessDesaturation: state.brightnessDesaturation,
            bloomEnabled: state.bloomEnabled,
            bloomIntensity: state.bloomIntensity,
            bloomRadius: state.bloomRadius,
            bloomAlpha: state.bloomAlpha,
            colorMode: state.colorMode,
            colorExpression: state.colorExpression,
            colorGradient: state.colorGradient,
            useCustomGradient: state.useCustomGradient,
            theme: state.theme,
            bbox: renderer ? {
                min: [...renderer.bbox.min],
                max: [...renderer.bbox.max]
            } : null
        };
    }

    // Encode settings to base64 URL string
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

    // Decode settings from base64 URL string
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

    // Save settings to localStorage
    function saveSettings() {
        const settings = getCurrentSettings();
        localStorage.setItem('vectorFieldSettings', JSON.stringify(settings));

        // Log all settings to debug console
        logger.info('Settings saved to localStorage', {
            dimensions: settings.dimensions,
            expressions: settings.expressions.join(', '),
            integrator: settings.integrator,
            timestep: settings.timestep,
            mapper: settings.mapper,
            mapperParams: settings.mapperParams,
            particleCount: settings.particleCount,
            fadeOpacity: settings.fadeOpacity,
            dropProbability: settings.dropProbability,
            dropLowVelocity: settings.dropLowVelocity,
            colorMode: settings.colorMode,
            colorExpression: settings.colorExpression,
            colorSaturation: settings.colorSaturation,
            brightnessDesaturation: settings.brightnessDesaturation,
            useCustomGradient: settings.useCustomGradient,
            colorGradient: settings.colorGradient ? `${settings.colorGradient.length} stops` : 'null',
            useHDR: settings.useHDR,
            tonemapOperator: settings.tonemapOperator,
            exposure: settings.exposure,
            gamma: settings.gamma,
            whitePoint: settings.whitePoint,
            particleIntensity: settings.particleIntensity,
            theme: settings.theme,
            bbox: settings.bbox ? `[${settings.bbox.min[0].toFixed(2)}, ${settings.bbox.min[1].toFixed(2)}] to [${settings.bbox.max[0].toFixed(2)}, ${settings.bbox.max[1].toFixed(2)}]` : 'null'
        });
    }

    // Load settings from URL parameter or localStorage
    function loadSettings() {
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
                }
            } else {
                // Fall back to localStorage
                const saved = localStorage.getItem('vectorFieldSettings');
                if (saved) {
                    settings = JSON.parse(saved);
                    console.log('Loaded settings from localStorage');
                }
            }

            if (settings) {

                // Update sliders and inputs BEFORE initialize() reads them
                if (settings.dimensions !== undefined) {
                    $('#dimensions').val(settings.dimensions);
                }
                if (settings.timestep !== undefined) {
                    $('#timestep').val(settings.timestep);
                }
                if (settings.particleCount !== undefined) {
                    $('#particles').val(settings.particleCount);
                }
                if (settings.fadeOpacity !== undefined) {
                    // Convert actual value to logarithmic slider position
                    $('#fade').val(logToLinear(settings.fadeOpacity, 0.9, 0.9999));
                }
                if (settings.dropProbability !== undefined) {
                    $('#drop').val(settings.dropProbability);
                }
                if (settings.integrator !== undefined) {
                    $('#integrator').val(settings.integrator);
                }
                if (settings.mapper !== undefined) {
                    $('#mapper').val(settings.mapper);
                }
                if (settings.colorMode !== undefined) {
                    $('#color-mode').val(settings.colorMode);
                }
                if (settings.theme !== undefined) {
                    $('#theme-selector').val(settings.theme);
                    // Apply theme immediately
                    if (settings.theme === 'light') {
                        $('body').addClass('light-theme');
                    } else {
                        $('body').removeClass('light-theme');
                    }
                }
                if (settings.dropLowVelocity !== undefined) {
                    $('#drop-low-velocity').prop('checked', settings.dropLowVelocity);
                }
                if (settings.useHDR !== undefined) {
                    $('#use-hdr').prop('checked', settings.useHDR);
                }
                if (settings.tonemapOperator !== undefined) {
                    $('#tonemap-operator').val(settings.tonemapOperator);
                }
                if (settings.exposure !== undefined) {
                    $('#exposure').val(logToLinear(settings.exposure, 0.01, 10.0));
                    $('#exposure-value').text(settings.exposure.toFixed(2));
                }
                if (settings.gamma !== undefined) {
                    $('#gamma').val(logToLinear(settings.gamma, 0.2, 10.0));
                    $('#gamma-value').text(settings.gamma.toFixed(2));
                }
                if (settings.whitePoint !== undefined) {
                    $('#white-point').val(settings.whitePoint);
                    $('#white-point-value').text(settings.whitePoint.toFixed(1));
                }
                if (settings.particleIntensity !== undefined) {
                    $('#particle-intensity').val(logToLinear(settings.particleIntensity, 0.001, 100.0));
                    $('#particle-intensity-value').text(settings.particleIntensity.toFixed(3));
                }
                if (settings.colorSaturation !== undefined) {
                    $('#color-saturation').val(settings.colorSaturation * 100.0);
                    $('#color-saturation-value').text(settings.colorSaturation.toFixed(2));
                }
                if (settings.brightnessDesaturation !== undefined) {
                    $('#brightness-desat').val(settings.brightnessDesaturation * 100.0);
                    $('#brightness-desat-value').text(settings.brightnessDesaturation.toFixed(2));
                }
                if (settings.bloomEnabled !== undefined) {
                    $('#bloom-enabled').prop('checked', settings.bloomEnabled);
                }
                if (settings.bloomIntensity !== undefined) {
                    $('#bloom-intensity').val(settings.bloomIntensity * 100.0);
                    $('#bloom-intensity-value').text(settings.bloomIntensity.toFixed(2));
                }
                if (settings.bloomRadius !== undefined) {
                    $('#bloom-radius').val(settings.bloomRadius);
                    $('#bloom-radius-value').text(settings.bloomRadius.toFixed(1));
                }
                if (settings.bloomAlpha !== undefined) {
                    $('#bloom-alpha').val(settings.bloomAlpha * 100.0);
                    $('#bloom-alpha-value').text(settings.bloomAlpha.toFixed(2));
                }
                if (settings.useCustomGradient !== undefined) {
                    $('#use-custom-gradient').prop('checked', settings.useCustomGradient);
                }
                if (settings.colorExpression !== undefined) {
                    $('#color-expression').val(settings.colorExpression);
                }

                // Store for later use (expressions will be restored after dimension inputs created)
                return settings;
            }
        } catch (e) {
            console.warn('Failed to load settings from localStorage:', e);
        }
        return null;
    }

    // Load settings from localStorage BEFORE initialize()
    const savedSettings = loadSettings();

    // Run initialization
    initialize();

    // Debounced auto-apply function with validation
    let applyTimeout = null;
    function debouncedApply() {
        if (applyTimeout) {
            clearTimeout(applyTimeout);
        }
        applyTimeout = setTimeout(() => {
            try {
                // Collect expressions from inputs
                const expressions = [];
                for (let i = 0; i < state.dimensions; i++) {
                    const expr = $(`#expr-${i}`).val().trim();
                    expressions.push(expr || '0');
                }
                state.expressions = expressions;

                // Build config to apply
                const config = {
                    dimensions: state.dimensions,
                    expressions: state.expressions,
                    integratorType: state.integrator,
                    mapperType: state.mapper,
                    mapperParams: state.mapperParams,
                    timestep: state.timestep,
                    particleCount: state.particleCount,
                    fadeOpacity: state.fadeOpacity,
                    dropProbability: state.dropProbability,
                    dropLowVelocity: state.dropLowVelocity,
                    useHDR: state.useHDR,
                    tonemapOperator: state.tonemapOperator,
                    exposure: state.exposure,
                    gamma: state.gamma,
                    whitePoint: state.whitePoint,
                    particleIntensity: state.particleIntensity,
                    colorSaturation: state.colorSaturation,
                    brightnessDesaturation: state.brightnessDesaturation,
                    bloomEnabled: state.bloomEnabled,
                    bloomIntensity: state.bloomIntensity,
                    bloomRadius: state.bloomRadius,
                    bloomAlpha: state.bloomAlpha,
                    colorMode: state.colorMode,
                    colorExpression: state.colorExpression,
                    colorGradient: state.colorGradient,
                    useCustomGradient: state.useCustomGradient
                };

                // Try to update renderer (may throw on invalid expressions)
                renderer.updateConfig(config);

                // Success! Store as last good config, save to localStorage, and clear any errors
                lastGoodConfig = config;
                saveSettings();
                hideError();
            } catch (error) {
                // Validation failed - show error but keep using last good config
                showError(error.message);

                // Optionally restore last good config if we have one
                // (This keeps the visualization running with valid settings)
                if (lastGoodConfig) {
                    try {
                        renderer.updateConfig(lastGoodConfig);
                    } catch (e) {
                        // Ignore - last good config should always be valid
                    }
                }
            }
        }, 300);
    }

    // Theme switcher
    $('#theme-selector').on('change', function() {
        const theme = $(this).val();
        state.theme = theme;
        if (theme === 'light') {
            $('body').addClass('light-theme');
        } else {
            $('body').removeClass('light-theme');
        }
        saveSettings();
    });

    // Preset selector
    $('#preset-selector').on('change', function() {
        const presetName = $(this).val();
        if (presetName) {
            loadPreset(presetName);
            // Reset selector to placeholder
            $(this).val('');
        }
    });

    // Color mode selector
    $('#color-mode').on('change', function() {
        state.colorMode = $(this).val();
        updateExpressionControls();
        updateGradientButtonVisibility();
        debouncedApply();
    });

    // Custom gradient checkbox (inside panel)
    $('#use-custom-gradient').on('change', function() {
        state.useCustomGradient = $(this).prop('checked');
        debouncedApply();
    });

    // Prevent clicks inside gradient panel from closing it
    $('#gradient-panel').on('click', function(e) {
        e.stopPropagation();
    });

    // Close gradient panel when clicking outside
    $(document).on('click', function(e) {
        const panel = $('#gradient-panel');
        const openButton = $('#open-gradient-editor');

        // Don't close if clicking the open button or inside the panel
        if ($(e.target).is(openButton) ||
            $(e.target).closest('#gradient-panel').length > 0) {
            return;
        }

        // Hide panel if clicking outside
        if (panel.is(':visible')) {
            hideGradientPanel();
        }
    });

    // Color expression input
    $('#color-expression').on('input', function() {
        state.colorExpression = $(this).val();
        debouncedApply();
    });

    // Open gradient editor button (in expression mode)
    $('#open-gradient-editor').on('click', function() {
        showGradientPanel();
    });

    // Event listeners
    $('#dimensions').on('input', function() {
        state.dimensions = parseInt($(this).val());
        $('#dim-value').text(state.dimensions);
        updateDimensionInputs();
        updateMapperControls();
        debouncedApply();
    });

    $('#integrator').on('change', function() {
        state.integrator = $(this).val();
        debouncedApply();
    });

    $('#mapper').on('change', function() {
        state.mapper = $(this).val();
        state.mapperParams = {
            dim1: 0,
            dim2: Math.min(1, state.dimensions - 1)
        };
        updateMapperControls();
        debouncedApply();
    });

    $('#timestep').on('input', function() {
        state.timestep = parseFloat($(this).val());
        $('#timestep-value').text(state.timestep.toFixed(4));
        debouncedApply();
    });

    $('#particles').on('input', function() {
        state.particleCount = parseInt($(this).val());
        $('#particles-value').text(state.particleCount);
        debouncedApply();
    });

    $('#fade').on('input', function() {
        // Logarithmic scale: [0, 100] -> [0.9, 0.9999]
        // Lower values = slower fade (more trail persistence)
        const sliderValue = parseFloat($(this).val());
        state.fadeOpacity = linearToLog(sliderValue, 0.9, 0.9999);
        $('#fade-value').text(state.fadeOpacity.toFixed(4));
        debouncedApply();
    });

    $('#drop').on('input', function() {
        state.dropProbability = parseFloat($(this).val());
        $('#drop-value').text(state.dropProbability.toFixed(4));
        debouncedApply();
    });

    // Drop low velocity checkbox
    $('#drop-low-velocity').on('change', function() {
        state.dropLowVelocity = $(this).is(':checked');
        debouncedApply();
    });

    // HDR checkbox
    $('#use-hdr').on('change', function() {
        state.useHDR = $(this).is(':checked');
        debouncedApply();
    });

    // Tone mapping operator dropdown
    $('#tonemap-operator').on('change', function() {
        state.tonemapOperator = $(this).val();
        updateWhitePointVisibility();
        debouncedApply();
    });

    // Exposure slider (logarithmic: [0, 100] -> [0.01, 10.0])
    $('#exposure').on('input', function() {
        const sliderValue = parseFloat($(this).val());
        state.exposure = linearToLog(sliderValue, 0.01, 10.0);
        $('#exposure-value').text(state.exposure.toFixed(2));
        debouncedApply();
    });

    // Gamma slider (logarithmic: [0, 100] -> [0.2, 10.0])
    $('#gamma').on('input', function() {
        const sliderValue = parseFloat($(this).val());
        state.gamma = linearToLog(sliderValue, 0.2, 10.0);
        $('#gamma-value').text(state.gamma.toFixed(2));
        debouncedApply();
    });

    // White point slider
    $('#white-point').on('input', function() {
        state.whitePoint = parseFloat($(this).val());
        $('#white-point-value').text(state.whitePoint.toFixed(1));
        debouncedApply();
    });

    // Particle intensity slider (logarithmic: [0, 100] -> [0.001, 100.0])
    $('#particle-intensity').on('input', function() {
        const sliderValue = parseFloat($(this).val());
        state.particleIntensity = linearToLog(sliderValue, 0.001, 100.0);
        $('#particle-intensity-value').text(state.particleIntensity.toFixed(3));
        debouncedApply();
    });

    // Color saturation slider (linear: [0, 100] -> [0.0, 1.0])
    $('#color-saturation').on('input', function() {
        const sliderValue = parseFloat($(this).val());
        state.colorSaturation = sliderValue / 100.0;
        $('#color-saturation-value').text(state.colorSaturation.toFixed(2));
        debouncedApply();
    });

    // Brightness desaturation slider (linear: [0, 100] -> [0.0, 1.0])
    $('#brightness-desat').on('input', function() {
        const sliderValue = parseFloat($(this).val());
        state.brightnessDesaturation = sliderValue / 100.0;
        $('#brightness-desat-value').text(state.brightnessDesaturation.toFixed(2));
        debouncedApply();
    });

    // Bloom enabled checkbox
    $('#bloom-enabled').on('change', function() {
        state.bloomEnabled = $(this).prop('checked');
        debouncedApply();
    });

    // Bloom intensity slider (linear: [0, 200] -> [0.0, 2.0])
    $('#bloom-intensity').on('input', function() {
        const sliderValue = parseFloat($(this).val());
        state.bloomIntensity = sliderValue / 100.0;
        $('#bloom-intensity-value').text(state.bloomIntensity.toFixed(2));
        debouncedApply();
    });

    // Bloom radius slider
    $('#bloom-radius').on('input', function() {
        state.bloomRadius = parseFloat($(this).val());
        $('#bloom-radius-value').text(state.bloomRadius.toFixed(1));
        debouncedApply();
    });

    // Bloom alpha slider (linear: [0, 100] -> [0.0, 1.0])
    $('#bloom-alpha').on('input', function() {
        const sliderValue = parseFloat($(this).val());
        state.bloomAlpha = sliderValue / 100.0;
        $('#bloom-alpha-value').text(state.bloomAlpha.toFixed(2));
        debouncedApply();
    });

    // Open rendering settings panel
    $('#open-rendering-settings').on('click', function() {
        showRenderingPanel();
    });

    function showRenderingPanel() {
        $('#rendering-panel').show();
        updateWhitePointVisibility();
    }

    function hideRenderingPanel() {
        $('#rendering-panel').hide();
    }

    // Click outside to close rendering panel
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

    // Wire up expression inputs to trigger auto-apply
    $(document).on('input', '[id^="expr-"]', function() {
        debouncedApply();
    });

    // Wire up mapper dimension selectors to trigger auto-apply
    $(document).on('change', '#mapper-dim1, #mapper-dim2', function() {
        debouncedApply();
    });

    // Default values for sliders (for reset button)
    const sliderDefaults = {
        'exposure': 1.0,
        'gamma': 2.2,
        'white-point': 2.0,
        'particle-intensity': 1.0,
        'timestep': 0.01,
        'particles': 1000,
        'fade': 0.0,  // Note: inverted in UI
        'drop': 0.0
    };

    // Wire up +/- and reset slider buttons
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
            // Reset to default value
            newValue = sliderDefaults[sliderId];
            if (newValue === undefined) {
                // If no default defined, use the slider's default value attribute
                newValue = parseFloat(slider.attr('value')) || currentValue;
            }
        }

        if (newValue !== currentValue) {
            slider.val(newValue).trigger('input');
        }
    });

    // Reset button
    $('#reset').on('click', function() {
        // Calculate bbox with proper aspect ratio
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

    // Storage strategy selector
    const urlParams = new URLSearchParams(window.location.search);
    const currentStrategy = urlParams.get('storage') || 'float';
    $('#storage-strategy').val(currentStrategy);

    $('#storage-strategy').on('change', function() {
        const newStrategy = $(this).val();

        // Save current settings to localStorage before reload
        saveSettings();

        // Reload page with new storage strategy
        const url = new URL(window.location);
        url.searchParams.set('storage', newStrategy);
        window.location.href = url.toString();
    });

    // Default Settings button
    $('#default-settings').on('click', function() {
        // Clear localStorage
        localStorage.removeItem('vectorFieldSettings');

        // Reset all controls to default values
        $('#dimensions').val(defaultSettings.dimensions);
        $('#integrator').val(defaultSettings.integrator);
        $('#mapper').val(defaultSettings.mapper);
        $('#timestep').val(defaultSettings.timestep);
        $('#particles').val(defaultSettings.particleCount);
        $('#fade').val(logToLinear(defaultSettings.fadeOpacity, 0.9, 0.9999)); // Logarithmic
        $('#drop').val(defaultSettings.dropProbability);
        $('#drop-low-velocity').prop('checked', defaultSettings.dropLowVelocity);
        $('#use-hdr').prop('checked', defaultSettings.useHDR);
        $('#tonemap-operator').val(defaultSettings.tonemapOperator);
        $('#exposure').val(logToLinear(defaultSettings.exposure, 0.01, 10.0)); // Logarithmic
        $('#exposure-value').text(defaultSettings.exposure.toFixed(2));
        $('#gamma').val(logToLinear(defaultSettings.gamma, 0.2, 10.0)); // Logarithmic
        $('#gamma-value').text(defaultSettings.gamma.toFixed(2));
        $('#white-point').val(defaultSettings.whitePoint);
        $('#white-point-value').text(defaultSettings.whitePoint.toFixed(1));
        $('#particle-intensity').val(logToLinear(defaultSettings.particleIntensity, 0.001, 100.0)); // Logarithmic
        $('#particle-intensity-value').text(defaultSettings.particleIntensity.toFixed(3));
        $('#color-saturation').val(defaultSettings.colorSaturation * 100.0);
        $('#color-saturation-value').text(defaultSettings.colorSaturation.toFixed(2));
        $('#brightness-desat').val(defaultSettings.brightnessDesaturation * 100.0);
        $('#brightness-desat-value').text(defaultSettings.brightnessDesaturation.toFixed(2));
        // Bloom disabled by default (hidden controls)
        // $('#bloom-enabled').prop('checked', defaultSettings.bloomEnabled);
        $('#bloom-intensity').val(defaultSettings.bloomIntensity * 100.0);
        $('#bloom-intensity-value').text(defaultSettings.bloomIntensity.toFixed(2));
        $('#bloom-radius').val(defaultSettings.bloomRadius);
        $('#bloom-radius-value').text(defaultSettings.bloomRadius.toFixed(1));
        $('#bloom-alpha').val(defaultSettings.bloomAlpha * 100.0);
        $('#bloom-alpha-value').text(defaultSettings.bloomAlpha.toFixed(2));
        $('#use-custom-gradient').prop('checked', defaultSettings.useCustomGradient);

        // Update state
        state.dimensions = defaultSettings.dimensions;
        state.integrator = defaultSettings.integrator;
        state.mapper = defaultSettings.mapper;
        state.timestep = defaultSettings.timestep;
        state.particleCount = defaultSettings.particleCount;
        state.fadeOpacity = defaultSettings.fadeOpacity;
        state.dropProbability = defaultSettings.dropProbability;
        state.dropLowVelocity = defaultSettings.dropLowVelocity;
        state.useHDR = defaultSettings.useHDR;
        state.tonemapOperator = defaultSettings.tonemapOperator;
        state.exposure = defaultSettings.exposure;
        state.gamma = defaultSettings.gamma;
        state.whitePoint = defaultSettings.whitePoint;
        state.particleIntensity = defaultSettings.particleIntensity;
        state.colorSaturation = defaultSettings.colorSaturation;
        state.brightnessDesaturation = defaultSettings.brightnessDesaturation;
        state.bloomEnabled = defaultSettings.bloomEnabled;
        state.bloomIntensity = defaultSettings.bloomIntensity;
        state.bloomRadius = defaultSettings.bloomRadius;
        state.bloomAlpha = defaultSettings.bloomAlpha;
        state.useCustomGradient = defaultSettings.useCustomGradient;
        state.colorExpression = defaultSettings.colorExpression;
        state.colorGradient = getDefaultGradient();
        state.expressions = [...defaultSettings.expressions];
        state.mapperParams = { ...defaultSettings.mapperParams };
        state.colorMode = defaultSettings.colorMode;
        state.theme = defaultSettings.theme;

        // Reset UI controls
        $('#color-mode').val(defaultSettings.colorMode);
        $('#color-expression').val(defaultSettings.colorExpression);
        $('#theme-selector').val(defaultSettings.theme);
        if (defaultSettings.theme === 'dark') {
            $('body').removeClass('light-theme');
        } else {
            $('body').addClass('light-theme');
        }

        // Update dimension inputs with default expressions
        updateDimensionInputs();
        defaultSettings.expressions.forEach((expr, i) => {
            if (i < state.dimensions) {
                $(`#expr-${i}`).val(expr);
            }
        });

        updateMapperControls();
        updateExpressionControls();
        updateGradientButtonVisibility();

        // Reset gradient editor if it exists
        if (gradientEditor) {
            gradientEditor.setGradient(state.colorGradient);
        }

        // Trigger apply
        $('#dimensions').trigger('input');
    });

    // Share URL button
    $('#share-url').on('click', function() {
        const settings = getCurrentSettings();
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

        // Copy to clipboard
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
    });

    // Error display
    function showError(message) {
        $('#error-message').text(message).show();
    }

    function hideError() {
        $('#error-message').hide();
    }

    // Expose saveSettings so it can be called externally (e.g., from pan/zoom handlers)
    return {
        state,
        saveSettings
    };
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

    // You can call loadPreset('2d_rotation') to load a preset
}

/**
 * Load a specific preset
 */
export function loadPreset(name) {
    const preset = window.presets[name];
    if (!preset) {
        console.error('Preset not found:', name);
        return;
    }

    $('#dimensions').val(preset.dimensions).trigger('input');

    // Wait for dimension inputs to be created
    setTimeout(() => {
        preset.expressions.forEach((expr, i) => {
            $(`#expr-${i}`).val(expr);
        });

        // Trigger input event to cause auto-apply
        $('#expr-0').trigger('input');
    }, 100);
}
