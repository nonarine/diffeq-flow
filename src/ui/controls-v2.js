/**
 * UI controls management using ControlManager system
 * Replaces legacy controls.js with composable control architecture
 */

import {
    ControlManager,
    SliderControl,
    LogSliderControl,
    PercentSliderControl,
    AdaptiveSliderControl,
    TimestepControl,
    TextControl,
    SelectControl,
    CheckboxControl
} from './control-base.js';
import { AnimatableSliderControl } from './animatable-slider.js';
import { AnimatableTimestepControl } from './animatable-timestep.js';
import { AnimatableParameterControl } from './parameter-control.js';
import { DimensionInputsControl, MapperParamsControl, GradientControl, TransformParamsControl } from './custom-controls.js';
import { initGradientEditor } from './gradient-editor.js';
import { showCoordinateEditor } from './coordinate-editor.js';
import { CoordinateSystem, getCartesianSystem } from '../math/coordinate-systems.js';
import { getDefaultGradient } from '../math/gradients.js';
import { logger } from '../utils/debug-logger.js';
import { resizeAccordion } from './accordion-utils.js';

/**
 * Initialize UI controls with ControlManager
 * @param {Renderer} renderer - The renderer instance
 * @param {Function} callback - Called when initialization is complete
 */
export function initControls(renderer, callback) {
    // Create the control manager
    const manager = new ControlManager({
        renderer: renderer,  // Pass renderer for coordinate system handling
        storageKey: 'vectorFieldSettings',
        debounceTime: 300,
        onApply: (settings) => {
            // Transform implicitIterations into integratorParams
            if (settings.implicitIterations !== undefined) {
                settings.integratorParams = { iterations: settings.implicitIterations };
            }

            // Apply settings directly to renderer
            // Allow temporary error states (e.g. dimension/coordinate system mismatch)
            // Shader compilation will fail gracefully and user can fix it
            renderer.updateConfig(settings);

            // Save to localStorage (including bbox for pan/zoom state and coordinate system)
            const settingsToSave = manager.getSettings();
            if (renderer && renderer.bbox) {
                settingsToSave.bbox = {
                    min: [...renderer.bbox.min],
                    max: [...renderer.bbox.max]
                };
            }
            if (renderer && renderer.coordinateSystem) {
                settingsToSave.coordinateSystem = renderer.coordinateSystem.toJSON();
            }
            localStorage.setItem('vectorFieldSettings', JSON.stringify(settingsToSave));

            // Clear any error messages
            hideError();
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
            logger.verbose('Dimensions changed to:', value);

            // Update dimension inputs when dimensions change
            const expressionsControl = manager.get('dimension-inputs');
            if (expressionsControl && renderer.coordinateSystem) {
                logger.verbose('Updating dimension inputs with dimensions:', value);
                // Don't reset coordinate system - just update the UI
                // If dimensions mismatch, shader compilation will fail gracefully
                if (renderer.coordinateSystem.dimensions === value) {
                    expressionsControl.setCoordinateSystem(renderer.coordinateSystem);
                    expressionsControl.updateInputs(value);
                } else {
                    logger.warn(`Coordinate system dimension mismatch: ${renderer.coordinateSystem.dimensions}D coordinate system with ${value}D expressions - update coordinate system or expressions to match`);
                }
            } else {
                logger.verbose('Preserving existing coordinate system:', renderer.coordinateSystem.name);
            }

            // Update mapper controls
            const mapperParamsControl = manager.get('mapper-params');
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

            // Resize accordion to accommodate shown/hidden controls
            resizeAccordion('#integrator', 0);
        }
    }));

    const solutionMethodControl = manager.register(new SelectControl('solution-method', 'fixed-point', {
        settingsKey: 'solutionMethod'
    }));

    const timestepControl = manager.register(new AnimatableTimestepControl('timestep', 0.01, {
        min: 0.001,
        max: 2.5,
        step: 0.001,
        smallIncrement: 0.001,  // - and + buttons
        largeIncrement: 0.01,   // -- and ++ buttons
        displayId: 'timestep-value',
        displayFormat: v => v.toFixed(4),
        animationMin: 0.001,    // Animation range: 0.001 to 0.1
        animationMax: 0.1
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

    const fadeControl = manager.register(new AnimatableSliderControl('fade', 0.999, {
        settingsKey: 'fadeOpacity',
        min: 0,
        max: 100,
        step: 0.1,
        displayId: 'fade-value',
        displayFormat: v => v.toFixed(4),
        // Transform slider [0-100] to log scale [0.9-0.9999]
        transform: (sliderValue) => {
            const minLog = Math.log(0.9);
            const maxLog = Math.log(0.9999);
            const scale = (maxLog - minLog) / 100;
            return Math.exp(minLog + scale * sliderValue);
        },
        inverseTransform: (value) => {
            const minLog = Math.log(0.9);
            const maxLog = Math.log(0.9999);
            const scale = (maxLog - minLog) / 100;
            return (Math.log(value) - minLog) / scale;
        },
        animationMin: 0.95,
        animationMax: 0.9995
    }));

    const dropControl = manager.register(new SliderControl('drop', 0.0, {
        settingsKey: 'dropProbability',
        min: 0,
        max: 0.1,
        step: 0.001,
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
            const transformParamsControl = manager.get('transform-params');
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
            const mapperParamsControl = manager.get('mapper-params');
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

    const colorModeControl = manager.register(new SelectControl('color-mode', 'velocity_angle', {
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

    // Initialize coordinate system labels (don't update UI yet - values not set)
    expressionsControl.setCoordinateSystem(renderer.coordinateSystem, false);

    // === HDR and tone mapping controls ===

    const useHDRControl = manager.register(new CheckboxControl('use-hdr', true, {
        settingsKey: 'useHDR'
    }));

    const useDepthTestControl = manager.register(new CheckboxControl('use-depth-test', false, {
        settingsKey: 'useDepthTest'
    }));

    // === Render Scale (formerly Supersampling) ===
    // Allows rendering at different resolutions (0.5x for performance, 2x+ for quality)

    const supersampleFactorControl = manager.register(new SliderControl('supersample-factor', 1.0, {
        min: 0.5,
        max: 4.0,
        step: 0.5,
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

    const highlightCompressionControl = manager.register(new LogSliderControl('highlight-compression', 0.0, {
        settingsKey: 'highlightCompression',
        minValue: 0.0,
        maxValue: 10.0,
        displayId: 'highlight-compression-value',
        displayFormat: v => v.toFixed(2)
    }));

    const compressionThresholdControl = manager.register(new LogSliderControl('compression-threshold', 1.0, {
        settingsKey: 'compressionThreshold',
        minValue: 0.0001,
        maxValue: 100000.0,
        displayId: 'compression-threshold-value',
        displayFormat: v => v.toFixed(2)
    }));

    const whitePointControl = manager.register(new LogSliderControl('white-point', 2.0, {
        settingsKey: 'whitePoint',
        minValue: 1.0,
        maxValue: 1000.0,
        displayId: 'white-point-value',
        displayFormat: v => v.toFixed(2)
    }));

    const particleIntensityControl = manager.register(new LogSliderControl('particle-intensity', 1.0, {
        settingsKey: 'particleIntensity',
        minValue: 0.001,
        maxValue: 100.0,
        displayId: 'particle-intensity-value',
        displayFormat: v => v.toFixed(3)
    }));

    const particleSizeControl = manager.register(new LogSliderControl('particle-size', 1.0, {
        settingsKey: 'particleSize',
        minValue: 0.1,
        maxValue: 10.0,
        displayId: 'particle-size-value',
        displayFormat: v => v.toFixed(1)
    }));

    const particleRenderModeControl = manager.register(new SelectControl('particle-render-mode', 'points', {
        settingsKey: 'particleRenderMode'
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

    // === Frame Limit Controls (in FPS counter) ===

    const frameLimitEnabledControl = manager.register(new CheckboxControl('frame-limit-enabled', false, {
        settingsKey: 'frameLimitEnabled',
        onChange: (enabled) => {
            // Update renderer's frame limit enabled state
            if (window.renderer) {
                window.renderer.frameLimitEnabled = enabled;
                // Also sync the current frame limit value when enabling
                if (enabled) {
                    const limitValue = frameLimitControl.getValue();
                    window.renderer.frameLimit = limitValue;
                    logger.info(`Frame limit enabled: will stop at ${limitValue} frames`);
                }
            }
        }
    }));

    const frameLimitControl = manager.register(new LogSliderControl('frame-limit', 1000, {
        minValue: 100,
        maxValue: 100000,
        displayId: 'frame-limit-value',
        displayFormat: v => {
            if (v >= 1000) {
                return `${Math.floor(v / 1000)}k`;
            }
            return Math.floor(v).toString();
        },
        settingsKey: 'frameLimit',
        onChange: (value) => {
            // Update renderer's frame limit
            if (window.renderer) {
                window.renderer.frameLimit = value;
                logger.verbose(`Frame limit updated to: ${value} frames`);
            }
        }
    }));

    // === Animation Testing Controls ===

    // Animation state
    let animationRunning = false; // Is animation currently running
    let animationFrameId = null; // requestAnimationFrame ID
    let animationDirection = 1; // 1 for forward, -1 for backward
    let animationStepsPerIncrement = 10; // Number of integration steps before alpha increments
    let animationStepCounter = 0; // Counter for integration steps
    let shaderLockWasEnabled = false; // Track if we enabled shader lock for this animation

    // Timing smoothing state - Asymmetric EMA to track high percentile (slow frames)
    const ALPHA_STEP_TIME_TARGET_PERCENTILE = 95; // Target percentile to track (higher = smoother but slower to adapt)
    const ALPHA_STEP_TIME_DECAY = 0.002; // Base decay rate when frames are faster than EMA
    // Calculate upward tracking rate using rule of thumb: ratio = P/(100-P)
    const ALPHA_STEP_TIME_UPWARD = (ALPHA_STEP_TIME_TARGET_PERCENTILE / (100 - ALPHA_STEP_TIME_TARGET_PERCENTILE)) * ALPHA_STEP_TIME_DECAY;
    const ALPHA_STEP_TIME_WARMUP_CYCLES = 3; // Number of alpha cycles to skip before initializing EMA (warm-up period)
    const ALPHA_STEP_TIME_DISPLAY_INTERVAL = 10; // Update step time display every N alpha cycles (reduce UI overhead)
    let alphaStepTimeEMA = null; // Asymmetric EMA tracking ~95th percentile of step time (ms)
    let alphaStepStartTime = null; // Timestamp when current alpha cycle started
    let alphaStepWarmupCounter = 0; // Counter for warm-up cycles
    let alphaStepDisplayCounter = 0; // Counter for display updates
    let cachedAnimatableControls = null; // Cached list of animatable controls (populated when animation starts)
    let cachedAnimatableParams = null; // Cached list of animatable parameter controls
    let lastAppliedSettings = null; // Track last applied settings to detect changes
    let savedLoggerVerbosity = null; // Save logger verbosity level during animation

    // Settings that require shader recompilation - never apply during animation
    const SHADER_RECOMPILE_SETTINGS = new Set([
        'expressions',           // Vector field expressions compiled into shader
        'dimensions',           // Changes shader structure
        'integratorType',       // Changes shader code
        'solutionMethod',       // Changes shader code
        'transformType',        // Changes shader code
        'transformParams',      // Transform params compiled into shader
        'mapperType',           // Changes shader code
        'mapperParams',         // Mapper params compiled into shader (e.g., projection matrix)
        'colorMode'             // Changes shader code
    ]);

    // Create animation alpha control dynamically
    const animAlphaContainer = $('#animation-alpha-container');
    logger.info(`Animation alpha container found: ${animAlphaContainer.length > 0}`);

    if (animAlphaContainer.length) {
        const controlHTML = `
            <div class="control-group">
                <label>Animation Alpha (a): <span class="range-value" id="animation-alpha-value">0.00%</span></label>
                <div class="slider-control">
                    <button class="slider-btn" data-slider="animation-alpha" data-action="decrease">-</button>
                    <input type="range" id="animation-alpha">
                    <button class="slider-btn" data-slider="animation-alpha" data-action="increase">+</button>
                    <button class="slider-btn" data-slider="animation-alpha" data-action="reset" title="Reset to 0.0">↺</button>
                    <button id="animation-alpha-animate-btn" class="slider-btn" style="margin-left: 8px; background: #4CAF50; color: white;" title="Auto-animate">▶</button>
                </div>
                <div class="info">Test time-based expressions with the 'a' variable (0.0 - 1.0). Use in expressions like: sin(x + a*PI), 0.01 + a*0.09</div>
            </div>
        `;
        animAlphaContainer.html(controlHTML);
        logger.info('Animation alpha control HTML injected');
    } else {
        logger.warn('Animation alpha container not found!');
    }

    // Create animation speed control
    const animSpeedContainer = $('#animation-speed-container');
    if (animSpeedContainer.length) {
        const speedHTML = `
            <div class="control-group">
                <label>Steps per Alpha Increment: <span class="range-value" id="animation-speed-value">10</span></label>
                <div class="slider-control">
                    <button class="slider-btn" data-slider="animation-speed" data-action="decrease">-</button>
                    <input type="range" id="animation-speed">
                    <button class="slider-btn" data-slider="animation-speed" data-action="increase">+</button>
                    <button class="slider-btn" data-slider="animation-speed" data-action="reset" title="Reset to 10">↺</button>
                </div>
                <div class="info">Integration steps to perform before incrementing alpha by 0.01</div>
            </div>
        `;
        animSpeedContainer.html(speedHTML);
    }

    const animationAlphaControl = manager.register(new PercentSliderControl('animation-alpha', 0.0, {
        settingsKey: 'animationAlpha',
        displayId: 'animation-alpha-value',
        displayFormat: v => `${(v * 100).toFixed(2)}%`,
        onChange: (value) => {
            // Update all animatable controls based on alpha
            manager.controls.forEach((control) => {
                if (control instanceof AnimatableSliderControl && control.animationEnabled) {
                    control.updateFromAlpha(value);
                }
            });

            // Update animatable parameter controls
            const transformParamsControl = manager.controls.get('transform-params');
            if (transformParamsControl && transformParamsControl.parameterControls) {
                transformParamsControl.parameterControls.forEach((paramControl) => {
                    if (paramControl.animationEnabled) {
                        paramControl.updateFromAlpha(value);
                    }
                });
            }

            // Update renderer immediately (no debounce for animation testing)
            if (window.renderer) {
                window.renderer.setAnimationAlpha(value);

                // Check if we should clear particles
                if ($('#animation-clear-particles').is(':checked')) {
                    window.renderer.resetParticles();
                }

                // Check if we should clear screen
                if ($('#animation-clear-screen').is(':checked')) {
                    window.renderer.clearRenderBuffer();
                }
            }
        }
    }));

    // Animation speed control (linear scale for steps)
    const animationSpeedControl = manager.register(new SliderControl('animation-speed', 10, {
        min: 1,
        max: 200,
        displayId: 'animation-speed-value',
        displayFormat: v => {
            animationStepsPerIncrement = Math.round(v);
            return Math.round(v).toString();
        }
    }));

    // Animation clear checkboxes
    manager.register(new CheckboxControl('animation-clear-particles', false, {
        settingsKey: 'animationClearParticles'
    }));

    manager.register(new CheckboxControl('animation-clear-screen', false, {
        settingsKey: 'animationClearScreen'
    }));

    manager.register(new CheckboxControl('animation-smooth-timing', false, {
        settingsKey: 'animationSmoothTiming'
    }));

    manager.register(new CheckboxControl('animation-lock-shaders', false, {
        settingsKey: 'animationLockShaders'
        // Note: This is a UI preference only - lock is applied during animation playback
        // Does NOT map to renderer.lockShaderRecompilation (which is runtime state only)
    }));

    logger.info('Animation alpha control registered');

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

    // Save Image button (saves render buffer at scaled resolution as PNG)
    $('#save-image').on('click', async function() {
        try {
            // Capture the high-resolution render buffer
            const blob = await renderer.captureRenderBuffer();

            // Create download link
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');

            // Generate filename with timestamp and resolution
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const resolution = `${renderer.renderWidth}x${renderer.renderHeight}`;
            link.download = `vector-field-${timestamp}-${resolution}.png`;

            link.href = url;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Clean up
            URL.revokeObjectURL(url);

            logger.info('Image saved: ' + link.download);
        } catch (error) {
            logger.error('Failed to save image:', error);
            alert('Failed to save image. Check console for details.');
        }
    });

    // Storage strategy selector (requires page reload)
    const urlParams = new URLSearchParams(window.location.search);
    const currentStrategy = urlParams.get('storage') || 'float';
    $('#storage-strategy').val(currentStrategy);

    $('#storage-strategy').on('change', function() {
        const newStrategy = $(this).val();

        // Save current settings before reload (including bbox for pan/zoom state and coordinate system)
        const settings = manager.getSettings();
        if (renderer && renderer.bbox) {
            settings.bbox = {
                min: [...renderer.bbox.min],
                max: [...renderer.bbox.max]
            };
        }
        if (renderer && renderer.coordinateSystem) {
            settings.coordinateSystem = renderer.coordinateSystem.toJSON();
        }
        localStorage.setItem('vectorFieldSettings', JSON.stringify(settings));

        // Reload page with new storage strategy
        const url = new URL(window.location);
        url.searchParams.set('storage', newStrategy);
        window.location.href = url.toString();
    });

    // Slider +/- buttons - dispatch to control implementations
    // Use event delegation to handle dynamically created buttons
    $(document).on('click', '.slider-btn', function() {
        const sliderId = $(this).data('slider');
        const action = $(this).data('action');

        // Handle mobile timestep buttons by delegating to main timestep control
        if (sliderId === 'mobile-timestep') {
            const timestepControl = manager.get('timestep');
            if (timestepControl && timestepControl.handleButtonAction) {
                timestepControl.handleButtonAction(action);
                // Mobile slider will auto-sync via the change listener
            }
            return;
        }

        // Try to get the registered control
        const control = manager.get(sliderId);
        if (control && control.handleButtonAction) {
            // Dispatch to control's implementation
            control.handleButtonAction(action);
            return;
        }

        // Handle dynamically created transform parameter sliders
        if (sliderId.startsWith('transform-param-')) {
            const transformParamsControl = manager.get('transform-params');
            if (transformParamsControl && transformParamsControl.handleTransformParamButton) {
                transformParamsControl.handleTransformParamButton(sliderId, action);
            }
            return;
        }

        // Fallback: no control found, slider doesn't support buttons
        console.warn(`No button handler found for slider: ${sliderId}`);
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

    // Configure coordinates button
    $('#configure-coordinates').on('click', function() {
        const currentDimensions = renderer.dimensions;
        let currentSystem = renderer.coordinateSystem;

        // Validate that coordinate system dimensions match current dimensions
        if (!currentSystem || currentSystem.dimensions !== currentDimensions) {
            console.warn('Coordinate system dimension mismatch, resetting to Cartesian');
            currentSystem = getCartesianSystem(currentDimensions);
            renderer.coordinateSystem = currentSystem;
        }

        showCoordinateEditor(currentDimensions, currentSystem, (newSystem) => {
            // Update renderer with new coordinate system
            renderer.updateConfig({ coordinateSystem: newSystem });

            // Update dimension input labels to reflect new coordinate variables
            expressionsControl.setCoordinateSystem(newSystem);

            // Trigger apply to recompile shaders with new coordinate system
            manager.apply();
        });
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

    // Wire up floating panel close buttons (for mobile)
    $('#gradient-panel .floating-panel-close').on('click', function() {
        hideGradientPanel();
    });

    $('#rendering-panel .floating-panel-close').on('click', function() {
        // If opened via mobile menu, use mobile panel manager
        if (window.mobilePanelManager && window.mobilePanelManager.getCurrentPanel() === 'rendering') {
            window.mobilePanelManager.hidePanel('rendering');
        } else {
            // Otherwise use regular hide function
            hideRenderingPanel();
        }
    });

    // ========================================
    // Modal System
    // ========================================
    // Modal is initialized in main.js and can be accessed via window.appModal

    // Menu bar settings button
    $(document).on('click', '#menu-settings', function() {
        if (window.appModal) {
            window.appModal.show();
        }
    });

    // Menu bar docs button
    $(document).on('click', '#menu-docs', function() {
        if (window.appModal) {
            window.appModal.show('docs');
        }
    });

    // Keyboard shortcut: Ctrl+, to open settings modal
    $(document).on('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === ',') {
            e.preventDefault();
            if (window.appModal) {
                window.appModal.show();
            }
        }
    });

    // Animation section accordion toggle
    $('#animation-section-toggle').on('click', function() {
        const content = $('#animation-section-content');
        const arrow = $('#animation-section-arrow');
        const histogram = $('#histogram-panel');
        const cursor = $('#cursor-position');

        if (content.is(':visible')) {
            content.slideUp(200);
            arrow.text('▼');
            // Slide panels back to left
            histogram.removeClass('shifted');
            cursor.removeClass('shifted');
        } else {
            content.slideDown(200);
            arrow.text('▲');
            // Slide panels to right to avoid overlap
            histogram.addClass('shifted');
            cursor.addClass('shifted');
        }
    });

    // Frame capture state
    let capturedFrames = [];
    let frameCaptureMode = null; // null, 'continuous', or 'fixed'
    let frameCaptureTotal = 0;
    let frameCaptureCount = 0;
    let frameCaptureAlphaIncrement = 0.01;

    // Start animation function (used by both play button and create animation)
    function startAnimation(options = {}) {
        const {
            captureFrames = false,
            totalFrames = 0,
            loops = 1,
            halfLoops = false,
            onProgress = null,
            onComplete = null
        } = options;

        // Stop if already running
        if (animationRunning) return;

        // Setup frame capture if requested
        if (captureFrames) {
            frameCaptureMode = 'fixed';
            frameCaptureTotal = totalFrames;
            frameCaptureCount = 0;
            capturedFrames = [];
            // Calculate alpha increment based on half-loops mode
            // halfLoops=false: each loop goes 0->1->0 (2 ranges per loop)
            // halfLoops=true: each loop goes 0->1 (1 range per loop)
            const rangesPerLoop = halfLoops ? 1.0 : 2.0;
            frameCaptureAlphaIncrement = (loops * rangesPerLoop) / totalFrames;
        } else {
            frameCaptureMode = 'continuous';
            frameCaptureAlphaIncrement = 0.01;
        }

        // Start animation
        animationRunning = true;

        // Pause main renderer loop so we have full control
        if (window.renderer) {
            window.renderer.stop();
        }

        // Reset step counter and timing state when starting animation
        animationStepCounter = 0;
        alphaStepTimeEMA = null;
        alphaStepStartTime = null;
        alphaStepWarmupCounter = 0;
        alphaStepDisplayCounter = 0;
        lastAppliedSettings = null;

        // Lock shaders if checkbox is enabled
        const shouldLockShaders = $('#animation-lock-shaders').is(':checked');
        if (shouldLockShaders && renderer) {
            renderer.lockShaderRecompilation = true;
            shaderLockWasEnabled = true;
            logger.info('Shader recompilation lock ENABLED (animation started)', null, false);
        } else {
            shaderLockWasEnabled = false;
        }

        // Buffer logs during animation (will be flushed when animation stops)
        savedLoggerVerbosity = logger.verbosity;
        logger.setVerbosity('silent');

        // Cache animatable controls to avoid repeated DOM queries and instanceof checks
        cachedAnimatableControls = [];
        manager.controls.forEach((control) => {
            if (control instanceof AnimatableSliderControl) {
                cachedAnimatableControls.push(control);
            }
        });

        // Cache animatable parameter controls
        cachedAnimatableParams = [];
        const transformParamsControl = manager.controls.get('transform-params');
        if (transformParamsControl && transformParamsControl.parameterControls) {
            transformParamsControl.parameterControls.forEach((paramControl) => {
                if (paramControl instanceof AnimatableParameterControl) {
                    cachedAnimatableParams.push(paramControl);
                }
            });
        }

        // Animation loop that performs integration steps
        const animationLoop = () => {
            if (!animationRunning) {
                return; // Animation was stopped
            }

            const freezeScreen = $('#animation-clear-screen').is(':checked');
            const smoothTiming = $('#animation-smooth-timing').is(':checked');

            // Increment step counter
            animationStepCounter++;

            // Start timing on first step of alpha cycle
            if (animationStepCounter === 1) {
                // Clear shader recompilation flag (don't reset warm-up during animation)
                if (window.renderer && window.renderer.shadersJustRecompiled) {
                    window.renderer.shadersJustRecompiled = false;
                }
                alphaStepStartTime = performance.now();
            }

            // Check if we should increment alpha
            if (animationStepCounter >= animationStepsPerIncrement) {
                animationStepCounter = 0;

                // If freeze mode: accumulate final step, display the buffer, THEN clear for next cycle
                if (freezeScreen && window.renderer) {
                    window.renderer.render(true);
                }

                // Calculate elapsed time for this alpha cycle
                const alphaStepEndTime = performance.now();
                const alphaStepElapsed = alphaStepEndTime - alphaStepStartTime;

                // Update asymmetric EMA (tracks ~95th percentile) after warm-up
                if (alphaStepWarmupCounter < ALPHA_STEP_TIME_WARMUP_CYCLES) {
                    // Still warming up - skip this cycle and don't update EMA
                    alphaStepWarmupCounter++;
                } else if (alphaStepTimeEMA === null) {
                    // Warm-up complete - initialize EMA from this cycle
                    alphaStepTimeEMA = alphaStepElapsed;
                } else {
                    // Use asymmetric smoothing: fast upward tracking, slow downward decay
                    if (alphaStepElapsed > alphaStepTimeEMA) {
                        // Slower than EMA - track upward quickly
                        alphaStepTimeEMA = ALPHA_STEP_TIME_UPWARD * alphaStepElapsed +
                                          (1 - ALPHA_STEP_TIME_UPWARD) * alphaStepTimeEMA;
                    } else {
                        // Faster than EMA - decay slowly
                        alphaStepTimeEMA = ALPHA_STEP_TIME_DECAY * alphaStepElapsed +
                                          (1 - ALPHA_STEP_TIME_DECAY) * alphaStepTimeEMA;
                    }
                }

                // Update step time display if smoothing is enabled (throttled to reduce UI overhead)
                if (smoothTiming) {
                    alphaStepDisplayCounter++;
                    if (alphaStepDisplayCounter >= ALPHA_STEP_TIME_DISPLAY_INTERVAL) {
                        alphaStepDisplayCounter = 0;
                        if (alphaStepTimeEMA === null) {
                            $('#step-time-counter').text(`Step: ${alphaStepElapsed.toFixed(1)}ms (warming up...)`);
                        } else {
                            $('#step-time-counter').text(`Step: ${alphaStepElapsed.toFixed(1)}ms (EMA: ${alphaStepTimeEMA.toFixed(1)}ms)`);
                        }
                        $('#step-time-counter').show();
                    }
                } else {
                    $('#step-time-counter').hide();
                }

                let currentValue = animationAlphaControl.getValue();

                // Update value based on direction and increment
                currentValue += animationDirection * frameCaptureAlphaIncrement;

                // Bounce at boundaries
                if (currentValue >= 1.0) {
                    currentValue = 1.0;
                    animationDirection = -1;
                } else if (currentValue <= 0.0) {
                    currentValue = 0.0;
                    animationDirection = 1;
                }

                // Update slider value WITHOUT triggering input event (avoid debounced apply)
                animationAlphaControl.setValue(currentValue);

                // Update all animatable controls based on alpha (use cached list)
                for (let i = 0; i < cachedAnimatableControls.length; i++) {
                    cachedAnimatableControls[i].updateFromAlpha(currentValue);
                }

                // Update animatable parameter controls (use cached list)
                for (let i = 0; i < cachedAnimatableParams.length; i++) {
                    cachedAnimatableParams[i].updateFromAlpha(currentValue);
                }

                // Manually update renderer with new alpha value and apply interpolated settings
                if (window.renderer) {
                    window.renderer.setAnimationAlpha(currentValue);

                    // Build changed settings directly from animatable controls (avoid full getSettings() overhead)
                    const changedSettings = {};

                    // Collect values from animatable sliders
                    for (let i = 0; i < cachedAnimatableControls.length; i++) {
                        const control = cachedAnimatableControls[i];
                        const newValue = control.getValue();
                        if (lastAppliedSettings === null || newValue !== lastAppliedSettings[control.settingsKey]) {
                            changedSettings[control.settingsKey] = newValue;
                        }
                    }

                    // Collect values from animatable parameters
                    for (let i = 0; i < cachedAnimatableParams.length; i++) {
                        const paramControl = cachedAnimatableParams[i];
                        const newValue = paramControl.getValue();
                        const paramKey = paramControl.parameterName;

                        // Build transformParams object
                        if (!changedSettings.transformParams) {
                            changedSettings.transformParams = lastAppliedSettings?.transformParams ? {...lastAppliedSettings.transformParams} : {};
                        }

                        if (lastAppliedSettings === null || newValue !== lastAppliedSettings.transformParams?.[paramKey]) {
                            changedSettings.transformParams[paramKey] = newValue;
                        }
                    }

                    // Apply changed settings to renderer (only if there are changes)
                    if (Object.keys(changedSettings).length > 0) {
                        try {
                            window.renderer.updateConfig(changedSettings);

                            // Update last applied settings
                            if (lastAppliedSettings === null) {
                                lastAppliedSettings = {};
                            }
                            Object.assign(lastAppliedSettings, changedSettings);
                        } catch (error) {
                            logger.error('Failed to apply animation settings:', error);
                        }
                    } else if (lastAppliedSettings === null) {
                        // First cycle with no animatable settings - initialize tracking
                        lastAppliedSettings = {};
                    }

                    // Check if we should clear particles
                    if ($('#animation-clear-particles').is(':checked')) {
                        window.renderer.resetParticles();
                    }

                    // If NOT freeze mode: render normally with display
                    // (freeze mode already rendered and cleared earlier)
                    if (!freezeScreen) {
                        window.renderer.render(true);
                    }

                    if(freezeScreen) {
                        window.renderer.clearRenderBuffer(true); // Clear without restarting main loop
                    }

                    // Capture frame if in frame capture mode
                    if (frameCaptureMode === 'fixed') {
                        // Capture the high-resolution render buffer
                        window.renderer.captureRenderBuffer().then(function(blob) {
                            capturedFrames.push(blob);
                            frameCaptureCount++;

                            // Call progress callback
                            if (onProgress) {
                                onProgress(frameCaptureCount, frameCaptureTotal, currentValue);
                            }

                            // Check if we're done
                            if (frameCaptureCount >= frameCaptureTotal) {
                                stopAnimation();
                                if (onComplete) {
                                    onComplete(capturedFrames);
                                }
                            }
                        }).catch(function(error) {
                            console.error('Failed to capture animation frame:', error);
                            stopAnimation();
                            alert('Failed to capture animation frame. Check console for details.');
                        });
                    }
                }

                // Alpha cycle complete - check if we need to delay for timing smoothing
                if (smoothTiming && alphaStepTimeEMA !== null && alphaStepElapsed < alphaStepTimeEMA) {
                    const delayNeeded = alphaStepTimeEMA - alphaStepElapsed;
                    // Wait before starting next cycle
                    setTimeout(() => {
                        if (animationRunning) {
                            animationFrameId = requestAnimationFrame(animationLoop);
                        }
                    }, delayNeeded);
                    return; // Exit early, setTimeout will continue the loop
                }
            } else {
                // Between alpha changes (steps 1 to N-1)
                if (window.renderer) {
                    if (freezeScreen) {
                        // Freeze mode: accumulate in hidden buffer (don't display yet)
                        window.renderer.render(false);
                    } else {
                        // Normal mode: render and display continuously
                        window.renderer.render(true);
                    }
                }
            }

            // Continue animation loop if still running
            if (animationRunning) {
                animationFrameId = requestAnimationFrame(animationLoop);
            }
        };

        // Start the animation loop
        animationFrameId = requestAnimationFrame(animationLoop);
    }

    // Stop animation function
    function stopAnimation() {
        animationRunning = false;
        if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        // Resume main renderer loop
        if (window.renderer && !window.renderer.isRunning) {
            window.renderer.start();
        }

        // Hide step time counter
        $('#step-time-counter').hide();

        // Clear cached controls and settings
        cachedAnimatableControls = null;
        cachedAnimatableParams = null;
        lastAppliedSettings = null;

        // Restore logger verbosity (this will auto-flush buffered logs)
        if (savedLoggerVerbosity !== null) {
            logger.setVerbosity(savedLoggerVerbosity);
            savedLoggerVerbosity = null;
        }

        // Unlock shaders if we locked them
        if (shaderLockWasEnabled && renderer) {
            renderer.lockShaderRecompilation = false;
            shaderLockWasEnabled = false;
            logger.info('Shader recompilation lock DISABLED (animation stopped)');
        }

        // Reset frame capture mode
        frameCaptureMode = null;
    }

    // Animation alpha animate button
    $('#animation-alpha-animate-btn').on('click', function(e) {
        e.stopPropagation(); // Prevent panel close
        const btn = $(this);

        if (animationRunning) {
            // Stop animation
            stopAnimation();

            btn.text('▶');
            btn.css('background', '#4CAF50');
            btn.attr('title', 'Auto-animate');
        } else {
            // Start animation
            startAnimation();

            btn.text('⏸');
            btn.css('background', '#FFA726');
            btn.attr('title', 'Stop auto-animate');
        }
    });

    // Update loops info text based on half-loops checkbox
    $('#animation-half-loops').on('change', function() {
        const isHalfLoops = $(this).is(':checked');
        const infoText = isHalfLoops
            ? 'Number of half cycles (1 = 0.0 → 1.0, 2 = 0.0 → 1.0 → 0.0)'
            : 'Number of complete alpha cycles (0.0 → 1.0 → 0.0)';
        $('#animation-loops-info').text(infoText);
    });

    // Create Animation button - captures frames during alpha animation
    $('#animation-create-btn').on('click', function() {
        const createBtn = $(this);

        // Check if button is in "stop" mode
        if (createBtn.data('stop-animation')) {
            // Stop the animation early
            stopAnimation();

            // Restore button state
            createBtn.text('▶ Create Animation');
            createBtn.css('background', '#4CAF50');
            createBtn.data('stop-animation', false);

            $('#animation-frames').prop('disabled', false);
            $('#animation-loops').prop('disabled', false);
            $('#animation-half-loops').prop('disabled', false);
            $('#animation-download-btn').prop('disabled', capturedFrames.length === 0);

            // Update progress to show it was stopped
            $('#progress-text').text(`Stopped: ${capturedFrames.length} frames captured`);

            logger.info(`Animation stopped early: ${capturedFrames.length} frames captured`);
            return;
        }

        if (animationRunning) return;

        const framesInput = $('#animation-frames');
        const loopsInput = $('#animation-loops');
        const halfLoopsCheckbox = $('#animation-half-loops');
        const downloadBtn = $('#animation-download-btn');
        const progressContainer = $('#animation-progress');
        const progressBar = $('#progress-bar');
        const progressText = $('#progress-text');
        const progressAlpha = $('#progress-alpha');

        // Get parameters
        const totalFrames = parseInt(framesInput.val()) || 100;
        const loops = parseInt(loopsInput.val()) || 1;
        const isHalfLoops = halfLoopsCheckbox.is(':checked');

        // Update UI - button becomes stop button
        createBtn.prop('disabled', false);
        createBtn.text('⏹ Stop Animation');
        createBtn.css('background', '#f44336'); // Red color for stop
        createBtn.data('stop-animation', true); // Flag to indicate it's now a stop button
        framesInput.prop('disabled', true);
        loopsInput.prop('disabled', true);
        halfLoopsCheckbox.prop('disabled', true);
        downloadBtn.prop('disabled', true);
        progressContainer.show();
        progressBar.css('width', '0%');
        progressText.text(`Frame 0 / ${totalFrames}`);
        progressAlpha.text('α: 0.00');

        // Start animation with frame capture
        startAnimation({
            captureFrames: true,
            totalFrames: totalFrames,
            loops: loops,
            halfLoops: isHalfLoops,
            onProgress: (frameCount, totalFrames, alpha) => {
                const progress = (frameCount / totalFrames) * 100;
                progressBar.css('width', `${progress}%`);
                progressText.text(`Frame ${frameCount} / ${totalFrames}`);
                progressAlpha.text(`α: ${alpha.toFixed(2)}`);
            },
            onComplete: (frames) => {
                // Restore button state
                createBtn.prop('disabled', false);
                createBtn.text('▶ Create Animation');
                createBtn.css('background', '#4CAF50');
                createBtn.data('stop-animation', false);
                framesInput.prop('disabled', false);
                loopsInput.prop('disabled', false);
                halfLoopsCheckbox.prop('disabled', false);
                downloadBtn.prop('disabled', false);
                progressBar.css('width', '100%');
                progressText.text(`Complete: ${frames.length} frames`);

                logger.info(`Animation creation complete: ${frames.length} frames captured`);
            }
        });
    });

    // Download Animation button
    $('#animation-download-btn').on('click', async function() {
        if (capturedFrames.length === 0) {
            alert('No frames to download. Create an animation first.');
            return;
        }

        const btn = $(this);
        btn.prop('disabled', true);
        btn.text('⏳ Creating ZIP...');

        try {
            const MAX_FRAMES_PER_ZIP = 300;
            const totalFrames = capturedFrames.length;
            const numParts = Math.ceil(totalFrames / MAX_FRAMES_PER_ZIP);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

            logger.info(`Splitting ${totalFrames} frames into ${numParts} ZIP file(s)`);

            // Create and download each ZIP part
            for (let part = 0; part < numParts; part++) {
                const startIdx = part * MAX_FRAMES_PER_ZIP;
                const endIdx = Math.min((part + 1) * MAX_FRAMES_PER_ZIP, totalFrames);

                btn.text(`⏳ Creating ZIP ${part + 1}/${numParts}...`);

                // Create ZIP file using JSZip
                const zip = new JSZip();
                const framesFolder = zip.folder('frames');

                // Add frames to this ZIP part
                for (let i = startIdx; i < endIdx; i++) {
                    const paddedIndex = String(i).padStart(5, '0');
                    framesFolder.file(`frame_${paddedIndex}.png`, capturedFrames[i]);
                }

                // Generate ZIP file
                const zipBlob = await zip.generateAsync({ type: 'blob' });

                // Create download link
                const url = URL.createObjectURL(zipBlob);
                const link = document.createElement('a');
                const partSuffix = numParts > 1 ? `.${part + 1}` : '';
                link.download = `animation-${timestamp}${partSuffix}.zip`;
                link.href = url;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                // Clean up
                URL.revokeObjectURL(url);

                logger.info(`Part ${part + 1}/${numParts} downloaded: frames ${startIdx}-${endIdx - 1}`);

                // Small delay between downloads to avoid browser issues
                if (part < numParts - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            logger.info(`Animation download complete: ${totalFrames} frames in ${numParts} ZIP file(s)`);
            if (numParts > 1) {
                alert(`Animation split into ${numParts} ZIP files. Use create-video.sh with the base filename (without .1, .2, etc) to reconstruct.`);
            }
        } catch (error) {
            logger.error('Failed to create ZIP:', error);
            alert('Failed to create ZIP file: ' + error.message);
        } finally {
            btn.prop('disabled', false);
            btn.text('💾 Download Animation (ZIP)');
        }
    });

    // Export Animation JSON button
    $('#export-animation-json').on('click', function() {
        const settings = manager.getSettings();

        // Add bbox from renderer
        if (renderer && renderer.bbox) {
            settings.bbox = {
                min: [renderer.bbox.min[0], renderer.bbox.min[1]],
                max: [renderer.bbox.max[0], renderer.bbox.max[1]]
            };
        }

        // Remove animationAlpha from export (it's test-only)
        delete settings.animationAlpha;

        // Create animation template
        const animationTemplate = {
            name: "Untitled Animation",
            description: "Animation created from current settings",
            fps: 30,
            baseSettings: settings,
            timeline: [
                {
                    time: 0.0,
                    settings: {},
                    easing: "linear"
                },
                {
                    time: 10.0,
                    settings: {
                        // Add your parameter changes here
                    },
                    easing: "linear"
                }
            ],
            frameConfig: {
                burnInSteps: 5000,
                clearAfterBurnIn: true,
                accumulationSteps: 2000
            }
        };

        // Download as JSON
        const blob = new Blob([JSON.stringify(animationTemplate, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'animation-template.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        logger.info('Exported animation template JSON');
    });

    // Close panels when clicking outside
    $(document).on('click', function(e) {
        // Close rendering panel
        const renderingPanel = $('#rendering-panel');
        const renderingButton = $('#open-rendering-settings');
        const mobileRenderingButton = $('#mobile-menu-rendering');

        if ($(e.target).is(renderingButton) ||
            $(e.target).is(mobileRenderingButton) ||
            $(e.target).closest('#mobile-menu-rendering').length > 0 ||
            $(e.target).closest('#rendering-panel').length > 0) {
            // Don't close rendering panel
        } else if (renderingPanel.is(':visible')) {
            hideRenderingPanel();
        }

        // Note: Modal handles its own closing on overlay click or Escape key
    });

    // ========================================
    // Initialization
    // ========================================

    // First, initialize controls (creates DOM elements and attaches listeners)
    manager.initializeControls();

    // Then load and apply saved settings
    const savedSettings = loadSettingsFromURLOrStorage();

    // Set mobile-specific defaults if no saved settings exist
    const isMobile = window.innerWidth <= 768;
    if (isMobile && (!savedSettings || (savedSettings.frameLimitEnabled === undefined && savedSettings.frameLimit === undefined))) {
        // On mobile, enable frame limit and set to 500 frames by default (only if not already saved)
        frameLimitEnabledControl.setValue(true);
        frameLimitControl.setValue(500);
        if (window.renderer) {
            window.renderer.frameLimitEnabled = true;
            window.renderer.frameLimit = 500;
        }
        logger.info('Mobile detected: frame limit enabled at 500 frames');
    }

    if (savedSettings) {
        // Restore coordinate system if present and dimensions match
        if (savedSettings.coordinateSystem && savedSettings.dimensions) {
            try {
                const coordSystemData = savedSettings.coordinateSystem;

                // Convert Unicode symbols to ASCII in forward transforms
                if (coordSystemData.forwardTransforms && window.UnicodeAutocomplete) {
                    coordSystemData.forwardTransforms = coordSystemData.forwardTransforms.map(transform => {
                        if (typeof transform === 'string' && window.UnicodeAutocomplete.unicodeToAscii) {
                            return window.UnicodeAutocomplete.unicodeToAscii(transform);
                        }
                        return transform;
                    });
                }

                const coordinateSystem = CoordinateSystem.fromJSON(coordSystemData);

                // Validate that coordinate system dimensions match saved dimensions
                if (coordinateSystem.dimensions === savedSettings.dimensions) {
                    renderer.coordinateSystem = coordinateSystem;
                    expressionsControl.setCoordinateSystem(coordinateSystem, false);
                    console.log('Restored coordinate system:', coordinateSystem.name);
                } else {
                    // Dimension mismatch - reset to Cartesian for the correct dimensions
                    console.warn(`Coordinate system dimension mismatch: system has ${coordinateSystem.dimensions}D but settings use ${savedSettings.dimensions}D. Resetting to Cartesian.`);
                    const cartesianSystem = getCartesianSystem(savedSettings.dimensions);
                    renderer.coordinateSystem = cartesianSystem;
                    expressionsControl.setCoordinateSystem(cartesianSystem, false);
                }
            } catch (error) {
                console.warn('Failed to restore coordinate system:', error);
                // Fall back to Cartesian
                if (savedSettings.dimensions) {
                    const cartesianSystem = getCartesianSystem(savedSettings.dimensions);
                    renderer.coordinateSystem = cartesianSystem;
                    expressionsControl.setCoordinateSystem(cartesianSystem, false);
                }
            }
        }

        // Convert Unicode to ASCII in expressions (θ → theta, φ → phi, etc.)
        if (savedSettings.expressions && Array.isArray(savedSettings.expressions) && window.UnicodeAutocomplete) {
            savedSettings.expressions = savedSettings.expressions.map(expr => {
                if (typeof expr === 'string' && window.UnicodeAutocomplete.unicodeToAscii) {
                    return window.UnicodeAutocomplete.unicodeToAscii(expr);
                }
                return expr;
            });
        }

        // Validate and fix mapper params if needed
        if (savedSettings.mapperParams) {
            const params = savedSettings.mapperParams;
            // For select mapper, ensure dim2 is different from dim1 and defaults to 1
            if (params.dim1 !== undefined && params.dim2 !== undefined) {
                if (params.dim1 === params.dim2) {
                    console.warn('Invalid mapper params: dim1 and dim2 are the same, fixing to default');
                    savedSettings.mapperParams = { dim1: 0, dim2: 1 };
                }
            }
        }

        manager.applySettings(savedSettings);
        // Trigger onApply callback to ensure all transformations happen
        // (e.g., implicitIterations -> integratorParams)
        manager.apply();
    }

    // Initialize frame limit settings in renderer
    if (renderer) {
        renderer.frameLimitEnabled = frameLimitEnabledControl.getValue();
        renderer.frameLimit = frameLimitControl.getValue();
    }

    // Initialize special UI states
    updateWhitePointVisibility(manager.get('tonemap-operator').getValue());
    updateExpressionControls(manager.get('color-mode').getValue());
    updateGradientButtonVisibility(manager.get('color-mode').getValue());
    updateVelocityScalingVisibility(manager.get('color-mode').getValue());

    // Initialize implicit method controls visibility
    const currentIntegrator = manager.get('integrator').getValue() || 'rk2';
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

    // Initialize unicode autocomplete on all math input fields
    if (window.unicodeAutocomplete) {
        window.unicodeAutocomplete.setEnabled(true);

        // Attach to all math input fields
        window.unicodeAutocomplete.attachToAll('[id^="expr-"]');        // Vector field expressions
        window.unicodeAutocomplete.attachToAll('#mapper-expression');    // Custom mapper expressions
        window.unicodeAutocomplete.attachToAll('#color-expression');     // Color expressions
        window.unicodeAutocomplete.attachToAll('#custom-color-code');    // Custom color code
        window.unicodeAutocomplete.attachToAll('#custom-integrator-code'); // Custom integrator code
        // Note: custom-functions-textarea is handled by CustomFunctionsTab.onActivate()

        console.log('Unicode autocomplete enabled for all math inputs');
    }

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

        // Add coordinate system from renderer
        if (renderer && renderer.coordinateSystem) {
            settings.coordinateSystem = renderer.coordinateSystem.toJSON();
        }

        // Save to localStorage
        localStorage.setItem('vectorFieldSettings', JSON.stringify(settings));
        return settings;
    }

    // ========================================
    // Mobile Panel Manager
    // ========================================
    function initMobilePanelManager() {
        const panels = {
            'controls': $('#controls'),
            'rendering': $('#rendering-panel')
        };

        let currentPanel = null;

        function showPanel(panelName) {
            // Hide any currently open panel
            if (currentPanel) {
                hidePanel(currentPanel);
            }

            const panel = panels[panelName];
            if (!panel) {
                logger.warn(`Mobile panel not found: ${panelName}`);
                return;
            }

            // For floating panels (rendering), just show them
            // For main panels (controls), add mobile overlay class
            if (panelName === 'rendering') {
                panel.show();
                // Update white point visibility based on current operator
                try {
                    const operator = manager.get('tonemap-operator');
                    if (operator) {
                        updateWhitePointVisibility(operator.getValue());
                    }
                } catch (e) {
                    logger.warn('Could not update white point visibility:', e);
                }
            } else {
                panel.addClass('mobile-overlay active');
                panel.find('.mobile-overlay-close').show();
            }

            // Mark menu button as active
            $(`#mobile-menu-${panelName}`).addClass('active');

            currentPanel = panelName;
        }

        function hidePanel(panelName) {
            const panel = panels[panelName];
            if (!panel) return;

            // For floating panels, just hide them
            // For main panels, remove mobile overlay class
            if (panelName === 'rendering') {
                panel.hide();
            } else {
                panel.removeClass('mobile-overlay active');
                panel.find('.mobile-overlay-close').hide();
            }

            // Remove active state from menu button
            $(`#mobile-menu-${panelName}`).removeClass('active');

            if (currentPanel === panelName) {
                currentPanel = null;
            }
        }

        function hideAllPanels() {
            Object.keys(panels).forEach(hidePanel);
        }

        // Wire up mobile menu buttons
        $('#mobile-menu-controls').on('click', function() {
            if (currentPanel === 'controls') {
                hidePanel('controls');
            } else {
                showPanel('controls');
            }
        });

        $('#mobile-menu-rendering').on('click', function() {
            if (currentPanel === 'rendering') {
                hidePanel('rendering');
            } else {
                showPanel('rendering');
            }
        });

        // Wire up close buttons in panels
        $('.mobile-overlay-close').on('click', function() {
            const panel = $(this).closest('[id]');
            const panelId = panel.attr('id');

            // Map panel IDs to panel names
            const panelMap = {
                'controls': 'controls'
            };

            const panelName = panelMap[panelId];
            if (panelName) {
                hidePanel(panelName);
            }
        });

        // Export for external access
        return {
            showPanel,
            hidePanel,
            hideAllPanels,
            getCurrentPanel: () => currentPanel
        };
    }

    // Initialize mobile panel manager
    window.mobilePanelManager = initMobilePanelManager();

    // ========================================
    // Mobile Timestep Slider Sync
    // ========================================
    const $mobileTimestep = $('#mobile-timestep');
    const $mobileTimestepValue = $('#mobile-timestep-value');

    // Sync mobile slider with main timestep control
    function syncMobileTimestep() {
        const value = timestepControl.getValue();
        // Use log scale for mobile slider (same as AnimatableTimestepControl)
        const logValue = Math.log10(value);
        $mobileTimestep.val(logValue);
        $mobileTimestepValue.text(value.toFixed(4));
    }

    // Listen to main timestep changes
    $('#timestep').on('input change', syncMobileTimestep);

    // Update main timestep when mobile slider changes
    $mobileTimestep.on('input', function() {
        const logValue = parseFloat($(this).val());
        const value = Math.pow(10, logValue);

        // Update the main timestep control's DOM element directly
        const timestepElement = $('#timestep');
        timestepElement.val(value);

        // Update both displays
        timestepControl.updateDisplay(value);
        $mobileTimestepValue.text(value.toFixed(4));

        // Call onChange callback if it exists
        if (timestepControl.onChange) {
            timestepControl.onChange(value);
        }

        // Trigger the debounced apply (same as main control does)
        manager.debouncedApply();
    });

    // Initialize mobile slider with current value
    syncMobileTimestep();

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
        const canvas = renderer?.gl?.canvas;
        const expandedBBox = expandBBoxForAspectRatio(savedSettings.bbox, canvas);
        renderer.updateConfig({
            bbox: expandedBBox,
            reinitializeParticles: false
        });
        logger.verbose('Restored bbox expanded for aspect ratio');
    }

    // Return manager for external access
    return manager;
}

// ========================================
// Helper Functions
// ========================================

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
 * Load a specific preset
 */
function loadPreset(name, manager) {
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
    manager.applySettings(preset);

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
 * Export loadPreset for global access
 */
export { loadPreset };

/**
 * Custom preset management
 */
const CUSTOM_PRESETS_KEY = 'customPresets';

function loadCustomPresets() {
    try {
        const stored = localStorage.getItem(CUSTOM_PRESETS_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch (e) {
        console.error('Failed to load custom presets:', e);
        return {};
    }
}

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

function deleteCustomPreset(name) {
    const presets = loadCustomPresets();
    delete presets[name];
    try {
        localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
    } catch (e) {
        console.error('Failed to delete custom preset:', e);
    }
}

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
