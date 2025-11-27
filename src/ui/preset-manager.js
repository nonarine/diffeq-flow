/**
 * Preset management system for loading, saving, and managing presets
 * Handles both built-in presets and custom user-created presets
 */

import { CoordinateSystem, getCartesianSystem } from '../math/coordinate-systems.js';
import { logger } from '../utils/debug-logger.js';

// LocalStorage key for custom presets
const CUSTOM_PRESETS_KEY = 'customPresets';

/**
 * Initialize built-in presets data
 * Creates window.presets object with 12 example dynamical systems
 */
export function loadPresets() {
    window.presets = {
        '2d_rotation': {
            dimensions: 2,
            expressions: ['-y', 'x'],
            integratorType: 'rk2',
            colorMode: 'velocity_angle',
            name: 'Simple Rotation'
        },
        '2d_vortex': {
            dimensions: 2,
            expressions: ['-y + x*(1 - x*x - y*y)', 'x + y*(1 - x*x - y*y)'],
            integratorType: 'rk4',
            colorMode: 'velocity_angle',
            bbox: {
                min: [-3, -3],
                max: [3, 3]
            },
            name: 'Vortex'
        },
        '2d_vanderpol': {
            dimensions: 2,
            expressions: ['y', '(1 - x*x)*y - x'],
            integratorType: 'rk4',
            colorMode: 'velocity_angle',
            name: 'Van der Pol Oscillator'
        },
        '3d_lorenz': {
            dimensions: 3,
            expressions: ['10*(y - x)', 'x*(28 - z) - y', 'x*y - 2.67*z'],
            integratorType: 'rk4',
            colorMode: 'velocity_angle',
            name: 'Lorenz Attractor'
        },
        '3d_rossler': {
            dimensions: 3,
            expressions: ['-y - z', 'x + 0.2*y', '0.2 + z*(x - 5.7)'],
            colorMode: 'velocity_angle',
            name: 'Rössler Attractor'
        },
        '4d_hypersphere': {
            dimensions: 4,
            expressions: ['-y', 'x', '-w', 'z'],
            colorMode: 'velocity_angle',
            name: '4D Hypersphere Rotation'
        },
        '2d_fluid_stirring': {
            dimensions: 2,
            expressions: [
                '-y + sin(x)*cos(y)*3.0 - 0.1*x',
                'x + cos(x)*sin(y)*3.0 - 0.1*y'
            ],
            colorMode: 'velocity_angle',
            name: 'Fluid Transport with Stirring'
        },
        '4d_double_pendulum': {
            dimensions: 4,
            expressions: [
                'z',  // dθ₁/dt = ω₁
                'w',  // dθ₂/dt = ω₂
                '(-10*(2*sin(x) + sin(x - 2*y)) - 2*sin(x - y)*(w*w + z*z*cos(x - y))) / (3 - cos(2*x - 2*y))',  // dω₁/dt
                '(2*sin(x - y)*(2*z*z + 20*cos(x) + w*w*cos(x - y))) / (3 - cos(2*x - 2*y))'  // dω₂/dt
            ],
            name: 'Double Pendulum (Chaotic)',
            timestep: 0.005,
            colorMode: 'velocity_angle',
            mapperType: 'custom',
            mapperParams: {
                horizontalExpr: 'sin(x) + sin(y)',
                verticalExpr: '-cos(x) - cos(y)',
                depthExpr: ''
            }
        },
        '2d_strange_attractor': {
            dimensions: 2,
            expressions: [
                '-y + x*(1 - x*x*x*x - y*y*y*y)',
                'x + y*(1 - x*x*x*x - y*y*y*y)'
            ],
            bbox: {
                min: [-3.5719104227544065, -1.7259582784950003],
                max: [3.5719104227544065, 1.7259582784950003]
            },
            integratorType: 'implicit-euler',
            solutionMethod: 'fixed-point',
            timestep: 0.472,
            implicitIterations: 3,
            particleCount: 880100,
            fadeOpacity: 0.9999,
            colorMode: 'velocity_angle',
            // Rendering settings
            supersampleFactor: 2,
            smaaEnabled: false,
            'smaa-intensity': 1,
            'smaa-threshold': 1,
            bilateralEnabled: true,
            bilateralSpatialSigma: 5,
            bilateralIntensitySigma: 0.01,
            // Tone mapping
            tonemapOperator: 'luminance_extended',
            exposure: 0.010232929922807544,
            gamma: 0.7803178779033633,
            luminanceGamma: 1.2188608780748513,
            highlightCompression: 9.999999999999993,
            compressionThreshold: 100000.00000000001,
            whitePoint: 3.443499307633384,
            particleIntensity: 47.31512589614813,
            particleSize: 0.10000000000000002,
            particleRenderMode: 'points',
            colorSaturation: 0.429,
            brightnessDesaturation: 0.685,
            brightnessSaturation: 0.13,
            name: 'Strange Attractor (Chaotic Limit Cycle)'
        }
    };
}

/**
 * Expand bbox to fit canvas aspect ratio (ensure WHOLE bbox is visible)
 * @param {Object} bbox - Original bbox with min/max arrays
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @returns {Object} Expanded bbox that fits aspect ratio
 */
function expandBBoxForAspectRatio(bbox, canvas) {
    if (!canvas) return bbox;

    const canvasAspect = canvas.width / canvas.height;
    const bboxWidth = bbox.max[0] - bbox.min[0];
    const bboxHeight = bbox.max[1] - bbox.min[1];
    const bboxAspect = bboxWidth / bboxHeight;

    const centerX = (bbox.min[0] + bbox.max[0]) / 2;
    const centerY = (bbox.min[1] + bbox.max[1]) / 2;

    let newWidth = bboxWidth;
    let newHeight = bboxHeight;

    if (canvasAspect > bboxAspect) {
        // Canvas is wider than bbox - expand width to match aspect ratio
        newWidth = bboxHeight * canvasAspect;
    } else {
        // Canvas is taller than bbox - expand height to match aspect ratio
        newHeight = bboxWidth / canvasAspect;
    }

    return {
        min: [centerX - newWidth / 2, centerY - newHeight / 2],
        max: [centerX + newWidth / 2, centerY + newHeight / 2]
    };
}

/**
 * Load a specific preset (built-in or custom)
 * @param {string} name - Preset identifier
 * @param {ControlManager} manager - Control manager instance
 */
export function loadPreset(name, manager) {
    // Check built-in presets first, then custom presets
    let preset = window.presets[name];
    if (!preset) {
        const customPresets = loadCustomPresets();
        preset = customPresets[name];
    }

    if (!preset) {
        console.error('Preset not found:', name);
        logger.error(`Preset not found: ${name}`);
        return;
    }

    logger.info(`Loading preset: ${preset.name || name} (dimensions=${preset.dimensions}, expressions=${preset.expressions.length})`);

    // Reset coordinate system to Cartesian unless preset specifies otherwise
    // Presets expressions are written for Cartesian coordinates by default
    if (preset.dimensions) {
        let coordinateSystem;
        if (preset.coordinateSystem) {
            // Preset specifies a coordinate system - use it
            coordinateSystem = CoordinateSystem.fromJSON(preset.coordinateSystem);
        } else {
            // No coordinate system specified - use Cartesian for the preset dimensions
            coordinateSystem = getCartesianSystem(preset.dimensions);
        }

        // Update renderer and UI
        if (window.renderer) {
            window.renderer.coordinateSystem = coordinateSystem;
        }

        const expressionsControl = manager.get('dimension-inputs');
        if (expressionsControl) {
            expressionsControl.setCoordinateSystem(coordinateSystem);
        }

        logger.info(`Preset loaded with coordinate system: ${coordinateSystem.name}`);
    }

    // Use the same loading logic as for loading settings from localStorage
    // This ensures consistent behavior and handles all control types properly
    // Apply settings after all Web Components are ready
    if (manager.webComponentRegistry) {
        manager.webComponentRegistry.applyWhenReady(preset);
    } else {
        // Fallback if registry not available (shouldn't happen)
        manager.applySettings(preset);
        manager.apply();
    }

    // Make sure UI controls are updated after restoring settings
    const expressionsControl = manager.get('dimension-inputs');
    if (expressionsControl && preset.dimensions) {
        expressionsControl.updateInputs(preset.dimensions);
    }

    const mapperParamsControl = manager.get('mapper-params');
    if (mapperParamsControl) {
        mapperParamsControl.updateControls();
    }

    const transformParamsControl = manager.get('transform-params');
    if (transformParamsControl) {
        transformParamsControl.updateControls();
    }

    // Get settings from controls and merge bbox if present in preset
    const settings = manager.getSettings();

    // Add bbox to settings if present in preset
    if (preset.bbox) {
        // Expand bbox to fit canvas aspect ratio (ensure WHOLE bbox is visible)
        const canvas = window.renderer?.gl?.canvas;
        const expandedBBox = expandBBoxForAspectRatio(preset.bbox, canvas);
        settings.bbox = expandedBBox;

        const bboxWidth = preset.bbox.max[0] - preset.bbox.min[0];
        const bboxHeight = preset.bbox.max[1] - preset.bbox.min[1];
        const newWidth = expandedBBox.max[0] - expandedBBox.min[0];
        const newHeight = expandedBBox.max[1] - expandedBBox.min[1];

        if (canvas) {
            logger.info(`Preset bbox expanded from [${bboxWidth.toFixed(2)} x ${bboxHeight.toFixed(2)}] to [${newWidth.toFixed(2)} x ${newHeight.toFixed(2)}] for aspect ratio ${(canvas.width / canvas.height).toFixed(2)}`);
        } else {
            logger.info(`Preset bbox: min=${preset.bbox.min}, max=${preset.bbox.max}`);
        }
    }

    // Transform implicitIterations into integratorParams (same as in onApply)
    if (settings.implicitIterations !== undefined) {
        settings.integratorParams = { iterations: settings.implicitIterations };
    }

    // Apply all settings at once (including bbox) to renderer
    if (window.renderer) {
        window.renderer.updateConfig(settings);
    }

    logger.info(`Preset ${preset.name || name} loaded successfully`);
}

/**
 * Load custom presets from localStorage
 * @returns {Object} Map of preset names to preset objects
 */
function loadCustomPresets() {
    try {
        const stored = localStorage.getItem(CUSTOM_PRESETS_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch (e) {
        console.error('Failed to load custom presets:', e);
        return {};
    }
}

/**
 * Save a custom preset to localStorage
 * @param {string} name - Preset name
 * @param {Object} preset - Preset settings object
 */
function saveCustomPreset(name, preset) {
    const presets = loadCustomPresets();
    presets[name] = preset;
    try {
        localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
    } catch (e) {
        console.error('Failed to save custom preset:', e);
        alert('Failed to save preset: ' + e.message);
    }
}

/**
 * Delete a custom preset from localStorage
 * @param {string} name - Preset name to delete
 */
function deleteCustomPreset(name) {
    const presets = loadCustomPresets();
    delete presets[name];
    try {
        localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
    } catch (e) {
        console.error('Failed to delete custom preset:', e);
    }
}

/**
 * Refresh the custom presets dropdown with current saved presets
 */
function refreshCustomPresetsDropdown() {
    const customPresets = loadCustomPresets();
    const $group = $('#custom-presets-group');

    // Clear existing options
    $group.empty();

    // Add custom presets
    const presetNames = Object.keys(customPresets).sort();
    if (presetNames.length > 0) {
        $group.show();
        presetNames.forEach(name => {
            const preset = customPresets[name];
            const displayName = preset.name || name;
            $group.append(`<option value="${name}">${displayName}</option>`);
        });
    } else {
        $group.hide();
    }
}

/**
 * Initialize preset controls (dropdown, save/delete buttons)
 * Sets up event handlers for preset selector and management buttons
 * @param {ControlManager} manager - Control manager instance
 */
export function initPresetControls(manager) {
    // Preset selector (loads presets, doesn't save)
    $('#preset-selector').on('change', function() {
        const presetName = $(this).val();
        if (presetName) {
            loadPreset(presetName, manager);
            $(this).val(''); // Reset to placeholder

            // Show delete button if it's a custom preset
            const customPresets = loadCustomPresets();
            if (customPresets[presetName]) {
                $('#preset-name-input').val(presetName);
                $('#delete-preset-btn').show();
            } else {
                $('#preset-name-input').val('');
                $('#delete-preset-btn').hide();
            }
        }
    });

    // Save Preset button
    $('#save-preset-btn').on('click', function() {
        const presetName = $('#preset-name-input').val().trim();
        if (!presetName) {
            alert('Please enter a preset name');
            return;
        }

        // Get current settings (using the same method as localStorage saving)
        const settings = manager.getSettings();

        // Add name to the preset
        const preset = {
            ...settings,
            name: presetName
        };

        // Save to localStorage
        saveCustomPreset(presetName, preset);

        // Refresh preset dropdown
        refreshCustomPresetsDropdown();

        // Show delete button
        $('#delete-preset-btn').show();

        logger.info('Preset saved: ' + presetName);
    });

    // Delete Preset button
    $('#delete-preset-btn').on('click', function() {
        const presetName = $('#preset-name-input').val().trim();
        if (!presetName) return;

        if (confirm(`Delete preset "${presetName}"?`)) {
            deleteCustomPreset(presetName);
            refreshCustomPresetsDropdown();
            $('#preset-name-input').val('');
            $('#delete-preset-btn').hide();
            logger.info('Preset deleted: ' + presetName);
        }
    });

    // Load custom presets on init
    refreshCustomPresetsDropdown();
}
