/**
 * SMAA (Subpixel Morphological Anti-Aliasing) Manager
 * Better edge preservation than FXAA - uses pattern recognition
 * Simplified implementation without precomputed area/search textures
 */

import { logger } from '../utils/debug-logger.js';
import { createProgram } from './shaders.js';

/**
 * SMAA Edge Detection Shader
 * Detects edges using luminance differences
 */
function generateSMAAEdgeDetectionShader() {
    return `
precision highp float;

uniform sampler2D u_screen;
uniform vec2 u_resolution;
uniform float u_threshold;

varying vec2 v_uv;

float luminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

void main() {
    vec2 inverseScreenSize = 1.0 / u_resolution;

    // Sample center
    vec3 center = texture2D(u_screen, v_uv).rgb;
    float lumC = luminance(center);

    // Sample neighbors
    float lumL = luminance(texture2D(u_screen, v_uv + vec2(-1.0, 0.0) * inverseScreenSize).rgb);
    float lumR = luminance(texture2D(u_screen, v_uv + vec2(1.0, 0.0) * inverseScreenSize).rgb);
    float lumT = luminance(texture2D(u_screen, v_uv + vec2(0.0, -1.0) * inverseScreenSize).rgb);
    float lumB = luminance(texture2D(u_screen, v_uv + vec2(0.0, 1.0) * inverseScreenSize).rgb);

    // Compute delta (edge strength)
    float deltaL = abs(lumC - lumL);
    float deltaR = abs(lumC - lumR);
    float deltaT = abs(lumC - lumT);
    float deltaB = abs(lumC - lumB);

    // Horizontal and vertical edges
    vec2 edges = vec2(0.0);

    // Horizontal edge (top-bottom difference)
    float maxDeltaH = max(deltaT, deltaB);
    if (maxDeltaH > u_threshold) {
        edges.x = maxDeltaH;
    }

    // Vertical edge (left-right difference)
    float maxDeltaV = max(deltaL, deltaR);
    if (maxDeltaV > u_threshold) {
        edges.y = maxDeltaV;
    }

    gl_FragColor = vec4(edges, 0.0, 1.0);
}
`;
}

/**
 * SMAA Blending Weight Shader
 * Calculates blend weights based on edge patterns
 */
function generateSMAABlendingWeightShader() {
    return `
precision highp float;

uniform sampler2D u_edgesTex;
uniform vec2 u_resolution;

varying vec2 v_uv;

void main() {
    vec2 inverseScreenSize = 1.0 / u_resolution;

    vec2 edges = texture2D(u_edgesTex, v_uv).xy;
    vec4 weights = vec4(0.0);

    // If no edges detected, skip
    if (dot(edges, vec2(1.0)) < 0.001) {
        gl_FragColor = weights;
        return;
    }

    // Simplified weight calculation
    // For horizontal edge, blend vertically
    if (edges.x > 0.0) {
        // Check how far edge extends
        float edgeT = texture2D(u_edgesTex, v_uv + vec2(0.0, -1.0) * inverseScreenSize).x;
        float edgeB = texture2D(u_edgesTex, v_uv + vec2(0.0, 1.0) * inverseScreenSize).x;

        // Weight based on edge continuity
        weights.x = edges.x * 0.5; // Top blend
        weights.y = edges.x * 0.5; // Bottom blend

        // Reduce weight if edge continues (sharp feature, not aliasing)
        if (edgeT > 0.0 && edgeB > 0.0) {
            weights.x *= 0.25;
            weights.y *= 0.25;
        }
    }

    // For vertical edge, blend horizontally
    if (edges.y > 0.0) {
        float edgeL = texture2D(u_edgesTex, v_uv + vec2(-1.0, 0.0) * inverseScreenSize).y;
        float edgeR = texture2D(u_edgesTex, v_uv + vec2(1.0, 0.0) * inverseScreenSize).y;

        weights.z = edges.y * 0.5; // Left blend
        weights.w = edges.y * 0.5; // Right blend

        // Reduce weight if edge continues
        if (edgeL > 0.0 && edgeR > 0.0) {
            weights.z *= 0.25;
            weights.w *= 0.25;
        }
    }

    gl_FragColor = weights;
}
`;
}

/**
 * SMAA Neighborhood Blending Shader
 * Final pass - blends pixels based on weights
 */
function generateSMAANeighborhoodBlendingShader() {
    return `
precision highp float;

uniform sampler2D u_colorTex;
uniform sampler2D u_blendTex;
uniform vec2 u_resolution;
uniform float u_intensity;

varying vec2 v_uv;

void main() {
    vec2 inverseScreenSize = 1.0 / u_resolution;

    // Get blend weights
    vec4 weights = texture2D(u_blendTex, v_uv) * u_intensity;

    // If no blending needed, return original color
    if (dot(weights, vec4(1.0)) < 0.001) {
        gl_FragColor = texture2D(u_colorTex, v_uv);
        return;
    }

    // Sample neighbors
    vec3 colorC = texture2D(u_colorTex, v_uv).rgb;
    vec3 colorT = texture2D(u_colorTex, v_uv + vec2(0.0, -1.0) * inverseScreenSize).rgb;
    vec3 colorB = texture2D(u_colorTex, v_uv + vec2(0.0, 1.0) * inverseScreenSize).rgb;
    vec3 colorL = texture2D(u_colorTex, v_uv + vec2(-1.0, 0.0) * inverseScreenSize).rgb;
    vec3 colorR = texture2D(u_colorTex, v_uv + vec2(1.0, 0.0) * inverseScreenSize).rgb;

    // Blend based on weights
    vec3 result = colorC;
    result += colorT * weights.x;
    result += colorB * weights.y;
    result += colorL * weights.z;
    result += colorR * weights.w;

    // Normalize
    float totalWeight = 1.0 + weights.x + weights.y + weights.z + weights.w;
    result /= totalWeight;

    gl_FragColor = vec4(result, 1.0);
}
`;
}

/**
 * SMAAManager class
 * Three-pass morphological antialiasing
 */
export class SMAAManager {
    constructor(gl, width, height, config = {}) {
        this.gl = gl;
        this.width = width;
        this.height = height;

        // Configuration
        this.enabled = config.enabled !== undefined ? config.enabled : true;
        this.intensity = config.intensity !== undefined ? config.intensity : 0.75;
        this.threshold = config.threshold !== undefined ? config.threshold : 0.1;

        // Framebuffers and textures
        this.edgesFramebuffer = null;
        this.edgesTexture = null;
        this.blendFramebuffer = null;
        this.blendTexture = null;

        // Shader programs
        this.edgeDetectionProgram = null;
        this.blendingWeightProgram = null;
        this.neighborhoodBlendProgram = null;

        // Vertex buffer (shared with renderer)
        this.quadBuffer = null;

        this.initialize();

        logger.info('SMAAManager initialized', {
            size: `${width}x${height}`,
            enabled: this.enabled,
            intensity: this.intensity,
            threshold: this.threshold
        });
    }

    /**
     * Initialize SMAA resources
     */
    initialize() {
        const gl = this.gl;

        // Create framebuffers
        this.createFramebuffers();

        // Compile shaders
        this.compileShaders();

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
     * Create framebuffers for multi-pass rendering
     */
    createFramebuffers() {
        const gl = this.gl;

        // Edges framebuffer (stores edge detection results)
        this.edgesTexture = this.createTexture();
        this.edgesFramebuffer = this.createFramebuffer(this.edgesTexture);

        // Blend weights framebuffer
        this.blendTexture = this.createTexture();
        this.blendFramebuffer = this.createFramebuffer(this.blendTexture);
    }

    /**
     * Create a texture for intermediate results
     */
    createTexture() {
        const gl = this.gl;

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        return texture;
    }

    /**
     * Create a framebuffer attached to a texture
     */
    createFramebuffer(texture) {
        const gl = this.gl;

        const framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            logger.error('SMAA framebuffer incomplete', { status });
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return framebuffer;
    }

    /**
     * Compile SMAA shader programs
     */
    compileShaders() {
        const gl = this.gl;

        const vertexShaderSource = `
attribute vec2 a_pos;
varying vec2 v_uv;

void main() {
    v_uv = a_pos;
    gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0);
}
`;

        this.edgeDetectionProgram = createProgram(gl, vertexShaderSource, generateSMAAEdgeDetectionShader());
        this.blendingWeightProgram = createProgram(gl, vertexShaderSource, generateSMAABlendingWeightShader());
        this.neighborhoodBlendProgram = createProgram(gl, vertexShaderSource, generateSMAANeighborhoodBlendingShader());

        if (!this.edgeDetectionProgram || !this.blendingWeightProgram || !this.neighborhoodBlendProgram) {
            logger.error('Failed to compile SMAA shaders');
        }
    }

    /**
     * Apply SMAA to framebuffer (three-pass algorithm)
     * @param {WebGLTexture} inputTexture - Input LDR texture
     * @param {WebGLFramebuffer} targetFramebuffer - Target framebuffer to render to
     * @param {WebGLBuffer} quadBuffer - Quad buffer for rendering
     */
    applyToFramebuffer(inputTexture, targetFramebuffer, quadBuffer) {
        if (!this.enabled || this.intensity <= 0.0) {
            // Pass through - just copy input to target framebuffer
            const gl = this.gl;
            gl.bindFramebuffer(gl.FRAMEBUFFER, targetFramebuffer);
            gl.viewport(0, 0, this.width, this.height);
            this.copyToFramebuffer(inputTexture, quadBuffer);
            return;
        }

        const gl = this.gl;

        // Pass 1: Edge Detection
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.edgesFramebuffer);
        gl.viewport(0, 0, this.width, this.height);
        gl.useProgram(this.edgeDetectionProgram);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, inputTexture);
        gl.uniform1i(gl.getUniformLocation(this.edgeDetectionProgram, 'u_screen'), 0);
        gl.uniform2f(gl.getUniformLocation(this.edgeDetectionProgram, 'u_resolution'), this.width, this.height);
        gl.uniform1f(gl.getUniformLocation(this.edgeDetectionProgram, 'u_threshold'), this.threshold);

        this.drawQuad(this.edgeDetectionProgram, quadBuffer);

        // Pass 2: Blending Weight Calculation
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blendFramebuffer);
        gl.viewport(0, 0, this.width, this.height);
        gl.useProgram(this.blendingWeightProgram);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.edgesTexture);
        gl.uniform1i(gl.getUniformLocation(this.blendingWeightProgram, 'u_edgesTex'), 0);
        gl.uniform2f(gl.getUniformLocation(this.blendingWeightProgram, 'u_resolution'), this.width, this.height);

        this.drawQuad(this.blendingWeightProgram, quadBuffer);

        // Pass 3: Neighborhood Blending (to target framebuffer)
        gl.bindFramebuffer(gl.FRAMEBUFFER, targetFramebuffer);
        gl.viewport(0, 0, this.width, this.height);
        gl.useProgram(this.neighborhoodBlendProgram);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, inputTexture);
        gl.uniform1i(gl.getUniformLocation(this.neighborhoodBlendProgram, 'u_colorTex'), 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.blendTexture);
        gl.uniform1i(gl.getUniformLocation(this.neighborhoodBlendProgram, 'u_blendTex'), 1);

        gl.uniform2f(gl.getUniformLocation(this.neighborhoodBlendProgram, 'u_resolution'), this.width, this.height);
        gl.uniform1f(gl.getUniformLocation(this.neighborhoodBlendProgram, 'u_intensity'), this.intensity);

        this.drawQuad(this.neighborhoodBlendProgram, quadBuffer);
    }

    /**
     * Apply SMAA to canvas (three-pass algorithm)
     * @param {WebGLTexture} inputTexture - Input LDR texture
     * @param {WebGLBuffer} quadBuffer - Quad buffer for rendering
     */
    applyToCanvas(inputTexture, quadBuffer) {
        // Apply SMAA to canvas (null framebuffer)
        this.applyToFramebuffer(inputTexture, null, quadBuffer);
    }

    /**
     * DEPRECATED: Old applyToCanvas implementation (kept for reference)
     */
    applyToCanvas_OLD(inputTexture, quadBuffer) {
        if (!this.enabled || this.intensity <= 0.0) {
            // Pass through - just copy input to canvas
            this.copyToCanvas(inputTexture, quadBuffer);
            return;
        }

        const gl = this.gl;

        // Pass 1: Edge Detection
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.edgesFramebuffer);
        gl.viewport(0, 0, this.width, this.height);
        gl.useProgram(this.edgeDetectionProgram);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, inputTexture);
        gl.uniform1i(gl.getUniformLocation(this.edgeDetectionProgram, 'u_screen'), 0);
        gl.uniform2f(gl.getUniformLocation(this.edgeDetectionProgram, 'u_resolution'), this.width, this.height);
        gl.uniform1f(gl.getUniformLocation(this.edgeDetectionProgram, 'u_threshold'), this.threshold);

        this.drawQuad(this.edgeDetectionProgram, quadBuffer);

        // Pass 2: Blending Weight Calculation
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blendFramebuffer);
        gl.viewport(0, 0, this.width, this.height);
        gl.useProgram(this.blendingWeightProgram);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.edgesTexture);
        gl.uniform1i(gl.getUniformLocation(this.blendingWeightProgram, 'u_edgesTex'), 0);
        gl.uniform2f(gl.getUniformLocation(this.blendingWeightProgram, 'u_resolution'), this.width, this.height);

        this.drawQuad(this.blendingWeightProgram, quadBuffer);

        // Pass 3: Neighborhood Blending (to canvas)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.width, this.height);
        gl.useProgram(this.neighborhoodBlendProgram);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, inputTexture);
        gl.uniform1i(gl.getUniformLocation(this.neighborhoodBlendProgram, 'u_colorTex'), 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.blendTexture);
        gl.uniform1i(gl.getUniformLocation(this.neighborhoodBlendProgram, 'u_blendTex'), 1);

        gl.uniform2f(gl.getUniformLocation(this.neighborhoodBlendProgram, 'u_resolution'), this.width, this.height);
        gl.uniform1f(gl.getUniformLocation(this.neighborhoodBlendProgram, 'u_intensity'), this.intensity);

        this.drawQuad(this.neighborhoodBlendProgram, quadBuffer);
    }

    /**
     * Draw fullscreen quad
     */
    drawQuad(program, quadBuffer) {
        const gl = this.gl;

        const aPosLoc = gl.getAttribLocation(program, 'a_pos');
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.enableVertexAttribArray(aPosLoc);
        gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    /**
     * Copy input texture to currently bound framebuffer (passthrough)
     */
    copyToFramebuffer(inputTexture, quadBuffer) {
        const gl = this.gl;

        // Simple copy shader (reuse neighborhood blend program without weights)
        gl.useProgram(this.neighborhoodBlendProgram);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, inputTexture);
        gl.uniform1i(gl.getUniformLocation(this.neighborhoodBlendProgram, 'u_colorTex'), 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.blendTexture); // Empty blend = passthrough
        gl.uniform1i(gl.getUniformLocation(this.neighborhoodBlendProgram, 'u_blendTex'), 1);

        gl.uniform2f(gl.getUniformLocation(this.neighborhoodBlendProgram, 'u_resolution'), this.width, this.height);
        gl.uniform1f(gl.getUniformLocation(this.neighborhoodBlendProgram, 'u_intensity'), 0.0); // Zero intensity = no AA

        this.drawQuad(this.neighborhoodBlendProgram, quadBuffer);
    }

    /**
     * Copy input texture to canvas (passthrough)
     */
    copyToCanvas(inputTexture, quadBuffer) {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.width, this.height);
        this.copyToFramebuffer(inputTexture, quadBuffer);
    }

    /**
     * Update SMAA configuration
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
    }

    /**
     * Check if SMAA is enabled
     */
    isEnabled() {
        return this.enabled && this.intensity > 0.0;
    }

    /**
     * Resize SMAA resources
     */
    resize(width, height) {
        this.width = width;
        this.height = height;

        // Recreate framebuffers with new size
        this.cleanup();
        this.createFramebuffers();
    }

    /**
     * Clean up WebGL resources
     */
    cleanup() {
        const gl = this.gl;

        if (this.edgesFramebuffer) gl.deleteFramebuffer(this.edgesFramebuffer);
        if (this.blendFramebuffer) gl.deleteFramebuffer(this.blendFramebuffer);
        if (this.edgesTexture) gl.deleteTexture(this.edgesTexture);
        if (this.blendTexture) gl.deleteTexture(this.blendTexture);

        this.edgesFramebuffer = null;
        this.blendFramebuffer = null;
        this.edgesTexture = null;
        this.blendTexture = null;
    }

    /**
     * Set quad buffer (share with renderer)
     */
    setQuadBuffer(buffer) {
        this.quadBuffer = buffer;
    }

    /**
     * Expose framebuffer for tone mapping target (compatibility with FXAA interface)
     */
    get framebuffer() {
        // Return null - SMAA doesn't use this pattern
        return null;
    }
}
