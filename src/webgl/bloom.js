/**
 * Bloom Effect Manager
 * Manages framebuffers and rendering for HDR bloom effect
 */

import { logger } from '../utils/debug-logger.js';

/**
 * BloomManager class
 * Handles bloom extraction, blur, and composition
 */
export class BloomManager {
    constructor(gl, width, height, config = {}) {
        this.gl = gl;
        this.width = width;
        this.height = height;

        // Configuration
        this.enabled = config.enabled !== undefined ? config.enabled : true;
        this.intensity = config.intensity !== undefined ? config.intensity : 0.5;
        this.threshold = config.threshold !== undefined ? config.threshold : 1.0;
        this.radius = config.radius !== undefined ? config.radius : 1.0;

        // Use full resolution for bloom to avoid blocky artifacts
        // Can be configured with quality setting
        this.bloomScale = config.bloomScale !== undefined ? config.bloomScale : 1.0;
        this.bloomWidth = Math.floor(width * this.bloomScale);
        this.bloomHeight = Math.floor(height * this.bloomScale);

        // Check for required extensions (reuse from framebuffer manager)
        this.checkExtensions();

        // Create bloom framebuffers
        this.initialize();

        logger.info('BloomManager initialized', {
            bloomSize: `${this.bloomWidth}x${this.bloomHeight}`,
            scale: this.bloomScale,
            threshold: this.threshold,
            intensity: this.intensity
        });
    }

    /**
     * Check for required WebGL extensions
     */
    checkExtensions() {
        const gl = this.gl;

        // Check for float texture support
        this.floatTextureExt = gl.getExtension('OES_texture_float');
        this.halfFloatTextureExt = gl.getExtension('OES_texture_half_float');

        // Check for float color buffer
        this.floatColorBufferExt = gl.getExtension('WEBGL_color_buffer_float') ||
                                    gl.getExtension('EXT_color_buffer_float');
        this.halfFloatColorBufferExt = gl.getExtension('EXT_color_buffer_half_float');

        // Check for linear filtering
        this.floatLinearExt = gl.getExtension('OES_texture_float_linear');
        this.halfFloatLinearExt = gl.getExtension('OES_texture_half_float_linear');

        // Determine HDR support
        this.hdrSupported = !!(this.floatColorBufferExt || this.halfFloatColorBufferExt);

        if (!this.hdrSupported) {
            logger.warn('HDR not supported for bloom. Bloom effect will be disabled.');
            this.enabled = false;
            return;
        }

        // Prefer full float, fall back to half float
        if (this.floatColorBufferExt) {
            this.hdrType = gl.FLOAT;
            this.linearExt = this.floatLinearExt;
        } else if (this.halfFloatColorBufferExt) {
            this.hdrType = this.halfFloatTextureExt.HALF_FLOAT_OES;
            this.linearExt = this.halfFloatLinearExt;
        }

        if (!this.linearExt) {
            logger.warn('Linear filtering not supported for bloom textures. Bloom quality may be reduced.');
        }
    }

    /**
     * Initialize bloom framebuffers
     */
    initialize() {
        if (!this.enabled || !this.hdrSupported) return;

        const gl = this.gl;

        // Create two framebuffers for ping-pong blur passes
        // FBO 0: Bright pass extraction target
        // FBO 1: Horizontal blur target
        // Then we ping-pong between them for blur passes
        this.brightFBO = gl.createFramebuffer();
        this.blurFBO1 = gl.createFramebuffer();
        this.blurFBO2 = gl.createFramebuffer();

        // Create textures
        this.brightTexture = this.createTexture();
        this.blurTexture1 = this.createTexture();
        this.blurTexture2 = this.createTexture();

        // Attach textures to framebuffers
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.brightFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.brightTexture, 0);
        this.checkFramebufferStatus('Bright extraction');

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFBO1);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.blurTexture1, 0);
        this.checkFramebufferStatus('Blur 1');

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFBO2);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.blurTexture2, 0);
        this.checkFramebufferStatus('Blur 2');

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        logger.verbose('Bloom framebuffers initialized successfully');
    }

    /**
     * Create a bloom texture (HDR float texture)
     */
    createTexture() {
        const gl = this.gl;
        const texture = gl.createTexture();

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Use linear filtering for smooth bloom
        const filter = this.linearExt ? gl.LINEAR : gl.NEAREST;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);

        // Allocate float texture
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            this.bloomWidth,
            this.bloomHeight,
            0,
            gl.RGBA,
            this.hdrType,
            null
        );

        return texture;
    }

    /**
     * Check framebuffer completeness
     */
    checkFramebufferStatus(name) {
        const gl = this.gl;
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);

        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            logger.error(`${name} framebuffer is not complete: ${status}`);
            throw new Error(`${name} framebuffer incomplete`);
        }

        logger.verbose(`${name} framebuffer created successfully`);
    }

    /**
     * Get bright extraction framebuffer
     */
    getBrightFBO() {
        return this.brightFBO;
    }

    /**
     * Get bright extraction texture
     */
    getBrightTexture() {
        return this.brightTexture;
    }

    /**
     * Get blur framebuffers
     */
    getBlurFBOs() {
        return [this.blurFBO1, this.blurFBO2];
    }

    /**
     * Get blur textures
     */
    getBlurTextures() {
        return [this.blurTexture1, this.blurTexture2];
    }

    /**
     * Get bloom dimensions
     */
    getBloomSize() {
        return { width: this.bloomWidth, height: this.bloomHeight };
    }

    /**
     * Update bloom parameters
     */
    updateConfig(config) {
        if (config.enabled !== undefined) {
            this.enabled = config.enabled;
        }
        if (config.intensity !== undefined) {
            this.intensity = config.intensity;
        }
        if (config.threshold !== undefined) {
            this.threshold = config.threshold;
        }
        if (config.radius !== undefined) {
            this.radius = config.radius;
        }
    }

    /**
     * Resize bloom framebuffers
     */
    resize(width, height) {
        if (!this.enabled || !this.hdrSupported) return;

        const newBloomWidth = Math.floor(width * this.bloomScale);
        const newBloomHeight = Math.floor(height * this.bloomScale);

        if (newBloomWidth === this.bloomWidth && newBloomHeight === this.bloomHeight) return;

        logger.info('Resizing bloom framebuffers', {
            from: `${this.bloomWidth}x${this.bloomHeight}`,
            to: `${newBloomWidth}x${newBloomHeight}`
        });

        this.width = width;
        this.height = height;
        this.bloomWidth = newBloomWidth;
        this.bloomHeight = newBloomHeight;

        // Delete old textures
        const gl = this.gl;
        gl.deleteTexture(this.brightTexture);
        gl.deleteTexture(this.blurTexture1);
        gl.deleteTexture(this.blurTexture2);

        // Recreate textures
        this.brightTexture = this.createTexture();
        this.blurTexture1 = this.createTexture();
        this.blurTexture2 = this.createTexture();

        // Reattach to framebuffers
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.brightFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.brightTexture, 0);
        this.checkFramebufferStatus('Bright extraction (resized)');

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFBO1);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.blurTexture1, 0);
        this.checkFramebufferStatus('Blur 1 (resized)');

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFBO2);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.blurTexture2, 0);
        this.checkFramebufferStatus('Blur 2 (resized)');

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        if (!this.enabled || !this.hdrSupported) return;

        const gl = this.gl;

        gl.deleteFramebuffer(this.brightFBO);
        gl.deleteFramebuffer(this.blurFBO1);
        gl.deleteFramebuffer(this.blurFBO2);

        gl.deleteTexture(this.brightTexture);
        gl.deleteTexture(this.blurTexture1);
        gl.deleteTexture(this.blurTexture2);

        logger.verbose('BloomManager disposed');
    }

    /**
     * Check if bloom is enabled and supported
     */
    isEnabled() {
        return this.enabled && this.hdrSupported;
    }
}
