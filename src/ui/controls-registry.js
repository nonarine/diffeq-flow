/**
 * Main Controls Registry and Orchestrator
 *
 * This module serves as the central initialization point for the entire UI control system.
 * It coordinates control registration, event handlers, specialized modules, and initialization
 * sequence.
 *
 * Responsibilities:
 * - Create and configure ControlManager
 * - Register all controls (web components, sliders, checkboxes, etc.)
 * - Set up event handlers for control changes
 * - Initialize specialized modules (gradient panel, rendering panel, animation, presets, mobile)
 * - Handle settings loading/saving/sharing
 * - Set up keyboard shortcuts and modal system
 * - Coordinate bbox (camera) state restoration
 *
 * Architecture:
 * - Delegates complex UI logic to specialized modules (visibility-manager, settings-manager, etc.)
 * - Maintains backward compatibility with main.js API
 * - Returns manager instance for external access
 *
 * @module controls-registry
 */

import {
    ControlManager,
    SliderControl,
    LogSliderControl,
    PercentSliderControl,
    AdaptiveSliderControl,
    TimestepControl,
    TextControl,
    CheckboxControl
} from './control-base.js';

import { AnimatableParameterControl } from './parameter-control.js';
import {
    DimensionInputsControl,
    MapperParamsControl,
    GradientControl,
    TransformParamsControl
} from './custom-controls.js';

import { initGradientEditor } from './gradient-editor.js';
import { showCoordinateEditor } from './coordinate-editor.js';
import { CoordinateSystem, getCartesianSystem } from '../math/coordinate-systems.js';
import { getDefaultGradient } from '../math/gradients.js';
import { logger } from '../utils/debug-logger.js';
import { resizeAccordion } from './accordion-utils.js';
import { FieldEquationWorkflow } from '../math/field-equation-workflow.js';
import { WebComponentControlRegistry } from './web-component-registry.js';
import { equationOverlay } from './equation-overlay.js';
import { AnimationController } from '../animation/animation-controller.js';
import { ZIndex } from './utils/z-index.js';
import { PanelManager } from './utils/panel-manager.js';
import { isMobile } from './utils/mobile.js';

// Import specialized modules (Phase 3 refactoring)
import { updateWhitePointVisibility, updateExpressionControls, updateGradientButtonVisibility, updateVelocityScalingVisibility } from './visibility-manager.js';
import { loadSettingsFromURLOrStorage, saveAllSettings, applyInitialSettings, restoreBBox, shareSettings } from './settings-manager.js';
import { loadPresets, loadPreset, initPresetControls } from './preset-manager.js';
import { initGradientPanel } from './panel-controllers/gradient-panel.js';
import { initRenderingPanel } from './panel-controllers/rendering-panel.js';
import { initAnimationControls } from './animation-setup.js';
import { initMobilePanelManager, setupMobileControlsSync } from './panel-controllers/mobile-panel-manager.js';

/**
 * Initialize UI controls with ControlManager
 *
 * This is the main entry point for the UI system. It creates the ControlManager,
 * registers all controls, sets up event handlers, initializes specialized modules,
 * and loads saved settings.
 *
 * @param {Renderer} renderer - The renderer instance
 * @param {Function} callback - Called when initialization is complete with { manager, state, saveSettings }
 * @returns {ControlManager} The manager instance for external access
 */
export function initControls(renderer, callback) {
    // Track previous dimensions to detect changes
    let previousDimensions = null;

    // ========================================
    // Create ControlManager
    // ========================================

    const manager = new ControlManager({
        renderer: renderer,
        storageKey: 'vectorFieldSettings',
        debounceTime: 300,
        onApply: (settings) => {
            // Transform implicitIterations into integratorParams
            if (settings.implicitIterations !== undefined) {
                settings.integratorParams = { iterations: settings.implicitIterations };
            }

            // Update expression inputs BEFORE applying to renderer if dimensions changed
            // This ensures settings.expressions has the correct length
            const currentDimensions = settings.dimensions;
            if (currentDimensions !== previousDimensions) {
                const expressionsControl = manager.get('dimension-inputs');
                if (expressionsControl) {
                    expressionsControl.updateInputs(currentDimensions);
                    // Re-get expressions with correct length
                    settings.expressions = expressionsControl.getValue();
                }

                // Update mapper params control if dimensions changed
                const mapperParamsControl = manager.get('mapper-params');
                if (mapperParamsControl) {
                    mapperParamsControl.updateControls();
                }

                previousDimensions = currentDimensions;
            }

            // Keep original expressions for equation overlay display (LaTeX should show user input, not algebraic expansion)
            const originalExpressions = settings.expressions ? [...settings.expressions] : null;

            // Extract expressions from settings (will be applied via workflow)
            const expressions = settings.expressions;
            delete settings.expressions;

            // Apply all settings EXCEPT expressions to renderer
            renderer.updateConfig(settings);

            // Apply expressions via automated workflow (validates, generates GLSL, applies)
            if (expressions && expressions.length > 0 && window.notebook) {
                try {
                    const workflow = new FieldEquationWorkflow();
                    workflow.executeAutomated(expressions, window.notebook, renderer);
                    logger.info(`Applied ${expressions.length} field equations via workflow`);
                } catch (error) {
                    logger.error(`Failed to apply field equations:`, error.message);
                    showError(`Failed to apply field equations: ${error.message}`);
                    return; // Don't save settings if expressions failed
                }
            }

            // Update coordinate system (just updates variable names, doesn't rebuild DOM)
            if (renderer.coordinateSystem) {
                const expressionsControl = manager.get('dimension-inputs');
                if (expressionsControl) {
                    expressionsControl.setCoordinateSystem(renderer.coordinateSystem, false);
                }
            }

            // Update equation overlay if visible
            if (equationOverlay.isVisible() && originalExpressions && renderer.coordinateSystem) {
                const variables = renderer.coordinateSystem.getVariableNames();

                // Expand custom functions for LaTeX rendering
                // (Parser needs expanded form to handle function calls)
                const expandedForLatex = originalExpressions.map(expr => {
                    if (window.notebook) {
                        try {
                            return window.notebook.expandFunctions(expr);
                        } catch (error) {
                            logger.warn(`Failed to expand "${expr}" for LaTeX:`, error.message);
                            return expr; // Fall back to original
                        }
                    }
                    return expr;
                });

                equationOverlay.updateEquations(expandedForLatex, variables);
            }

            // Save to localStorage (including bbox and coordinate system)
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
    // Create specialized components
    // ========================================

    // Web Component registry for async control registration
    const webComponentRegistry = new WebComponentControlRegistry(manager);
    manager.webComponentRegistry = webComponentRegistry;

    // ========================================
    // Register all controls
    // ========================================

    // === Dimension and integration controls ===

    // Integrator select (web component with onChange handler)
    webComponentRegistry.register('select-control', 'integrator');
    const integratorElement = document.getElementById('integrator');
    if (integratorElement) {
        integratorElement.addEventListener('change', () => {
            const value = integratorElement.getValue();
            // Show/hide implicit method controls based on integrator type
            const isImplicit = value.startsWith('implicit-') || value === 'trapezoidal';
            $('#implicit-iterations-group').toggle(isImplicit);
            $('#solution-method-group').toggle(isImplicit);
            resizeAccordion('#integrator', 0);
        });
    }

    // Solution method select
    webComponentRegistry.register('select-control', 'solution-method');

    // Timestep slider with custom increment buttons
    webComponentRegistry.register('animatable-timestep', 'timestep');

    // === Particle controls ===

    // Fade slider with custom logarithmic transform
    webComponentRegistry.register('animatable-slider', 'fade').then(el => {
        if (el) {
            // Import and apply fade transform
            import('./web-components/animatable-slider.js').then(module => {
                const { createFadeTransform } = module;
                const { transform, inverseTransform } = createFadeTransform();
                el.setCustomTransform(transform, inverseTransform);

                // Update bounds display now that transform is set
                if (el.updateBoundsDisplay) {
                    el.updateBoundsDisplay();
                }
            });
        }
    });

    // === Transform controls ===

    // Transform select (web component with onChange handler)
    webComponentRegistry.register('select-control', 'transform');
    const transformElement = document.getElementById('transform');
    if (transformElement) {
        transformElement.addEventListener('change', () => {
            // Update transform params UI when transform type changes
            const transformParamsControl = manager.get('transform-params');
            if (transformParamsControl) {
                transformParamsControl.updateControls();
            }
        });
    }

    const transformParamsControl = manager.register(new TransformParamsControl({}, {
        settingsKey: 'transformParams'
    }));

    // Set up transform params cross-reference
    transformParamsControl.setTransformControl(transformElement);

    // === Mapper controls ===

    // Mapper select (web component with onChange handler)
    webComponentRegistry.register('select-control', 'mapper');
    const mapperElement = document.getElementById('mapper');
    if (mapperElement) {
        mapperElement.addEventListener('change', () => {
            // Update mapper params UI when mapper type changes
            const mapperParamsControl = manager.get('mapper-params');
            if (mapperParamsControl) {
                mapperParamsControl.updateControls();
            }
        });
    }

    const mapperParamsControl = manager.register(new MapperParamsControl({ dim1: 0, dim2: 1 }, {
        settingsKey: 'mapperParams'
    }));

    // Set up mapper params cross-references
    const dimensionsElement = document.getElementById('dimensions');
    mapperParamsControl.setRelatedControls(dimensionsElement, mapperElement);

    // === Color mode controls ===

    // Color mode select (web component with onChange handler)
    webComponentRegistry.register('select-control', 'color-mode');
    const colorModeElement = document.getElementById('color-mode');
    if (colorModeElement) {
        colorModeElement.addEventListener('change', () => {
            const value = colorModeElement.getValue();
            updateExpressionControls(value);
            updateGradientButtonVisibility(value);
            updateVelocityScalingVisibility(value);
        });
    }

    const colorExpressionControl = manager.register(new TextControl('color-expression', 'x * y', {
        settingsKey: 'colorExpression'
    }));

    const gradientControl = manager.register(new GradientControl(getDefaultGradient(), {
        settingsKey: 'colorGradient'
    }));

    // Velocity scale mode select
    webComponentRegistry.register('select-control', 'velocity-scale-mode');

    // === Expression inputs (custom control) ===

    const expressionsControl = manager.register(new DimensionInputsControl(['-y', 'x'], {
        settingsKey: 'expressions'
    }));

    // === Tone mapping controls ===

    // Tonemap operator select (web component with onChange handler)
    webComponentRegistry.register('select-control', 'tonemap-operator');
    const tonemapElement = document.getElementById('tonemap-operator');
    if (tonemapElement) {
        tonemapElement.addEventListener('change', () => {
            const value = tonemapElement.getValue();
            updateWhitePointVisibility(value);
        });
    }

    // Particle render mode select
    webComponentRegistry.register('select-control', 'particle-render-mode');

    // === Web Component controls ===

    // Linear sliders
    webComponentRegistry.register('linear-slider', 'dimensions').then(el => {
        if (el) {
            el.onChange = (value) => {
                logger.verbose('Dimensions changed to:', value);

                // Update dimension inputs immediately (before debounced apply)
                const expressionsControl = manager.get('dimension-inputs');
                if (expressionsControl) {
                    logger.verbose('Updating dimension inputs with dimensions:', value);
                    expressionsControl.updateInputs(value);
                }
            };
        }
    });

    webComponentRegistry.register('linear-slider', 'implicit-iterations');
    webComponentRegistry.register('linear-slider', 'particles');
    webComponentRegistry.register('linear-slider', 'drop');
    webComponentRegistry.register('linear-slider', 'supersample-factor');
    webComponentRegistry.register('linear-slider', 'bloom-radius');
    webComponentRegistry.register('linear-slider', 'bilateral-spatial');
    webComponentRegistry.register('linear-slider', 'bilateral-intensity');

    // Log sliders
    webComponentRegistry.register('log-slider', 'exposure');
    webComponentRegistry.register('log-slider', 'gamma');
    webComponentRegistry.register('log-slider', 'luminance-gamma');
    webComponentRegistry.register('log-slider', 'highlight-compression');
    webComponentRegistry.register('log-slider', 'compression-threshold');
    webComponentRegistry.register('log-slider', 'white-point');
    webComponentRegistry.register('log-slider', 'particle-intensity');
    webComponentRegistry.register('log-slider', 'particle-size');
    webComponentRegistry.register('log-slider', 'frame-limit').then(el => {
        if (el) {
            el.onChange = (value) => {
                if (window.renderer) {
                    window.renderer.frameLimit = value;
                }
            };
        }
    });

    // Percent sliders
    webComponentRegistry.register('percent-slider', 'smaa-intensity');
    webComponentRegistry.register('percent-slider', 'smaa-threshold');
    webComponentRegistry.register('percent-slider', 'bloom-intensity');
    webComponentRegistry.register('percent-slider', 'bloom-alpha');
    webComponentRegistry.register('percent-slider', 'color-saturation');
    webComponentRegistry.register('percent-slider', 'brightness-desat');
    webComponentRegistry.register('percent-slider', 'saturation-buildup');
    webComponentRegistry.register('percent-slider', 'respawn-margin');

    // Checkboxes
    webComponentRegistry.register('check-box', 'velocity-log-scale');
    webComponentRegistry.register('check-box', 'show-grid');
    webComponentRegistry.register('check-box', 'show-equations');
    webComponentRegistry.register('check-box', 'frame-limit-enabled');
    webComponentRegistry.register('check-box', 'use-hdr');
    webComponentRegistry.register('check-box', 'use-depth-test');
    webComponentRegistry.register('check-box', 'smaa-enabled');
    webComponentRegistry.register('check-box', 'bilateral-enabled');
    webComponentRegistry.register('check-box', 'bloom-enabled');
    webComponentRegistry.register('check-box', 'animation-clear-particles');
    webComponentRegistry.register('check-box', 'animation-clear-screen');
    webComponentRegistry.register('check-box', 'animation-smooth-timing');
    webComponentRegistry.register('check-box', 'animation-lock-shaders');
    webComponentRegistry.register('check-box', 'animation-half-loops');

    // Frame limit enabled checkbox - wire up renderer integration
    const frameLimitEnabledCheckbox = document.getElementById('frame-limit-enabled');
    if (frameLimitEnabledCheckbox) {
        frameLimitEnabledCheckbox.addEventListener('change', () => {
            if (window.renderer) {
                window.renderer.frameLimitEnabled = frameLimitEnabledCheckbox.getValue();
            }
        });
    }

    // Show equations checkbox - wire up equation overlay
    const showEquationsCheckbox = document.getElementById('show-equations');
    if (showEquationsCheckbox) {

        const cb = async () => {
            const showEquations = showEquationsCheckbox.getValue();
            equationOverlay.setVisible(showEquations);

            // If showing for the first time, render current equations
            if (showEquations) {
                await equationOverlay.refresh();
            }
        };

        showEquationsCheckbox.addEventListener('change', cb);
    }

    // === Theme control (special handling for immediate application) ===

    webComponentRegistry.register('select-control', 'theme-selector');
    const themeElement = document.getElementById('theme-selector');
    if (themeElement) {
        themeElement.addEventListener('change', () => {
            const value = themeElement.getValue();
            // Apply theme immediately (no debounce)
            if (value === 'light') {
                $('body').addClass('light-theme');
            } else {
                $('body').removeClass('light-theme');
            }
            // Save immediately
            manager.saveToStorage();
        });
    }

    // ========================================
    // Special buttons (non-managed controls)
    // ========================================

    // Default Settings button
    $('#default-settings').on('click', function() {
        manager.resetAll();
        manager.clearStorage();
        manager.apply();
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
            const blob = await renderer.captureRenderBuffer();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const resolution = `${renderer.renderWidth}x${renderer.renderHeight}`;
            link.download = `vector-field-${timestamp}-${resolution}.png`;

            link.href = url;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
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

        // Save current settings before reload
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

    // ========================================
    // Slider +/- button delegation
    // ========================================

    $(document).on('click', '.slider-btn', function() {
        const sliderId = $(this).data('slider');
        const action = $(this).data('action');

        // Safety check: ignore buttons without slider ID
        if (!sliderId) {
            console.warn('Slider button missing data-slider attribute');
            return;
        }

        // Try to get the registered control
        const control = manager.get(sliderId);
        if (control && control.handleButtonAction) {
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

        console.warn(`No button handler found for slider: ${sliderId}`);
    });

    // ========================================
    // Configure Coordinates button
    // ========================================

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

            // Update dimension input labels
            expressionsControl.setCoordinateSystem(newSystem);

            // Trigger apply to recompile shaders
            manager.apply();
        });
    });

    // ========================================
    // Initialize specialized modules
    // ========================================

    // Initialize gradient panel (manages gradient editor UI)
    const gradientPanelHandlers = initGradientPanel(manager, gradientControl);

    // Initialize rendering panel (manages rendering settings UI)
    const renderingPanelHandlers = initRenderingPanel(manager);

    // Initialize animation controls (manages animation UI and controllers)
    // Returns the AnimationController instance
    const animationController = initAnimationControls(manager, renderer, webComponentRegistry);

    // Initialize preset controls (manages preset dropdown and buttons)
    initPresetControls(manager);

    // Load built-in presets
    loadPresets();

    // Initialize mobile panel manager (manages mobile overlay panels)
    // Pass the PanelManager instance, not the handlers object
    const mobilePanelManager = initMobilePanelManager(renderingPanelHandlers.renderingPanelManager);
    window.mobilePanelManager = mobilePanelManager;

    // Set up mobile controls sync (syncs mobile controls with main controls)
    setupMobileControlsSync(manager, webComponentRegistry);

    // ========================================
    // Modal system and keyboard shortcuts
    // ========================================

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

    // Menu bar notebook button
    $(document).on('click', '#menu-notebook', function() {
        if (window.notebookEditor) {
            window.notebookEditor.open();
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

    // ========================================
    // Animation section accordion toggle
    // ========================================

    $('#animation-section-toggle').on('click', function() {
        const content = $('#animation-section-content');
        const arrow = $('#animation-section-arrow');
        const histogram = $('#histogram-panel');
        const cursor = $('#cursor-position');

        if (content.is(':visible')) {
            content.slideUp(200);
            arrow.text('▼');
            histogram.removeClass('shifted');
            cursor.removeClass('shifted');
        } else {
            content.slideDown(200);
            arrow.text('▲');
            histogram.addClass('shifted');
            cursor.addClass('shifted');
        }
    });

    // ========================================
    // Initialization sequence
    // ========================================

    // First, initialize controls (creates DOM elements and attaches listeners)
    manager.initializeControls();

    // Initialize equation overlay
    equationOverlay.initialize('equation-overlay');

    // Then load and apply saved settings
    const savedSettings = loadSettingsFromURLOrStorage();

    // Set mobile-specific defaults if no saved settings exist
    if (isMobile() && (!savedSettings || (savedSettings.frameLimitEnabled === undefined && savedSettings.frameLimit === undefined))) {
        if (frameLimitEnabledCheckbox) frameLimitEnabledCheckbox.setValue(true);
        const frameLimitElement = document.getElementById('frame-limit');
        if (frameLimitElement) {
            frameLimitElement.setValue(200);
        }
        if (window.renderer) {
            window.renderer.frameLimitEnabled = true;
            window.renderer.frameLimit = 200;
        }
        logger.info('Mobile detected: frame limit enabled at 200 frames');
    }

    // Wait for all Web Components to be ready before applying settings
    webComponentRegistry.whenAllReady().then(() => {
        if (savedSettings) {
            // Apply initial settings (includes coordinate system restoration)
            applyInitialSettings(savedSettings, manager, renderer);

            // Convert Unicode to ASCII in expressions
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
                if (params.dim1 !== undefined && params.dim2 !== undefined) {
                    if (params.dim1 === params.dim2) {
                        console.warn('Invalid mapper params: dim1 and dim2 are the same, fixing to default');
                        savedSettings.mapperParams = { dim1: 0, dim2: 1 };
                    }
                }
            }
        }

        // Apply settings after all Web Components are ready
        webComponentRegistry.applyWhenReady(savedSettings).then(() => {
            // Initialize animation controller options from restored checkbox states
            const animClearParticles = document.getElementById('animation-clear-particles');
            const animClearScreen = document.getElementById('animation-clear-screen');
            const animSmoothTiming = document.getElementById('animation-smooth-timing');
            const animLockShaders = document.getElementById('animation-lock-shaders');

            animationController.setOptions({
                clearParticles: animClearParticles?.getValue ? animClearParticles.getValue() : false,
                clearScreen: animClearScreen?.getValue ? animClearScreen.getValue() : false,
                smoothTiming: animSmoothTiming?.getValue ? animSmoothTiming.getValue() : false,
                lockShaders: animLockShaders?.getValue ? animLockShaders.getValue() : false
            });

            // Initialize frame limit settings in renderer
            if (renderer) {
                renderer.frameLimitEnabled = frameLimitEnabledCheckbox?.getValue ? frameLimitEnabledCheckbox.getValue() : false;
                const frameLimitElement = document.getElementById('frame-limit');
                if (frameLimitElement) {
                    renderer.frameLimit = frameLimitElement.getValue();
                }
            }

            // Initialize special UI states
            updateWhitePointVisibility(manager.get('tonemap-operator').getValue());
            const colorMode = manager.get('color-mode').getValue();
            updateExpressionControls(colorMode);
            updateGradientButtonVisibility(colorMode);
            updateVelocityScalingVisibility(colorMode);

            // Initialize implicit method controls visibility
            const currentIntegrator = manager.get('integrator').getValue() || 'rk2';
            const isImplicit = currentIntegrator.startsWith('implicit-') || currentIntegrator === 'trapezoidal';
            $('#implicit-iterations-group').toggle(isImplicit);
            $('#solution-method-group').toggle(isImplicit);

            // Initialize equation overlay visibility
            if (showEquationsCheckbox?.getValue && showEquationsCheckbox.getValue()) {
                equationOverlay.setVisible(true);
                // Get current equations and variables from renderer
                if (renderer && renderer.coordinateSystem) {
                    // Use renderer.expressions (already expanded during settings apply)
                    // Don't use simple UI expressions which may have custom functions
                    const expressions = renderer.expressions;
                    if (expressions) {
                        const variables = renderer.coordinateSystem.getVariableNames();
                        equationOverlay.updateEquations(expressions, variables);
                    }
                }
            }

            // Apply initial theme
            const theme = manager.get('theme-selector').getValue();
            if (theme === 'light') {
                $('body').addClass('light-theme');
            }
        });
    });

    // ========================================
    // Unicode autocomplete setup
    // ========================================

    if (window.unicodeAutocomplete) {
        window.unicodeAutocomplete.setEnabled(true);

        // Attach to all math input fields
        window.unicodeAutocomplete.attachToAll('[id^="expr-"]');
        window.unicodeAutocomplete.attachToAll('#mapper-expression');
        window.unicodeAutocomplete.attachToAll('#color-expression');
        window.unicodeAutocomplete.attachToAll('#custom-color-code');
        window.unicodeAutocomplete.attachToAll('#custom-integrator-code');

        console.log('Unicode autocomplete enabled for all math inputs');
    }

    // ========================================
    // Sync UI from renderer state
    // ========================================

    /**
     * Sync simple UI controls to match renderer's authoritative state
     * Called after field equations editor applies changes
     */
    function syncUIFromRenderer() {
        if (!renderer) return;

        logger.info('Syncing UI from renderer state');

        // Sync dimensions (web component)
        const dimensionsElement = document.getElementById('dimensions');
        if (dimensionsElement && dimensionsElement.setValue && renderer.dimensions !== undefined) {
            const currentDimValue = dimensionsElement.getValue();
            if (currentDimValue !== renderer.dimensions) {
                logger.info(`Syncing dimensions: ${currentDimValue} → ${renderer.dimensions}`);
                dimensionsElement.setValue(renderer.dimensions);
            }
        }

        // Sync expression inputs
        const expressionsControl = manager.get('dimension-inputs');
        if (expressionsControl && renderer.expressions) {
            logger.info('Syncing expressions from renderer:', renderer.expressions);
            expressionsControl.setValue(renderer.expressions);
        }

        // Update equation overlay if visible
        if (equationOverlay && equationOverlay.isVisible && equationOverlay.isVisible() &&
            renderer.expressions && renderer.coordinateSystem) {
            const variables = renderer.coordinateSystem.getVariableNames();

            // renderer.expressions are already expanded (workflow does this)
            // No need to expand again
            equationOverlay.updateEquations(renderer.expressions, variables);
            logger.info('Updated equation overlay with new expressions');
        }

        logger.info('UI sync complete');
    }

    // Make sync function globally available
    window.syncUIFromRenderer = syncUIFromRenderer;

    // Make manager globally available for field editor sync
    window.manager = manager;
    window.equationOverlay = equationOverlay;

    // ========================================
    // Create save function and callback
    // ========================================

    function saveAllSettingsWrapper() {
        return saveAllSettings(manager, renderer);
    }

    // Call initialization callback
    if (callback) {
        callback({
            manager,
            state: manager.getSettings(),
            saveSettings: saveAllSettingsWrapper
        });
    }

    // ========================================
    // Restore bbox from saved settings
    // ========================================

    // Restore bbox from saved settings (handles aspect ratio expansion internally)
    if (savedSettings && savedSettings.bbox) {
        restoreBBox(savedSettings, renderer);
    }

    // Return manager for external access
    return manager;
}

// ========================================
// Helper Functions
// ========================================

/**
 * Show error message
 * @param {string} message - Error message to display
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

// ========================================
// Exports
// ========================================

// Export loadPreset for backward compatibility
export { loadPreset } from './preset-manager.js';
