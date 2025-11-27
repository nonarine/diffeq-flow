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
    CheckboxControl
} from './control-base.js';
// AnimatableSliderControl and AnimatableTimestepControl replaced with web components
import { AnimatableParameterControl } from './parameter-control.js';
import { DimensionInputsControl, MapperParamsControl, GradientControl, TransformParamsControl } from './custom-controls.js';
import { initGradientEditor } from './gradient-editor.js';
import { showCoordinateEditor } from './coordinate-editor.js';
import { CoordinateSystem, getCartesianSystem } from '../math/coordinate-systems.js';
import { getDefaultGradient } from '../math/gradients.js';
import { logger } from '../utils/debug-logger.js';
import { resizeAccordion } from './accordion-utils.js';
import { WebComponentControlRegistry } from './web-component-registry.js';
import { AnimationController } from '../animation/animation-controller.js';

/**
 * Initialize UI controls with ControlManager
 * @param {Renderer} renderer - The renderer instance
 * @param {Function} callback - Called when initialization is complete
 */
export function initControls(renderer, callback) {
    // Track previous dimensions to detect changes
    let previousDimensions = null;

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

            // Apply settings directly to renderer
            // Allow temporary error states (e.g. dimension/coordinate system mismatch)
            // Shader compilation will fail gracefully and user can fix it
            renderer.updateConfig(settings);

            // Update coordinate system (just updates variable names, doesn't rebuild DOM)
            if (renderer.coordinateSystem) {
                const expressionsControl = manager.get('dimension-inputs');
                if (expressionsControl) {
                    expressionsControl.setCoordinateSystem(renderer.coordinateSystem, false);
                }
            }

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

    // Create Web Component registry for async control registration
    const webComponentRegistry = new WebComponentControlRegistry(manager);
    // Store registry on manager for access in other functions (like loadPreset)
    manager.webComponentRegistry = webComponentRegistry;

    // Create Animation Controller
    const animationController = new AnimationController(renderer, manager);
    // Make it globally accessible for debugging
    window.animationController = animationController;

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

            // Resize accordion to accommodate shown/hidden controls
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

    // drop-low-velocity is now a web component with settings-key

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

    // Set up transform params cross-reference (pass web component element)
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
    // Note: dimensions is now a Web Component, get it via DOM
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

    // Velocity scale mode select (web component)
    webComponentRegistry.register('select-control', 'velocity-scale-mode');

    // velocity-log-scale is now a web component with settings-key

    // === Expression inputs (custom control) ===

    const expressionsControl = manager.register(new DimensionInputsControl(['-y', 'x'], {
        settingsKey: 'expressions'
    }));

    // use-hdr and use-depth-test are now web components with settings-key

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

    // Particle render mode select (web component)
    webComponentRegistry.register('select-control', 'particle-render-mode');

    // === Render Scale (formerly Supersampling) ===
    // Allows rendering at different resolutions (0.5x for performance, 2x+ for quality)

    // Register Web Component controls
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

    // Bilateral sliders (linear with transform)
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

    // Checkboxes (all migrated to web components)
    webComponentRegistry.register('check-box', 'velocity-log-scale');
    webComponentRegistry.register('check-box', 'show-grid');
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

    // frame-limit-enabled is now a web component with settings-key
    // Wire up the onChange behavior for renderer integration
    const frameLimitEnabledCheckbox = document.getElementById('frame-limit-enabled');
    if (frameLimitEnabledCheckbox) {
        frameLimitEnabledCheckbox.addEventListener('change', () => {
            if (window.renderer) {
                window.renderer.frameLimitEnabled = frameLimitEnabledCheckbox.getValue();
            }
        });
    }

    // === Animation controls ===
    // Animation checkboxes are now web components with settings-key
    // Event handlers are wired up below in the animation section

    logger.info('Animation alpha control registered');

    // === Theme control (special handling for immediate application) ===

    // Theme select (web component with onChange handler for immediate application)
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

        // Force z-index for mobile (ensure above menu bar)
        if (window.innerWidth <= 768) {
            panel.css({'z-index': '20000', 'position': 'fixed'});
            panel.find('.floating-panel-close').css('z-index', '99999');
            $('#menu-bar').css('z-index', '1');
        }

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
        // Restore menu bar z-index on mobile
        if (window.innerWidth <= 768) {
            $('#menu-bar').css('z-index', '10001');
        }
    }

    // Open gradient editor button
    $('#open-gradient-editor').on('click', function() {
        showGradientPanel();
    });

    // Reset gradient to default button
    $('#reset-gradient').on('click', function() {
        const defaultGradient = getDefaultGradient();
        if (gradientEditor) {
            gradientEditor.setGradient(defaultGradient);
            gradientControl.notifyChange(defaultGradient);
        }
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
        const panel = $('#rendering-panel');
        panel.show();

        // Force z-index for mobile (ensure above menu bar)
        if (window.innerWidth <= 768) {
            panel.css({'z-index': '20000', 'position': 'fixed'});
            panel.find('.floating-panel-close').css('z-index', '99999');
            $('#menu-bar').css('z-index', '1');
        }

        updateWhitePointVisibility(manager.get('tonemap-operator').getValue());
    }

    function hideRenderingPanel() {
        $('#rendering-panel').hide();
        // Restore menu bar z-index on mobile
        if (window.innerWidth <= 768) {
            $('#menu-bar').css('z-index', '10001');
        }
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

    // ========================================
    // Animation Panel Setup
    // ========================================

    // Register animation web components and set controller
    const animationAlphaElement = document.getElementById('animation-alpha');
    const animationSpeedElement = document.getElementById('animation-speed');

    if (animationAlphaElement) {
        animationAlphaElement.setController(animationController);
        // Register with control manager for save/restore
        webComponentRegistry.register('animation-alpha', 'animation-alpha');
        logger.info('Animation alpha web component registered');
    }

    if (animationSpeedElement) {
        animationSpeedElement.setController(animationController);
        logger.info('Animation speed web component registered');
    }

    // Sync steps-per-increment to frame limit
    const frameLimitElement = document.getElementById('frame-limit');
    // Note: frameLimitEnabledCheckbox already declared above
    const syncCheckboxElement = document.getElementById('sync-steps-to-frame-limit');

    function syncStepsToFrameLimit() {
        try {
            console.log('syncStepsToFrameLimit called');
            if (typeof syncCheckboxElement?.getValue !== 'function') { console.log('bail: syncCheckbox no getValue'); return; }
            if (!syncCheckboxElement.getValue()) { console.log('bail: syncCheckbox not checked'); return; }
            if (typeof animationSpeedElement?.getValue !== 'function') { console.log('bail: animationSpeed no getValue'); return; }
            if (typeof frameLimitElement?.setValue !== 'function') { console.log('bail: frameLimit no setValue'); return; }

            const steps = animationSpeedElement.getValue();
            console.log('syncing steps:', steps);

            // Update UI
            frameLimitElement.setValue(steps);

            // Enable frame limiting if not already
            if (frameLimitEnabledCheckbox && !frameLimitEnabledCheckbox.getValue()) {
                frameLimitEnabledCheckbox.setValue(true);
            }

            // Update renderer and restart
            if (window.renderer) {
                window.renderer.frameLimit = steps;
                window.renderer.frameLimitEnabled = true;
                window.renderer.totalFrames = 0; // Reset frame counter
                window.renderer.clearRenderBuffer(); // Clear screen
                window.renderer.resetParticles(); // Reset particle positions
                if (!window.renderer.isRunning) {
                    window.renderer.start();
                }
            }
        } catch (e) {
            console.warn('syncStepsToFrameLimit error:', e);
        }
    }

    // Sync when checkbox is checked (web component fires 'change' event)
    syncCheckboxElement?.addEventListener('change', function() {
        try {
            if (typeof syncCheckboxElement.getValue === 'function' && syncCheckboxElement.getValue()) {
                syncStepsToFrameLimit();
            }
        } catch (e) {
            console.warn('sync checkbox change error:', e);
        }
    });

    // Sync when animation speed changes (if checkbox is checked)
    if (animationSpeedElement) {
        animationSpeedElement.onChange = syncStepsToFrameLimit;
    }

    // Register sync checkbox with web component registry
    if (syncCheckboxElement) {
        webComponentRegistry.register('check-box', 'sync-steps-to-frame-limit');
    }

    // Wire animation checkboxes to controller options
    const animClearParticles = document.getElementById('animation-clear-particles');
    const animClearScreen = document.getElementById('animation-clear-screen');
    const animSmoothTiming = document.getElementById('animation-smooth-timing');
    const animLockShaders = document.getElementById('animation-lock-shaders');

    if (animClearParticles) {
        animClearParticles.addEventListener('change', function() {
            animationController.setOptions({ clearParticles: animClearParticles.getValue() });
        });
    }

    if (animClearScreen) {
        animClearScreen.addEventListener('change', function() {
            animationController.setOptions({ clearScreen: animClearScreen.getValue() });
        });
    }

    if (animSmoothTiming) {
        animSmoothTiming.addEventListener('change', function() {
            animationController.setOptions({ smoothTiming: animSmoothTiming.getValue() });
        });
    }

    if (animLockShaders) {
        animLockShaders.addEventListener('change', function() {
            animationController.setOptions({ lockShaders: animLockShaders.getValue() });
        });
    }

    // Update loops info text based on half-loops checkbox
    const halfLoopsElement = document.getElementById('animation-half-loops');
    if (halfLoopsElement) {
        halfLoopsElement.addEventListener('change', function() {
            const isHalfLoops = halfLoopsElement.getValue();
            const infoText = isHalfLoops
                ? 'Number of half cycles (1 = 0.0 → 1.0, 2 = 0.0 → 1.0 → 0.0)'
                : 'Number of complete alpha cycles (0.0 → 1.0 → 0.0)';
            $('#animation-loops-info').text(infoText);
        });
    }

    // Create Animation button - captures frames during alpha animation
    const createAnimBtn = document.getElementById('animation-create-btn');
    if (createAnimBtn) {
        createAnimBtn.addEventListener('action', function() {
            // Check if animation is currently running (stop mode)
            if (animationController.isRunning) {
                // Stop the animation early
                animationController.stop();

                // Restore button state
                createAnimBtn.setLabel('Create Animation');
                createAnimBtn.setIcon('▶');
                createAnimBtn.setStyle('#4CAF50');

                // Re-enable inputs
                const framesInput = document.getElementById('animation-frames');
                const loopsInput = document.getElementById('animation-loops');
                const halfLoopsCheckbox = document.getElementById('animation-half-loops');
                const downloadBtn = document.getElementById('animation-download-btn');

                if (framesInput) framesInput.disabled = false;
                if (loopsInput) loopsInput.disabled = false;
                if (halfLoopsCheckbox) halfLoopsCheckbox.disabled = false;
                if (downloadBtn) downloadBtn.setEnabled(animationController.getFrames().length > 0);

                // Update progress to show it was stopped
                $('#progress-text').text(`Stopped: ${animationController.getFrames().length} frames captured`);

                logger.info(`Animation stopped early: ${animationController.getFrames().length} frames captured`);
                return;
            }

            // Get parameters from number-input web components
            const framesInput = document.getElementById('animation-frames');
            const loopsInput = document.getElementById('animation-loops');
            const halfLoopsCheckbox = document.getElementById('animation-half-loops');
            const downloadBtn = document.getElementById('animation-download-btn');

            const totalFrames = framesInput ? framesInput.getValue() : 100;
            const loops = loopsInput ? loopsInput.getValue() : 1;
            const isHalfLoops = halfLoopsCheckbox?.getValue ? halfLoopsCheckbox.getValue() : false;

            // Update UI - button becomes stop button
            createAnimBtn.setLabel('Stop Animation');
            createAnimBtn.setIcon('⏹');
            createAnimBtn.setStyle('#f44336');

            // Disable inputs
            if (framesInput) framesInput.disabled = true;
            if (loopsInput) loopsInput.disabled = true;
            if (halfLoopsCheckbox) halfLoopsCheckbox.disabled = true;
            if (downloadBtn) downloadBtn.setEnabled(false);

            // Show progress
            $('#animation-progress').show();
            $('#progress-bar').css('width', '0%');
            $('#progress-text').text(`Frame 0 / ${totalFrames}`);
            $('#progress-alpha').text('α: 0.00');

            // Start animation with frame capture
            animationController.start({
                captureFrames: true,
                totalFrames: totalFrames,
                loops: loops,
                halfLoops: isHalfLoops,
                onProgress: (frameCount, total, alpha) => {
                    const progress = (frameCount / total) * 100;
                    $('#progress-bar').css('width', `${progress}%`);
                    $('#progress-text').text(`Frame ${frameCount} / ${total}`);
                    $('#progress-alpha').text(`α: ${alpha.toFixed(2)}`);
                },
                onComplete: (frames) => {
                    // Restore button state
                    createAnimBtn.setLabel('Create Animation');
                    createAnimBtn.setIcon('▶');
                    createAnimBtn.setStyle('#4CAF50');

                    // Re-enable inputs
                    if (framesInput) framesInput.disabled = false;
                    if (loopsInput) loopsInput.disabled = false;
                    if (halfLoopsCheckbox) halfLoopsCheckbox.disabled = false;
                    if (downloadBtn) downloadBtn.setEnabled(true);

                    // Update progress
                    $('#progress-bar').css('width', '100%');
                    $('#progress-text').text(`Complete: ${frames.length} frames`);

                    logger.info(`Animation creation complete: ${frames.length} frames captured`);
                }
            });
        });
    }

    // Download Animation button
    const downloadBtn = document.getElementById('animation-download-btn');
    if (downloadBtn) {
        downloadBtn.addEventListener('action', async function() {
            const capturedFrames = animationController.getFrames();

            if (capturedFrames.length === 0) {
                alert('No frames to download. Create an animation first.');
                return;
            }

            downloadBtn.setLoading(true, 'Creating ZIP...');

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

                    downloadBtn.setLoading(true, `Creating ZIP ${part + 1}/${numParts}...`);

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
                downloadBtn.setLoading(false);
            }
        });
    }

    // Export Animation JSON button
    const exportJsonBtn = document.getElementById('export-animation-json');
    if (exportJsonBtn) {
        exportJsonBtn.addEventListener('action', function() {
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
    }

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
        // On mobile, enable frame limit and set to 200 frames by default (only if not already saved)
        if (frameLimitEnabledCheckbox) frameLimitEnabledCheckbox.setValue(true);
        // frame-limit is a Web Component
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
    // This prevents flashing when loading saved settings
    webComponentRegistry.whenAllReady().then(() => {
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

        }

        // Apply settings after all Web Components are ready
        webComponentRegistry.applyWhenReady(savedSettings).then(() => {
            // Initialize animation controller options from restored checkbox states
            animationController.setOptions({
                clearParticles: animClearParticles?.getValue ? animClearParticles.getValue() : false,
                clearScreen: animClearScreen?.getValue ? animClearScreen.getValue() : false,
                smoothTiming: animSmoothTiming?.getValue ? animSmoothTiming.getValue() : false,
                lockShaders: animLockShaders?.getValue ? animLockShaders.getValue() : false
            });

            // Sync steps to frame limit if checkbox was restored as checked
            try {
                if (typeof syncCheckboxElement?.getValue === 'function' && syncCheckboxElement.getValue()) {
                    syncStepsToFrameLimit();
                }
            } catch (e) {
                console.warn('sync init error:', e);
            }

            // Initialize frame limit settings in renderer
            if (renderer) {
                renderer.frameLimitEnabled = frameLimitEnabledCheckbox?.getValue ? frameLimitEnabledCheckbox.getValue() : false;
                // frame-limit is a Web Component
                const frameLimitElement = document.getElementById('frame-limit');
                if (frameLimitElement) {
                    renderer.frameLimit = frameLimitElement.getValue();
                }
            }

            // Initialize special UI states (after web components are ready)
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
        });
    });

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
                // Force z-index for mobile (ensure above menu bar)
                panel.css('z-index', '20000');
                panel.find('.mobile-overlay-close').css('z-index', '99999');
                $('#menu-bar').css('z-index', '1');
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
                // Restore menu bar z-index on mobile
                $('#menu-bar').css('z-index', '10001');
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
    // Mobile Controls Component Sync
    // ========================================
    const mobileControls = document.getElementById('mobile-controls');

    if (mobileControls) {
        // Sync mobile controls with main controls
        function syncMobileControls() {
            const timestepControl = manager.get('timestep');
            if (timestepControl) {
                mobileControls.setTimestep(timestepControl.getValue());
            }
        }

        // Listen to main timestep changes
        $('#timestep').on('input change', syncMobileControls);

        // Update main controls when mobile controls change
        mobileControls.onTimestepChange = (value) => {
            const timestepControl = manager.get('timestep');
            if (timestepControl) {
                timestepControl.setValue(value);
                manager.debouncedApply();
            }
        };

        mobileControls.onFrameLimitEnabledChange = (enabled) => {
            const control = manager.get('frame-limit-enabled');
            if (control) {
                control.setValue(enabled);
                manager.debouncedApply();
            }
        };

        mobileControls.onFrameLimitChange = (limit) => {
            const control = manager.get('frame-limit');
            if (control) {
                control.setValue(limit);
                manager.debouncedApply();
            }
        };

        // Initialize mobile controls with current values (after all web components are ready)
        // Use a slight delay to ensure settings have been restored
        webComponentRegistry.whenAllReady().then(() => {
            setTimeout(() => {
                syncMobileControls();

                const frameLimitEnabledControl = manager.get('frame-limit-enabled');
                const frameLimitControl = manager.get('frame-limit');

                if (frameLimitEnabledControl) {
                    mobileControls.setFrameLimitEnabled(frameLimitEnabledControl.getValue());
                }
                if (frameLimitControl) {
                    mobileControls.setFrameLimit(frameLimitControl.getValue());
                }
            }, 100);
        });
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
