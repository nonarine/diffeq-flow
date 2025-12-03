/**
 * HDR Framebuffer Management
 * Handles creation and management of floating-point render targets for HDR rendering
 */

import { logger } from '../utils/debug-logger.js';

/**
 * FramebufferManager class
 * Manages HDR framebuffers with float texture attachments
 */
export class FramebufferManager {
    constructor(gl, width, height, config = {}) {
        this.gl = gl;
        this.width = width;
        this.height = height;

        // Configuration
        this.useHDR = config.useHDR !== undefined ? config.useHDR : true;
        this.usePingPong = config.usePingPong !== undefined ? config.usePingPong : true;

        // Check for required extensions
        this.checkExtensions();

        // Create framebuffers and textures
        this.initialize();

        logger.info('FramebufferManager initialized', {
            width,
            height,
            useHDR: this.useHDR,
            hdrSupported: this.hdrSupported,
            textureFormat: this.getTextureFormatName()
        });
    }

    /**
     * Check for required WebGL extensions
     */
    checkExtensions() {
        const gl = this.gl;

        logger.verbose('Checking WebGL extensions for HDR support...');

        // Check for float texture support (needed for particle positions, already checked elsewhere)
        this.floatTextureExt = gl.getExtension('OES_texture_float');

        // Check for half-float texture support
        this.halfFloatTextureExt = gl.getExtension('OES_texture_half_float');

        // Check for float color buffer (WebGL 1.0)
        this.floatColorBufferExt = gl.getExtension('WEBGL_color_buffer_float') ||
                                    gl.getExtension('EXT_color_buffer_float');

        // Check for half-float color buffer (WebGL 1.0)
        this.halfFloatColorBufferExt = gl.getExtension('EXT_color_buffer_half_float');

        // Check for linear filtering of float textures
        this.floatLinearExt = gl.getExtension('OES_texture_float_linear');
        this.halfFloatLinearExt = gl.getExtension('OES_texture_half_float_linear');

        // Check for float blending (needed for additive blending with float framebuffers)
        this.floatBlendExt = gl.getExtension('EXT_float_blend');

        logger.verbose('WebGL extension support:', {
            OES_texture_float: !!this.floatTextureExt,
            OES_texture_half_float: !!this.halfFloatTextureExt,
            WEBGL_color_buffer_float: !!this.floatColorBufferExt,
            EXT_color_buffer_half_float: !!this.halfFloatColorBufferExt,
            OES_texture_float_linear: !!this.floatLinearExt,
            OES_texture_half_float_linear: !!this.halfFloatLinearExt,
            EXT_float_blend: !!this.floatBlendExt
        });

        // Determine HDR support
        this.hdrSupported = !!(this.floatColorBufferExt || this.halfFloatColorBufferExt);

        logger.verbose(`HDR support determined: ${this.hdrSupported ? 'SUPPORTED' : 'NOT SUPPORTED'}`);

        // If HDR requested but not supported, fall back to LDR
        if (this.useHDR && !this.hdrSupported) {
            logger.warn('HDR rendering requested but not supported by device. Falling back to LDR.');
            this.useHDR = false;
        }

        // Prefer full float, fall back to half float
        if (this.useHDR) {
            if (this.floatColorBufferExt) {
                this.hdrType = gl.FLOAT;
                this.hdrTypeExt = this.floatTextureExt;
                this.linearExt = this.floatLinearExt;
                logger.info('Selected RGBA32F (full float) for HDR framebuffers');
            } else if (this.halfFloatColorBufferExt) {
                this.hdrType = this.halfFloatTextureExt.HALF_FLOAT_OES;
                this.hdrTypeExt = this.halfFloatTextureExt;
                this.linearExt = this.halfFloatLinearExt;
                logger.info('Selected RGBA16F (half float) for HDR framebuffers');
            }
        } else {
            logger.verbose('Using LDR (RGBA8) framebuffers');
        }
    }

    /**
     * Initialize framebuffers and textures
     */
    initialize() {
        const gl = this.gl;

        logger.verbose(`Creating ${this.usePingPong ? 'ping-pong' : 'single'} framebuffers...`);

        // Create two framebuffers for ping-pong rendering
        if (this.usePingPong) {
            this.framebuffers = [
                gl.createFramebuffer(),
                gl.createFramebuffer()
            ];

            this.textures = [
                this.createTexture(),
                this.createTexture()
            ];

            // Create shared depth buffer for both framebuffers
            this.depthBuffer = gl.createRenderbuffer();
            gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthBuffer);
            gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.width, this.height);

            // Attach textures and depth buffer to framebuffers
            for (let i = 0; i < 2; i++) {
                gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[i]);
                gl.framebufferTexture2D(
                    gl.FRAMEBUFFER,
                    gl.COLOR_ATTACHMENT0,
                    gl.TEXTURE_2D,
                    this.textures[i],
                    0
                );

                // Attach depth buffer
                gl.framebufferRenderbuffer(
                    gl.FRAMEBUFFER,
                    gl.DEPTH_ATTACHMENT,
                    gl.RENDERBUFFER,
                    this.depthBuffer
                );

                // Check framebuffer status
                this.checkFramebufferStatus(i);
            }

            // Track current buffer index
            this.currentIndex = 0;
        } else {
            // Single framebuffer
            this.framebuffers = [gl.createFramebuffer()];
            this.textures = [this.createTexture()];

            // Create depth buffer
            this.depthBuffer = gl.createRenderbuffer();
            gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthBuffer);
            gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.width, this.height);

            gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[0]);
            gl.framebufferTexture2D(
                gl.FRAMEBUFFER,
                gl.COLOR_ATTACHMENT0,
                gl.TEXTURE_2D,
                this.textures[0],
                0
            );

            // Attach depth buffer
            gl.framebufferRenderbuffer(
                gl.FRAMEBUFFER,
                gl.DEPTH_ATTACHMENT,
                gl.RENDERBUFFER,
                this.depthBuffer
            );

            this.checkFramebufferStatus(0);
            this.currentIndex = 0;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /**
     * Create a texture (HDR or LDR depending on configuration)
     */
    createTexture() {
        const gl = this.gl;
        const texture = gl.createTexture();

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Use linear filtering if supported, otherwise nearest
        const minFilter = (this.useHDR && this.linearExt) ? gl.LINEAR : gl.NEAREST;
        const magFilter = (this.useHDR && this.linearExt) ? gl.LINEAR : gl.NEAREST;

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);

        // Allocate texture storage
        if (this.useHDR) {
            // HDR: use float or half-float texture
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGBA,
                this.width,
                this.height,
                0,
                gl.RGBA,
                this.hdrType,
                null
            );
        } else {
            // LDR: use standard RGBA8 texture
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGBA,
                this.width,
                this.height,
                0,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                null
            );
        }

        return texture;
    }

    /**
     * Check framebuffer completeness
     */
    checkFramebufferStatus(index) {
        const gl = this.gl;

        // Check if WebGL context is lost
        if (gl.isContextLost()) {
            throw new Error('WebGL context lost');
        }

        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);

        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            const errorMsg = this.getFramebufferStatusString(status);
            logger.error(`Framebuffer ${index} is not complete: ${errorMsg}`, {
                format: this.getTextureFormatName(),
                size: `${this.width}x${this.height}`,
                status: status,
                contextLost: gl.isContextLost()
            });
            throw new Error(`Framebuffer ${index} incomplete: ${errorMsg}`);
        }

        logger.verbose(`Framebuffer ${index} created successfully: ${this.getTextureFormatName()} at ${this.width}x${this.height}`);
    }

    /**
     * Get human-readable framebuffer status string
     */
    getFramebufferStatusString(status) {
        const gl = this.gl;
        switch (status) {
            case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
                return 'INCOMPLETE_ATTACHMENT';
            case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
                return 'INCOMPLETE_MISSING_ATTACHMENT';
            case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
                return 'INCOMPLETE_DIMENSIONS';
            case gl.FRAMEBUFFER_UNSUPPORTED:
                return 'UNSUPPORTED';
            default:
                return `UNKNOWN (${status})`;
        }
    }

    /**
     * Get human-readable texture format name
     */
    getTextureFormatName() {
        if (!this.useHDR) return 'RGBA8 (LDR)';
        if (this.hdrType === this.gl.FLOAT) return 'RGBA32F (Full HDR)';
        return 'RGBA16F (Half HDR)';
    }

    /**
     * Bind current framebuffer for rendering
     */
    bind() {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[this.currentIndex]);
        gl.viewport(0, 0, this.width, this.height);
    }

    /**
     * Bind to canvas (unbind framebuffer)
     */
    bindCanvas() {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /**
     * Get current texture
     */
    getCurrentTexture() {
        return this.textures[this.currentIndex];
    }

    /**
     * Get previous texture (for ping-pong rendering)
     */
    getPreviousTexture() {
        if (!this.usePingPong) return this.textures[0];
        return this.textures[1 - this.currentIndex];
    }

    /**
     * Swap ping-pong buffers
     */
    swap() {
        if (this.usePingPong) {
            this.currentIndex = 1 - this.currentIndex;
        }
    }

    /**
     * Clear current framebuffer
     */
    clear(r = 0, g = 0, b = 0, a = 1) {
        const gl = this.gl;
        this.bind();
        gl.clearColor(r, g, b, a);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    /**
     * Clear all framebuffers (used for reset/resize)
     */
    clearAll(r = 0, g = 0, b = 0, a = 1) {
        const gl = this.gl;
        for (let i = 0; i < this.framebuffers.length; i++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[i]);
            gl.clearColor(r, g, b, a);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /**
     * Resize framebuffers
     */
    resize(width, height) {
        if (width === this.width && height === this.height) return;

        logger.info('Resizing HDR framebuffers', {
            from: `${this.width}x${this.height}`,
            to: `${width}x${height}`,
            format: this.getTextureFormatName()
        });

        this.width = width;
        this.height = height;

        const gl = this.gl;

        // Delete old textures
        for (const texture of this.textures) {
            gl.deleteTexture(texture);
        }

        // Delete old depth buffer
        if (this.depthBuffer) {
            gl.deleteRenderbuffer(this.depthBuffer);
        }

        // Recreate depth buffer with new size
        this.depthBuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);

        // Recreate textures
        this.textures = [];
        for (let i = 0; i < this.framebuffers.length; i++) {
            this.textures.push(this.createTexture());

            // Reattach to framebuffer
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[i]);
            gl.framebufferTexture2D(
                gl.FRAMEBUFFER,
                gl.COLOR_ATTACHMENT0,
                gl.TEXTURE_2D,
                this.textures[i],
                0
            );

            // Reattach depth buffer
            gl.framebufferRenderbuffer(
                gl.FRAMEBUFFER,
                gl.DEPTH_ATTACHMENT,
                gl.RENDERBUFFER,
                this.depthBuffer
            );

            this.checkFramebufferStatus(i);
        }

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);

        // Clear all buffers after resize
        this.clearAll();
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        const gl = this.gl;

        for (const framebuffer of this.framebuffers) {
            gl.deleteFramebuffer(framebuffer);
        }

        for (const texture of this.textures) {
            gl.deleteTexture(texture);
        }

        this.framebuffers = [];
        this.textures = [];

        logger.verbose('FramebufferManager disposed');
    }

    /**
     * Check if HDR is enabled and supported
     */
    isHDR() {
        return this.useHDR && this.hdrSupported;
    }

    /**
     * Get HDR support status
     */
    getHDRSupport() {
        return {
            supported: this.hdrSupported,
            enabled: this.useHDR,
            format: this.getTextureFormatName(),
            hasFloatColorBuffer: !!this.floatColorBufferExt,
            hasHalfFloatColorBuffer: !!this.halfFloatColorBufferExt,
            hasLinearFiltering: !!this.linearExt
        };
    }
}
