/**
 * AnimationController - Alpha-based parameter animation system
 *
 * Manages interactive real-time parameter animation using a simple alpha variable (0.0-1.0).
 * This is separate from the Animator keyframe system (animator.js), which is used for
 * professional batch rendering with complex timelines.
 *
 * Responsibilities:
 * - Manage animation alpha state and playback loop
 * - Query and update animatable controls
 * - Frame capture during animation
 * - Timing smoothing with EMA
 * - Shader lock management
 * - Integration with renderer
 *
 * Usage:
 *   const controller = new AnimationController(renderer, controlManager);
 *   controller.setAlpha(0.5);  // Manual alpha change
 *   controller.start();         // Begin auto-animation
 *   controller.stop();          // Stop auto-animation
 */

import { logger } from '../utils/debug-logger.js';
import { AnimatableParameterControl } from '../ui/parameter-control.js';

export class AnimationController {
    constructor(renderer, controlManager) {
        this.renderer = renderer;
        this.controlManager = controlManager;

        // Animation state
        this.isRunning = false;
        this.animationFrameId = null;
        this.direction = 1; // 1 for forward, -1 for backward
        this.alpha = 0.0;

        // Speed and timing
        this.stepsPerIncrement = 10;
        this.stepCounter = 0;

        // Options (set via setOptions)
        this.options = {
            clearParticles: false,
            clearScreen: false,
            smoothTiming: false,
            lockShaders: false
        };

        // Timing smoothing state - Asymmetric EMA to track high percentile (slow frames)
        this.ALPHA_STEP_TIME_TARGET_PERCENTILE = 95;
        this.ALPHA_STEP_TIME_DECAY = 0.002;
        this.ALPHA_STEP_TIME_UPWARD = (this.ALPHA_STEP_TIME_TARGET_PERCENTILE / (100 - this.ALPHA_STEP_TIME_TARGET_PERCENTILE)) * this.ALPHA_STEP_TIME_DECAY;
        this.ALPHA_STEP_TIME_WARMUP_CYCLES = 3;
        this.ALPHA_STEP_TIME_DISPLAY_INTERVAL = 10;
        this.alphaStepTimeEMA = null;
        this.alphaStepStartTime = null;
        this.alphaStepWarmupCounter = 0;
        this.alphaStepDisplayCounter = 0;

        // Caching for performance
        this.cachedAnimatableControls = null;
        this.cachedAnimatableParams = null;
        this.lastAppliedSettings = null;

        // Shader lock tracking
        this.shaderLockWasEnabled = false;

        // Logger verbosity during animation
        this.savedLoggerVerbosity = null;

        // Frame capture state
        this.frameCaptureMode = null; // null, 'continuous', or 'fixed'
        this.frameCaptureTotal = 0;
        this.frameCaptureCount = 0;
        this.frameCaptureAlphaIncrement = 0.01;
        this.capturedFrames = [];
        this.frameCaptureOnProgress = null;
        this.frameCaptureOnComplete = null;

        // Event listeners
        this._alphaChangedListeners = [];
    }

    /**
     * Set current alpha value and optionally update animatable controls
     * @param {number} alpha - Alpha value (0.0 to 1.0)
     * @param {boolean} updateControls - Whether to update animatable controls
     */
    setAlpha(alpha, updateControls = true) {
        this.alpha = Math.max(0.0, Math.min(1.0, alpha));

        // Update renderer
        if (this.renderer) {
            this.renderer.setAnimationAlpha(this.alpha);
        }

        // Update animatable controls if requested
        if (updateControls) {
            this._updateAnimatableControls(this.alpha);

            // Apply changed settings to renderer
            this._applyChangedSettings();

            // Handle clear options
            if (this.options.clearParticles && this.renderer) {
                this.renderer.resetParticles();
            }
            if (this.options.clearScreen && this.renderer) {
                this.renderer.clearRenderBuffer();
            }
        }

        // Notify listeners
        this._emitAlphaChanged(this.alpha);
    }

    /**
     * Get current alpha value
     * @returns {number} Current alpha (0.0 to 1.0)
     */
    getAlpha() {
        return this.alpha;
    }

    /**
     * Set animation speed (steps per increment)
     * @param {number} stepsPerIncrement - Number of integration steps before incrementing alpha
     */
    setSpeed(stepsPerIncrement) {
        this.stepsPerIncrement = Math.max(1, Math.round(stepsPerIncrement));
    }

    /**
     * Set animation options
     * @param {Object} options - Animation options
     * @param {boolean} options.clearParticles - Clear particles on alpha change
     * @param {boolean} options.clearScreen - Clear screen on alpha change (freeze mode)
     * @param {boolean} options.smoothTiming - Enable timing smoothing with EMA
     * @param {boolean} options.lockShaders - Lock shader recompilation during animation
     */
    setOptions(options) {
        Object.assign(this.options, options);
    }

    /**
     * Start auto-animation
     * @param {Object} captureOptions - Optional frame capture configuration
     * @param {boolean} captureOptions.captureFrames - Whether to capture frames
     * @param {number} captureOptions.totalFrames - Total frames to capture
     * @param {number} captureOptions.loops - Number of loops
     * @param {boolean} captureOptions.halfLoops - Whether to count as half-loops
     * @param {Function} captureOptions.onProgress - Progress callback (frameCount, totalFrames, alpha)
     * @param {Function} captureOptions.onComplete - Completion callback (frames)
     */
    start(captureOptions = {}) {
        // Stop if already running
        if (this.isRunning) return;

        const {
            captureFrames = false,
            totalFrames = 0,
            loops = 1,
            halfLoops = false,
            onProgress = null,
            onComplete = null
        } = captureOptions;

        // Setup frame capture if requested
        if (captureFrames) {
            this.frameCaptureMode = 'fixed';
            this.frameCaptureTotal = totalFrames;
            this.frameCaptureCount = 0;
            this.capturedFrames = [];
            this.frameCaptureOnProgress = onProgress;
            this.frameCaptureOnComplete = onComplete;

            // Calculate alpha increment based on half-loops mode
            // halfLoops=false: each loop goes 0->1->0 (2 ranges per loop)
            // halfLoops=true: each loop goes 0->1 (1 range per loop)
            const rangesPerLoop = halfLoops ? 1.0 : 2.0;
            this.frameCaptureAlphaIncrement = (loops * rangesPerLoop) / totalFrames;
        } else {
            this.frameCaptureMode = 'continuous';
            this.frameCaptureAlphaIncrement = 0.01;
        }

        // Start animation
        this.isRunning = true;

        // Pause main renderer loop so we have full control
        if (this.renderer) {
            this.renderer.stop();
        }

        // Reset timing state
        this._resetTimingState();

        // Lock shaders if enabled
        if (this.options.lockShaders && this.renderer) {
            this.renderer.lockShaderRecompilation = true;
            this.shaderLockWasEnabled = true;
            logger.info('Shader recompilation lock ENABLED (animation started)', null, false);
        } else {
            this.shaderLockWasEnabled = false;
        }

        // Buffer logs during animation
        this.savedLoggerVerbosity = logger.verbosity;
        logger.setVerbosity('silent');

        // Cache animatable controls
        this._cacheAnimatableControls();

        // Start the animation loop
        this._renderLoop();
    }

    /**
     * Stop auto-animation
     */
    stop() {
        this.isRunning = false;

        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // Resume main renderer loop
        if (this.renderer && !this.renderer.isRunning) {
            this.renderer.start();
        }

        // Hide step time counter
        const stepTimeCounter = document.getElementById('step-time-counter');
        if (stepTimeCounter) {
            stepTimeCounter.style.display = 'none';
        }

        // Clear caches
        this.cachedAnimatableControls = null;
        this.cachedAnimatableParams = null;
        this.lastAppliedSettings = null;

        // Restore logger verbosity (auto-flushes buffered logs)
        if (this.savedLoggerVerbosity !== null) {
            logger.setVerbosity(this.savedLoggerVerbosity);
            this.savedLoggerVerbosity = null;
        }

        // Unlock shaders if we locked them
        if (this.shaderLockWasEnabled && this.renderer) {
            this.renderer.lockShaderRecompilation = false;
            this.shaderLockWasEnabled = false;
            logger.info('Shader recompilation lock DISABLED (animation stopped)');
        }

        // Reset frame capture mode
        this.frameCaptureMode = null;
    }

    /**
     * Get captured frames
     * @returns {Array<Blob>} Array of captured frame blobs
     */
    getFrames() {
        return this.capturedFrames;
    }

    /**
     * Add listener for alpha changes
     * @param {Function} listener - Callback function (alpha)
     */
    onAlphaChanged(listener) {
        this._alphaChangedListeners.push(listener);
    }

    /**
     * Remove listener for alpha changes
     * @param {Function} listener - Callback function to remove
     */
    offAlphaChanged(listener) {
        const index = this._alphaChangedListeners.indexOf(listener);
        if (index !== -1) {
            this._alphaChangedListeners.splice(index, 1);
        }
    }

    // ========================================
    // Private Methods
    // ========================================

    /**
     * Reset timing state for new animation
     * @private
     */
    _resetTimingState() {
        this.stepCounter = 0;
        this.alphaStepTimeEMA = null;
        this.alphaStepStartTime = null;
        this.alphaStepWarmupCounter = 0;
        this.alphaStepDisplayCounter = 0;
        this.lastAppliedSettings = null;
    }

    /**
     * Cache animatable controls for performance
     * @private
     */
    _cacheAnimatableControls() {
        // Cache regular animatable controls
        this.cachedAnimatableControls = [];
        this.controlManager.controls.forEach((control) => {
            if (control && typeof control.animationEnabled !== 'undefined' && control.updateFromAlpha) {
                this.cachedAnimatableControls.push(control);
            }
        });

        // Cache animatable parameter controls
        this.cachedAnimatableParams = [];
        const transformParamsControl = this.controlManager.controls.get('transform-params');
        if (transformParamsControl && transformParamsControl.parameterControls) {
            transformParamsControl.parameterControls.forEach((paramControl) => {
                if (paramControl instanceof AnimatableParameterControl) {
                    this.cachedAnimatableParams.push(paramControl);
                }
            });
        }
    }

    /**
     * Update all animatable controls based on current alpha
     * @private
     * @param {number} alpha - Alpha value (0.0 to 1.0)
     */
    _updateAnimatableControls(alpha) {
        // Build cache if not available (for manual setAlpha calls)
        if (!this.cachedAnimatableControls) {
            this._cacheAnimatableControls();
        }

        // Update regular animatable controls
        for (let i = 0; i < this.cachedAnimatableControls.length; i++) {
            const control = this.cachedAnimatableControls[i];
            if (control.animationEnabled) {
                control.updateFromAlpha(alpha);
            }
        }

        // Update animatable parameter controls
        for (let i = 0; i < this.cachedAnimatableParams.length; i++) {
            const paramControl = this.cachedAnimatableParams[i];
            if (paramControl.animationEnabled) {
                paramControl.updateFromAlpha(alpha);
            }
        }
    }

    /**
     * Apply changed settings to renderer
     * @private
     */
    _applyChangedSettings() {
        if (!this.renderer || !this.cachedAnimatableControls) return;

        // Build changed settings directly from animatable controls
        const changedSettings = {};

        // Collect values from animatable sliders
        for (let i = 0; i < this.cachedAnimatableControls.length; i++) {
            const control = this.cachedAnimatableControls[i];
            const newValue = control.getValue();
            if (this.lastAppliedSettings === null || newValue !== this.lastAppliedSettings[control.settingsKey]) {
                changedSettings[control.settingsKey] = newValue;
            }
        }

        // Collect values from animatable parameters
        for (let i = 0; i < this.cachedAnimatableParams.length; i++) {
            const paramControl = this.cachedAnimatableParams[i];
            const newValue = paramControl.getValue();
            const paramKey = paramControl.parameterName;

            // Build transformParams object
            if (!changedSettings.transformParams) {
                changedSettings.transformParams = this.lastAppliedSettings?.transformParams
                    ? {...this.lastAppliedSettings.transformParams}
                    : {};
            }

            if (this.lastAppliedSettings === null || newValue !== this.lastAppliedSettings.transformParams?.[paramKey]) {
                changedSettings.transformParams[paramKey] = newValue;
            }
        }

        // Apply changed settings to renderer (only if there are changes)
        if (Object.keys(changedSettings).length > 0) {
            try {
                this.renderer.updateConfig(changedSettings);

                // Update last applied settings
                if (this.lastAppliedSettings === null) {
                    this.lastAppliedSettings = {};
                }
                Object.assign(this.lastAppliedSettings, changedSettings);
            } catch (error) {
                logger.error('Failed to apply animation settings:', error);
            }
        } else if (this.lastAppliedSettings === null) {
            // First cycle with no animatable settings - initialize tracking
            this.lastAppliedSettings = {};
        }
    }

    /**
     * Main animation render loop
     * @private
     */
    _renderLoop() {
        if (!this.isRunning) {
            return; // Animation was stopped
        }

        // Increment step counter
        this.stepCounter++;

        // Start timing on first step of alpha cycle
        if (this.stepCounter === 1) {
            // Clear shader recompilation flag
            if (this.renderer && this.renderer.shadersJustRecompiled) {
                this.renderer.shadersJustRecompiled = false;
            }
            this.alphaStepStartTime = performance.now();
        }

        // Check if we should increment alpha
        if (this.stepCounter >= this.stepsPerIncrement) {
            this.stepCounter = 0;

            // If freeze mode: accumulate final step, display the buffer, THEN clear for next cycle
            if (this.options.clearScreen && this.renderer) {
                this.renderer.render(true);
            }

            // Calculate elapsed time for this alpha cycle
            const alphaStepEndTime = performance.now();
            const alphaStepElapsed = alphaStepEndTime - this.alphaStepStartTime;

            // Update timing EMA
            this._updateTimingEMA(alphaStepElapsed);

            // Update alpha value
            this.alpha += this.direction * this.frameCaptureAlphaIncrement;

            // Bounce at boundaries
            if (this.alpha >= 1.0) {
                this.alpha = 1.0;
                this.direction = -1;
            } else if (this.alpha <= 0.0) {
                this.alpha = 0.0;
                this.direction = 1;
            }

            // Update controls and renderer
            this._updateAnimatableControls(this.alpha);
            if (this.renderer) {
                this.renderer.setAnimationAlpha(this.alpha);
            }
            this._applyChangedSettings();

            // Notify listeners (web components)
            this._emitAlphaChanged(this.alpha);

            // Handle clear options
            if (this.options.clearParticles && this.renderer) {
                this.renderer.resetParticles();
            }

            // Render
            if (this.renderer) {
                if (!this.options.clearScreen) {
                    this.renderer.render(true);
                }

                if (this.options.clearScreen) {
                    this.renderer.clearRenderBuffer(true);
                }
            }

            // Capture frame if in frame capture mode
            if (this.frameCaptureMode === 'fixed') {
                this._captureFrame();
            }

            // Alpha cycle complete - check if we need to delay for timing smoothing
            if (this.options.smoothTiming && this.alphaStepTimeEMA !== null && alphaStepElapsed < this.alphaStepTimeEMA) {
                const delayNeeded = this.alphaStepTimeEMA - alphaStepElapsed;
                setTimeout(() => {
                    if (this.isRunning) {
                        this.animationFrameId = requestAnimationFrame(() => this._renderLoop());
                    }
                }, delayNeeded);
                return; // Exit early, setTimeout will continue the loop
            }
        } else {
            // Between alpha changes (steps 1 to N-1)
            if (this.renderer) {
                if (this.options.clearScreen) {
                    // Freeze mode: accumulate in hidden buffer (don't display yet)
                    this.renderer.render(false);
                } else {
                    // Normal mode: render and display continuously
                    this.renderer.render(true);
                }
            }
        }

        // Continue animation loop if still running
        if (this.isRunning) {
            this.animationFrameId = requestAnimationFrame(() => this._renderLoop());
        }
    }

    /**
     * Update timing EMA for smoothing
     * @private
     * @param {number} elapsed - Elapsed time in milliseconds
     */
    _updateTimingEMA(elapsed) {
        // Update asymmetric EMA (tracks ~95th percentile) after warm-up
        if (this.alphaStepWarmupCounter < this.ALPHA_STEP_TIME_WARMUP_CYCLES) {
            // Still warming up - skip this cycle
            this.alphaStepWarmupCounter++;
        } else if (this.alphaStepTimeEMA === null) {
            // Warm-up complete - initialize EMA from this cycle
            this.alphaStepTimeEMA = elapsed;
        } else {
            // Use asymmetric smoothing: fast upward tracking, slow downward decay
            if (elapsed > this.alphaStepTimeEMA) {
                // Slower than EMA - track upward quickly
                this.alphaStepTimeEMA = this.ALPHA_STEP_TIME_UPWARD * elapsed +
                                      (1 - this.ALPHA_STEP_TIME_UPWARD) * this.alphaStepTimeEMA;
            } else {
                // Faster than EMA - decay slowly
                this.alphaStepTimeEMA = this.ALPHA_STEP_TIME_DECAY * elapsed +
                                      (1 - this.ALPHA_STEP_TIME_DECAY) * this.alphaStepTimeEMA;
            }
        }

        // Update step time display if smoothing is enabled (throttled)
        if (this.options.smoothTiming) {
            this.alphaStepDisplayCounter++;
            if (this.alphaStepDisplayCounter >= this.ALPHA_STEP_TIME_DISPLAY_INTERVAL) {
                this.alphaStepDisplayCounter = 0;
                const stepTimeCounter = document.getElementById('step-time-counter');
                if (stepTimeCounter) {
                    if (this.alphaStepTimeEMA === null) {
                        stepTimeCounter.textContent = `Step: ${elapsed.toFixed(1)}ms (warming up...)`;
                    } else {
                        stepTimeCounter.textContent = `Step: ${elapsed.toFixed(1)}ms (EMA: ${this.alphaStepTimeEMA.toFixed(1)}ms)`;
                    }
                    stepTimeCounter.style.display = 'block';
                }
            }
        } else {
            const stepTimeCounter = document.getElementById('step-time-counter');
            if (stepTimeCounter) {
                stepTimeCounter.style.display = 'none';
            }
        }
    }

    /**
     * Capture current frame
     * @private
     */
    async _captureFrame() {
        if (!this.renderer) return;

        try {
            const blob = await this.renderer.captureRenderBuffer();
            this.capturedFrames.push(blob);
            this.frameCaptureCount++;

            // Call progress callback
            if (this.frameCaptureOnProgress) {
                this.frameCaptureOnProgress(this.frameCaptureCount, this.frameCaptureTotal, this.alpha);
            }

            // Check if we're done
            if (this.frameCaptureCount >= this.frameCaptureTotal) {
                this.stop();
                if (this.frameCaptureOnComplete) {
                    this.frameCaptureOnComplete(this.capturedFrames);
                }
            }
        } catch (error) {
            console.error('Failed to capture animation frame:', error);
            this.stop();
            alert('Failed to capture animation frame. Check console for details.');
        }
    }

    /**
     * Emit alpha changed event to listeners
     * @private
     * @param {number} alpha - New alpha value
     */
    _emitAlphaChanged(alpha) {
        for (const listener of this._alphaChangedListeners) {
            listener(alpha);
        }
    }
}
