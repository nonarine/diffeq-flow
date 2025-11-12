/**
 * Browser UI controls for animation playback
 * Allows loading animation JSONs, previewing, and exporting frames
 */

import { Animator } from '../animation/animator.js';
import { logger } from '../utils/debug-logger.js';

export class AnimationControls {
    constructor(renderer, controlManager) {
        this.renderer = renderer;
        this.manager = controlManager;
        this.animator = new Animator(renderer, controlManager);
        this.currentScript = null;

        this.initializeUI();
        this.attachEventListeners();
    }

    /**
     * Initialize UI elements
     */
    initializeUI() {
        // Get DOM elements (matching existing HTML IDs)
        this.fileInput = document.getElementById('animation-script-input');
        this.playButton = document.getElementById('animation-run-btn');
        this.pauseButton = document.getElementById('animation-pause-btn');
        this.stopButton = document.getElementById('animation-stop-btn');
        this.exportButton = document.getElementById('animation-download-btn');
        this.progressBar = document.getElementById('progress-bar');
        this.progressText = document.getElementById('progress-text');
        this.infoPanel = document.getElementById('animation-info');
        this.progressPanel = document.getElementById('animation-progress');

        // Initial state
        this.setButtonStates(false, false, false);
        if (this.infoPanel) this.infoPanel.style.display = 'none';
        if (this.progressPanel) this.progressPanel.style.display = 'none';
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // File input handles JSON loading
        this.fileInput?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                await this.loadAnimationFile(file);
            }
        });

        // Play button
        this.playButton?.addEventListener('click', () => {
            this.play();
        });

        // Pause button
        this.pauseButton?.addEventListener('click', () => {
            this.pause();
        });

        // Stop button
        this.stopButton?.addEventListener('click', () => {
            this.stop();
        });

        // Export button
        this.exportButton?.addEventListener('click', () => {
            this.exportFrames();
        });
    }

    /**
     * Load animation from JSON file
     */
    async loadAnimationFile(file) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);

            // Validate and load script
            this.currentScript = this.animator.loadScript(data);

            // Show info panel and populate with script details
            if (this.infoPanel) {
                this.infoPanel.style.display = 'block';
                const duration = this.currentScript.timeline[this.currentScript.timeline.length - 1].time;
                const totalFrames = Math.ceil(duration * this.currentScript.fps);

                document.getElementById('anim-name').textContent = this.currentScript.name;
                document.getElementById('anim-param').textContent = `${this.currentScript.timeline.length} keyframes`;
                document.getElementById('anim-range').textContent = `0s → ${duration.toFixed(1)}s`;
                document.getElementById('anim-frames').textContent = totalFrames;
                document.getElementById('anim-fps').textContent = this.currentScript.fps;
                document.getElementById('anim-duration').textContent = `${duration.toFixed(1)}s`;
            }

            this.setButtonStates(true, false, false);

            logger.info('Animation loaded successfully', this.currentScript);

        } catch (error) {
            alert(`Failed to load animation: ${error.message}`);
            logger.error('Failed to load animation', error);
            this.setButtonStates(false, false, false);
        }
    }

    /**
     * Play animation
     */
    async play() {
        if (!this.currentScript) {
            alert('No animation loaded');
            return;
        }

        if (this.animator.isRunning) {
            // Resume if paused
            this.animator.resume();
            this.setButtonStates(false, true, true);
            return;
        }

        try {
            this.setButtonStates(false, true, true);
            if (this.progressPanel) this.progressPanel.style.display = 'block';
            this.updateProgress(0, 0, 0);

            // Run animation with progress callback
            await this.animator.run((frameNum, totalFrames, time) => {
                this.updateProgress(frameNum, totalFrames, time);
            });

            this.setButtonStates(true, false, false);
            this.enableExport();
            alert(`Animation complete: ${this.animator.frames.length} frames captured`);

        } catch (error) {
            alert(`Animation error: ${error.message}`);
            logger.error('Animation playback failed', error);
            this.setButtonStates(true, false, false);
        }
    }

    /**
     * Pause animation
     */
    pause() {
        this.animator.pause();
        this.setButtonStates(true, false, true);
    }

    /**
     * Stop animation
     */
    stop() {
        this.animator.stop();
        this.setButtonStates(true, false, false);
        if (this.progressPanel) this.progressPanel.style.display = 'none';
    }

    /**
     * Export captured frames as ZIP
     */
    async exportFrames() {
        if (this.animator.frames.length === 0) {
            alert('No frames to export');
            return;
        }

        try {
            await this.animator.downloadFrames();
        } catch (error) {
            alert(`Export error: ${error.message}`);
            logger.error('Frame export failed', error);
        }
    }

    /**
     * Update button states
     */
    setButtonStates(canPlay, canPause, canStop) {
        if (this.playButton) this.playButton.disabled = !canPlay;
        if (this.pauseButton) this.pauseButton.disabled = !canPause;
        if (this.stopButton) this.stopButton.disabled = !canStop;
    }

    /**
     * Enable export button
     */
    enableExport() {
        if (this.exportButton) {
            this.exportButton.disabled = false;
        }
    }

    /**
     * Update progress bar and text
     */
    updateProgress(frameNum, totalFrames, time) {
        if (this.progressBar) {
            const percent = totalFrames > 0 ? (frameNum / totalFrames) * 100 : 0;
            this.progressBar.style.width = `${percent}%`;
        }

        if (this.progressText) {
            if (totalFrames > 0) {
                this.progressText.textContent = `Frame ${frameNum}/${totalFrames} (t=${time.toFixed(2)}s)`;
            } else {
                this.progressText.textContent = '';
            }
        }
    }
}
