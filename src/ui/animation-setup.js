/**
 * Animation system setup and controls
 *
 * Manages animation-related UI controls including:
 * - AnimationController initialization
 * - Animation alpha/speed component registration
 * - Frame capture with progress tracking
 * - Animation export to ZIP (with multi-part splitting)
 * - Animation template JSON export
 *
 * @module ui/animation-setup
 */

import { AnimationController } from '../animation/animation-controller.js';
import { logger } from '../utils/debug-logger.js';

/**
 * Initialize animation controls and setup
 *
 * @param {ControlManager} manager - The control manager instance
 * @param {Renderer} renderer - The renderer instance
 * @param {WebComponentControlRegistry} webComponentRegistry - Web component registry
 * @returns {AnimationController} The initialized animation controller
 */
export function initAnimationControls(manager, renderer, webComponentRegistry) {
    // ========================================
    // Create Animation Controller
    // ========================================

    const animationController = new AnimationController(renderer, manager);
    // Make it globally accessible for debugging
    window.animationController = animationController;

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
    const frameLimitEnabledCheckbox = document.getElementById('frame-limit-enabled');
    const syncCheckboxElement = document.getElementById('sync-steps-to-frame-limit');

    /**
     * Sync steps-per-increment to frame limit value
     * When enabled, this keeps the frame limit in sync with animation speed
     * and automatically enables frame limiting with screen/particle reset
     */
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

    // ========================================
    // Animation Options Checkboxes
    // ========================================

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

    // ========================================
    // Create Animation Button
    // ========================================

    /**
     * Create Animation button - captures frames during alpha animation
     * Toggles between "Create" and "Stop" modes during animation
     */
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

    // ========================================
    // Download Animation Button
    // ========================================

    /**
     * Download Animation button - exports captured frames to ZIP
     * Automatically splits large animations into multiple ZIP files (300 frames each)
     * to avoid browser memory issues and download size limits
     */
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

    // ========================================
    // Export Animation JSON Button
    // ========================================

    /**
     * Export Animation JSON button - creates animation template JSON
     * Exports current settings as a base for complex keyframe animations
     */
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

    // ========================================
    // Return animation controller for external access
    // ========================================

    return animationController;
}
