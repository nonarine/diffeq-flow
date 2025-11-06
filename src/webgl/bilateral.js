/**
 * Bilateral Filter Manager
 * Edge-preserving noise filter that smooths flat areas while preserving sharp edges
 */

import { logger } from '../utils/debug-logger.js';
import { createProgram } from './shaders.js';

/**
 * Generate Bilateral Filter Shader
 * Blurs based on both spatial distance AND intensity difference
 */
function generateBilateralFilterShader() {
    return `
precision highp float;

uniform sampler2D u_screen;
uniform vec2 u_resolution;
uniform float u_spatialSigma;   // Spatial blur radius
uniform float u_intensitySigma; // Edge preservation threshold

varying vec2 v_uv;

// Gaussian function
float gaussian(float x, float sigma) {
    return exp(-(x * x) / (2.0 * sigma * sigma));
}

// Luminance for edge detection
float luminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

void main() {
    vec2 texelSize = 1.0 / u_resolution;

    vec3 centerColor = texture2D(u_screen, v_uv).rgb;
    float centerLum = luminance(centerColor);

    // Single-pass noise detection using simple statistics
    const float brightnessThreshold = 0.05;

    // Sample 3x3 neighborhood (unrolled - no arrays)
    float s0 = luminance(texture2D(u_screen, v_uv + vec2(-1.0, -1.0) * texelSize).rgb);
    float s1 = luminance(texture2D(u_screen, v_uv + vec2( 0.0, -1.0) * texelSize).rgb);
    float s2 = luminance(texture2D(u_screen, v_uv + vec2( 1.0, -1.0) * texelSize).rgb);
    float s3 = luminance(texture2D(u_screen, v_uv + vec2(-1.0,  0.0) * texelSize).rgb);
    float s4 = luminance(texture2D(u_screen, v_uv + vec2( 0.0,  0.0) * texelSize).rgb);
    float s5 = luminance(texture2D(u_screen, v_uv + vec2( 1.0,  0.0) * texelSize).rgb);
    float s6 = luminance(texture2D(u_screen, v_uv + vec2(-1.0,  1.0) * texelSize).rgb);
    float s7 = luminance(texture2D(u_screen, v_uv + vec2( 0.0,  1.0) * texelSize).rgb);
    float s8 = luminance(texture2D(u_screen, v_uv + vec2( 1.0,  1.0) * texelSize).rgb);

    // Compute statistics
    float sum = s0 + s1 + s2 + s3 + s4 + s5 + s6 + s7 + s8;
    float sumSquares = s0*s0 + s1*s1 + s2*s2 + s3*s3 + s4*s4 + s5*s5 + s6*s6 + s7*s7 + s8*s8;

    float brightCount = 0.0;
    if (s0 > brightnessThreshold) brightCount += 1.0;
    if (s1 > brightnessThreshold) brightCount += 1.0;
    if (s2 > brightnessThreshold) brightCount += 1.0;
    if (s3 > brightnessThreshold) brightCount += 1.0;
    if (s4 > brightnessThreshold) brightCount += 1.0;
    if (s5 > brightnessThreshold) brightCount += 1.0;
    if (s6 > brightnessThreshold) brightCount += 1.0;
    if (s7 > brightnessThreshold) brightCount += 1.0;
    if (s8 > brightnessThreshold) brightCount += 1.0;

    float mean = sum / 9.0;
    float variance = (sumSquares / 9.0) - (mean * mean);

    // Simple edge detection: check gradient magnitude
    float gradX = abs(s5 - s3); // right - left
    float gradY = abs(s7 - s1); // bottom - top
    float gradient = gradX + gradY;

    // Noise detection: sparse scattered particles
    // If there's ANY variance in a dark region with low gradient, it's probably noise

    bool isDarkAndSparse = (mean < 0.2) && (brightCount < 5.0);
    bool hasNoEdges = (gradient < 0.15);

    // Apply blur to dark sparse regions with no strong edges
    bool shouldBlur = isDarkAndSparse && hasNoEdges;

    if (!shouldBlur) {
        // Structured region - pass through unchanged
        gl_FragColor = vec4(centerColor, 1.0);
        return;
    }

    // Sparse region - apply aggressive gaussian blur
    vec3 colorSum = vec3(0.0);
    float weightSum = 0.0;

    // Larger kernel radius for stronger smoothing
    const int radius = 5; // 11x11 kernel

    for (int x = -radius; x <= radius; x++) {
        for (int y = -radius; y <= radius; y++) {
            vec2 offset = vec2(float(x), float(y)) * texelSize;
            vec3 sampleColor = texture2D(u_screen, v_uv + offset).rgb;

            // Only spatial weight (pure gaussian blur in sparse regions)
            float spatialDist = length(vec2(float(x), float(y)));
            float weight = gaussian(spatialDist, u_spatialSigma);

            colorSum += sampleColor * weight;
            weightSum += weight;
        }
    }

    // Normalize
    vec3 result = colorSum / weightSum;

    gl_FragColor = vec4(result, 1.0);
}
`;
}

/**
 * BilateralFilterManager class
 * Single-pass edge-preserving blur
 */
export class BilateralFilterManager {
    constructor(gl, width, height, config = {}) {
        this.gl = gl;
        this.width = width;
        this.height = height;

        // Configuration
        this.enabled = config.enabled !== undefined ? config.enabled : false; // Disabled by default
        this.spatialSigma = config.spatialSigma !== undefined ? config.spatialSigma : 4.0;
        this.intensitySigma = config.intensitySigma !== undefined ? config.intensitySigma : 0.2;

        // Framebuffer for filter output
        this.framebuffer = null;
        this.texture = null;

        // Shader program
        this.program = null;

        // Vertex buffer (shared with renderer)
        this.quadBuffer = null;

        this.initialize();

        logger.info('BilateralFilterManager initialized', {
            size: `${width}x${height}`,
            enabled: this.enabled,
            spatialSigma: this.spatialSigma,
            intensitySigma: this.intensitySigma
        });
    }

    /**
     * Initialize bilateral filter resources
     */
    initialize() {
        const gl = this.gl;

        // Create framebuffer
        this.createFramebuffer();

        // Compile shader
        this.compileShader();

        // Create quad buffer if not provided
        if (!this.quadBuffer) {
            const quadVertices = new Float32Array([
                0, 0,  1, 0,  0, 1,
                0, 1,  1, 0,  1, 1
            ]);
            this.quadBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
        }
    }

    /**
     * Create framebuffer for filter output
     */
    createFramebuffer() {
        const gl = this.gl;

        // Create texture (LDR format)
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        // Create framebuffer
        this.framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);

        // Check framebuffer status
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            logger.error('Bilateral filter framebuffer incomplete', { status });
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /**
     * Compile bilateral filter shader
     */
    compileShader() {
        const gl = this.gl;

        const vertexShaderSource = `
attribute vec2 a_pos;
varying vec2 v_uv;

void main() {
    v_uv = a_pos;
    gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0);
}
`;

        const fragmentShaderSource = generateBilateralFilterShader();

        this.program = createProgram(gl, vertexShaderSource, fragmentShaderSource);

        if (!this.program) {
            logger.error('Failed to compile bilateral filter shader');
        }
    }

    /**
     * Apply bilateral filter
     * @param {WebGLTexture} inputTexture - Input LDR texture
     * @returns {WebGLTexture} - Filtered texture (or original if disabled)
     */
    apply(inputTexture) {
        if (!this.enabled) {
            // Pass through without filtering
            return inputTexture;
        }

        const gl = this.gl;

        // Bind framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.viewport(0, 0, this.width, this.height);

        // Use bilateral filter shader
        gl.useProgram(this.program);

        // Bind input texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, inputTexture);
        gl.uniform1i(gl.getUniformLocation(this.program, 'u_screen'), 0);

        // Set uniforms
        gl.uniform2f(gl.getUniformLocation(this.program, 'u_resolution'), this.width, this.height);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_spatialSigma'), this.spatialSigma);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_intensitySigma'), this.intensitySigma);

        // Bind quad buffer
        const aPosLoc = gl.getAttribLocation(this.program, 'a_pos');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.enableVertexAttribArray(aPosLoc);
        gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

        // Draw fullscreen quad
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Unbind framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // Return filtered texture
        return this.texture;
    }

    /**
     * Update configuration
     */
    updateConfig(config) {
        if (config.enabled !== undefined) {
            this.enabled = config.enabled;
        }
        if (config.spatialSigma !== undefined) {
            this.spatialSigma = config.spatialSigma;
        }
        if (config.intensitySigma !== undefined) {
            this.intensitySigma = config.intensitySigma;
        }
    }

    /**
     * Check if bilateral filter is enabled
     */
    isEnabled() {
        return this.enabled;
    }

    /**
     * Resize resources
     */
    resize(width, height) {
        this.width = width;
        this.height = height;

        // Recreate framebuffer with new size
        this.cleanup();
        this.createFramebuffer();
    }

    /**
     * Clean up WebGL resources
     */
    cleanup() {
        const gl = this.gl;

        if (this.framebuffer) {
            gl.deleteFramebuffer(this.framebuffer);
            this.framebuffer = null;
        }

        if (this.texture) {
            gl.deleteTexture(this.texture);
            this.texture = null;
        }
    }

    /**
     * Set quad buffer (share with renderer)
     */
    setQuadBuffer(buffer) {
        this.quadBuffer = buffer;
    }
}
