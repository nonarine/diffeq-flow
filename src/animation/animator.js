/**
 * Keyframe-based animation system for rendering particle flow animations
 * Supports timeline with multiple simultaneous parameter changes,
 * easing functions, and proper burn-in/accumulation workflow
 */

import { logger } from '../utils/debug-logger.js';

/**
 * Easing functions for smooth parameter interpolation
 */
const EASING_FUNCTIONS = {
    linear: t => t,
    easeIn: t => t * t,
    easeOut: t => 1 - Math.pow(1 - t, 2),
    easeInOut: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
    easeInCubic: t => t * t * t,
    easeOutCubic: t => 1 - Math.pow(1 - t, 3),
    easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    elastic: t => {
        const c4 = (2 * Math.PI) / 3;
        return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
    },
    bounce: t => {
        const n1 = 7.5625;
        const d1 = 2.75;
        if (t < 1 / d1) {
            return n1 * t * t;
        } else if (t < 2 / d1) {
            return n1 * (t -= 1.5 / d1) * t + 0.75;
        } else if (t < 2.5 / d1) {
            return n1 * (t -= 2.25 / d1) * t + 0.9375;
        } else {
            return n1 * (t -= 2.625 / d1) * t + 0.984375;
        }
    }
};

/**
 * Animation script executor with keyframe timeline
 */
export class Animator {
    constructor(renderer, controlManager) {
        this.renderer = renderer;
        this.manager = controlManager;
        this.frames = [];
        this.isRunning = false;
        this.isPaused = false;
        this.script = null;
    }

    /**
     * Load and validate animation script
     */
    loadScript(scriptData) {
        // Validate required fields
        if (!scriptData.baseSettings) {
            throw new Error('Animation script missing baseSettings');
        }
        if (!scriptData.timeline || !Array.isArray(scriptData.timeline)) {
            throw new Error('Animation script missing timeline array');
        }
        if (scriptData.timeline.length < 2) {
            throw new Error('Timeline must have at least 2 keyframes');
        }

        // Validate timeline is sorted by time
        for (let i = 1; i < scriptData.timeline.length; i++) {
            if (scriptData.timeline[i].time <= scriptData.timeline[i - 1].time) {
                throw new Error('Timeline keyframes must be sorted by time');
            }
        }

        // Set defaults
        this.script = {
            name: scriptData.name || 'Untitled Animation',
            description: scriptData.description || '',
            fps: scriptData.fps || 30,
            baseSettings: scriptData.baseSettings,
            timeline: scriptData.timeline.map(kf => ({
                time: kf.time,
                settings: kf.settings || {},
                easing: kf.easing || 'linear',
                convergenceSteps: kf.convergenceSteps || 0
            })),
            frameConfig: {
                burnInSteps: scriptData.frameConfig?.burnInSteps || 5000,
                clearAfterBurnIn: scriptData.frameConfig?.clearAfterBurnIn !== undefined
                    ? scriptData.frameConfig.clearAfterBurnIn : true,
                accumulationSteps: scriptData.frameConfig?.accumulationSteps || 2000
            }
        };

        const duration = this.script.timeline[this.script.timeline.length - 1].time;
        const totalFrames = Math.ceil(duration * this.script.fps);

        logger.info(`Loaded animation: ${this.script.name}`);
        logger.info(`  Duration: ${duration}s @ ${this.script.fps} fps = ${totalFrames} frames`);
        logger.info(`  Keyframes: ${this.script.timeline.length}`);

        return this.script;
    }

    /**
     * Get keyframe indices and interpolation factor for a given time
     */
    getKeyframeIndices(time) {
        const timeline = this.script.timeline;

        // Handle edge cases
        if (time <= timeline[0].time) {
            return { prev: 0, next: 0, t: 0 };
        }
        if (time >= timeline[timeline.length - 1].time) {
            return { prev: timeline.length - 1, next: timeline.length - 1, t: 1 };
        }

        // Find surrounding keyframes
        for (let i = 1; i < timeline.length; i++) {
            if (time <= timeline[i].time) {
                const prev = i - 1;
                const next = i;
                const t = (time - timeline[prev].time) / (timeline[next].time - timeline[prev].time);
                return { prev, next, t };
            }
        }

        // Should never reach here
        return { prev: timeline.length - 1, next: timeline.length - 1, t: 1 };
    }

    /**
     * Interpolate between two values
     */
    interpolateValue(start, end, t, easingName = 'linear') {
        const easingFunc = EASING_FUNCTIONS[easingName] || EASING_FUNCTIONS.linear;
        const easedT = easingFunc(t);

        // Handle different value types
        if (typeof start === 'number' && typeof end === 'number') {
            return start + (end - start) * easedT;
        }

        // For arrays (like expressions or bbox)
        if (Array.isArray(start) && Array.isArray(end)) {
            return start.map((v, i) => {
                const endValue = end[i] !== undefined ? end[i] : v;
                if (typeof v === 'number') {
                    return v + (endValue - v) * easedT;
                }
                // For string expressions, just switch at t > 0.5
                return easedT < 0.5 ? v : endValue;
            });
        }

        // For objects (like mapperParams, transformParams)
        if (typeof start === 'object' && start !== null && typeof end === 'object' && end !== null) {
            const result = { ...start };
            for (const key in end) {
                if (start[key] !== undefined) {
                    result[key] = this.interpolateValue(start[key], end[key], easedT, easingName);
                } else {
                    result[key] = end[key];
                }
            }
            return result;
        }

        // For other types (strings, booleans), just switch at t > 0.5
        return easedT < 0.5 ? start : end;
    }

    /**
     * Get interpolated settings for a given time
     */
    getInterpolatedSettings(time) {
        const { prev, next, t } = this.getKeyframeIndices(time);
        const timeline = this.script.timeline;

        // If at a keyframe, use its settings directly
        if (prev === next) {
            return { ...this.script.baseSettings, ...timeline[prev].settings };
        }

        // Interpolate between keyframes
        const prevSettings = { ...this.script.baseSettings, ...timeline[prev].settings };
        const nextSettings = { ...this.script.baseSettings, ...timeline[next].settings };
        const easing = timeline[next].easing;

        const interpolated = { ...prevSettings };

        // Interpolate each setting that exists in next keyframe
        for (const key in nextSettings) {
            if (prevSettings[key] !== undefined) {
                interpolated[key] = this.interpolateValue(
                    prevSettings[key],
                    nextSettings[key],
                    t,
                    easing
                );
            } else {
                interpolated[key] = nextSettings[key];
            }
        }

        return interpolated;
    }

    /**
     * Calculate animation alpha (0.0-1.0) for the entire animation duration
     */
    getAnimationAlpha(time) {
        const duration = this.script.timeline[this.script.timeline.length - 1].time;
        return Math.max(0, Math.min(1, time / duration));
    }

    /**
     * Wait for a single animation frame
     */
    waitFrame() {
        return new Promise(resolve => requestAnimationFrame(resolve));
    }

    /**
     * Capture current render buffer as PNG blob at scaled resolution
     */
    async captureFrame() {
        return this.renderer.captureRenderBuffer();
    }

    /**
     * Render a single animation frame with proper workflow
     */
    async renderAnimationFrame(time, frameNum, totalFrames) {
        const { frameConfig } = this.script;

        // Step 1: Get interpolated settings for this time
        const settings = this.getInterpolatedSettings(time);
        const alpha = this.getAnimationAlpha(time);

        logger.info(`Frame ${frameNum + 1}/${totalFrames}: t=${time.toFixed(3)}s, alpha=${alpha.toFixed(3)}`);

        // Step 2: Apply settings (may trigger shader recompilation)
        this.manager.setSettings(settings);
        this.renderer.setAnimationAlpha(alpha);
        await this.waitFrame();

        // Step 3: Clear render buffer and reset particles
        this.renderer.clearRenderBuffer();
        this.renderer.resetParticles();

        // Step 4: Run burn-in steps (let particles settle into attractor)
        if (frameConfig.burnInSteps > 0) {
            logger.verbose(`  Burn-in: ${frameConfig.burnInSteps} steps`);
            this.renderer.step(frameConfig.burnInSteps);
        }

        // Step 5: Optionally clear render buffer again (keep particles)
        if (frameConfig.clearAfterBurnIn) {
            this.renderer.clearRenderBuffer();
        }

        // Step 6: Run accumulation steps (build up trails)
        if (frameConfig.accumulationSteps > 0) {
            logger.verbose(`  Accumulation: ${frameConfig.accumulationSteps} steps`);
            for (let i = 0; i < frameConfig.accumulationSteps; i++) {
                this.renderer.updatePositions();
                this.renderer.drawParticles();
                this.renderer.fadeScreen();
            }
        }

        // Step 7: Final render pass for output
        this.renderer.render();
        await this.waitFrame();

        // Step 8: Capture frame
        const blob = await this.captureFrame();

        return blob;
    }

    /**
     * Run the animation and capture frames
     */
    async run(progressCallback) {
        if (this.isRunning) {
            throw new Error('Animation already running');
        }

        if (!this.script) {
            throw new Error('No animation script loaded');
        }

        this.isRunning = true;
        this.isPaused = false;
        this.frames = [];

        const duration = this.script.timeline[this.script.timeline.length - 1].time;
        const totalFrames = Math.ceil(duration * this.script.fps);

        try {
            // Apply base settings
            logger.info('Applying base settings...');
            this.manager.setSettings(this.script.baseSettings);
            await this.waitFrame();

            // Render each frame
            for (let frameNum = 0; frameNum < totalFrames; frameNum++) {
                // Check for pause
                while (this.isPaused && this.isRunning) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                if (!this.isRunning) {
                    logger.info('Animation stopped');
                    break;
                }

                // Calculate time for this frame
                const time = (frameNum / this.script.fps);

                // Render frame
                const blob = await this.renderAnimationFrame(time, frameNum, totalFrames);

                this.frames.push({
                    frameNum,
                    time,
                    blob,
                    timestamp: Date.now()
                });

                // Progress callback
                if (progressCallback) {
                    progressCallback(frameNum + 1, totalFrames, time);
                }
            }

            logger.info(`Animation complete: ${this.frames.length} frames captured`);
            return this.frames;

        } catch (error) {
            logger.error('Animation failed:', error);
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Pause animation
     */
    pause() {
        this.isPaused = true;
    }

    /**
     * Resume animation
     */
    resume() {
        this.isPaused = false;
    }

    /**
     * Stop animation
     */
    stop() {
        this.isRunning = false;
        this.isPaused = false;
    }

    /**
     * Download all captured frames as ZIP
     */
    async downloadFrames() {
        if (this.frames.length === 0) {
            throw new Error('No frames to download');
        }

        // Use JSZip if available, otherwise download individually
        if (window.JSZip) {
            return await this.downloadAsZip();
        } else {
            return await this.downloadIndividually();
        }
    }

    /**
     * Download frames as ZIP archive
     */
    async downloadAsZip() {
        const JSZip = window.JSZip;
        const zip = new JSZip();

        // Add frames
        for (const { frameNum, blob } of this.frames) {
            const filename = `frame_${String(frameNum).padStart(6, '0')}.png`;
            zip.file(filename, blob);
        }

        // Add metadata
        const metadata = {
            script: this.script,
            captureDate: new Date().toISOString(),
            frameCount: this.frames.length
        };
        zip.file('metadata.json', JSON.stringify(metadata, null, 2));

        // Generate ZIP
        logger.info('Generating ZIP archive...');
        const zipBlob = await zip.generateAsync({ type: 'blob' });

        // Download
        const filename = `${this.script.name.replace(/\s+/g, '_')}.zip`;
        this.downloadBlob(zipBlob, filename);

        logger.info(`Downloaded ${filename}`);
    }

    /**
     * Download frames individually
     */
    async downloadIndividually() {
        for (const { frameNum, blob } of this.frames) {
            const filename = `frame_${String(frameNum).padStart(6, '0')}.png`;
            this.downloadBlob(blob, filename);

            // Small delay to avoid overwhelming browser
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        logger.info(`Downloaded ${this.frames.length} frames`);
    }

    /**
     * Download blob as file
     */
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}
