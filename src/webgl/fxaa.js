/**
 * FXAA (Fast Approximate Anti-Aliasing) Manager
 * Edge-based antialiasing that preserves sharp details
 */

import { logger } from '../utils/debug-logger.js';
import { createProgram } from './shaders.js';

/**
 * Generate FXAA shader (HDR-aware)
 * Based on FXAA 3.11 by Timothy Lottes (NVIDIA)
 */
function generateFXAAShader() {
    return `
precision highp float;

uniform sampler2D u_screen;
uniform vec2 u_resolution;
uniform float u_intensity; // 0.0 = disabled, 1.0 = full strength

varying vec2 v_uv;

// Luminance calculation for LDR (post tone-mapping)
float luminance(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}

void main() {
    // Early exit if FXAA disabled
    if (u_intensity <= 0.0) {
        gl_FragColor = texture2D(u_screen, v_uv);
        return;
    }

    vec2 inverseScreenSize = 1.0 / u_resolution;

    // Sample center and neighbors
    vec3 rgbM = texture2D(u_screen, v_uv).rgb;
    vec3 rgbN = texture2D(u_screen, v_uv + vec2(0.0, -1.0) * inverseScreenSize).rgb;
    vec3 rgbS = texture2D(u_screen, v_uv + vec2(0.0, 1.0) * inverseScreenSize).rgb;
    vec3 rgbE = texture2D(u_screen, v_uv + vec2(1.0, 0.0) * inverseScreenSize).rgb;
    vec3 rgbW = texture2D(u_screen, v_uv + vec2(-1.0, 0.0) * inverseScreenSize).rgb;

    // Compute luminances for LDR edge detection
    float lumM = luminance(rgbM);
    float lumN = luminance(rgbN);
    float lumS = luminance(rgbS);
    float lumE = luminance(rgbE);
    float lumW = luminance(rgbW);

    // Find min and max luminance
    float lumMin = min(lumM, min(min(lumN, lumS), min(lumE, lumW)));
    float lumMax = max(lumM, max(max(lumN, lumS), max(lumE, lumW)));

    // Compute contrast
    float contrast = lumMax - lumMin;

    // Adaptive threshold for LDR (0-1 range)
    // Intensity controls sensitivity: higher = more aggressive smoothing
    // Use relative threshold based on local luminance to preserve detail in dark/bright areas
    float relativeThreshold = max(0.0312, lumMax * 0.125); // FXAA quality preset
    float threshold = relativeThreshold / max(u_intensity, 0.01);

    // Early exit if contrast too low (flat area, no edge)
    if (contrast < threshold) {
        gl_FragColor = vec4(rgbM, 1.0);
        return;
    }

    // Sample corners for better edge detection
    vec3 rgbNW = texture2D(u_screen, v_uv + vec2(-1.0, -1.0) * inverseScreenSize).rgb;
    vec3 rgbNE = texture2D(u_screen, v_uv + vec2(1.0, -1.0) * inverseScreenSize).rgb;
    vec3 rgbSW = texture2D(u_screen, v_uv + vec2(-1.0, 1.0) * inverseScreenSize).rgb;
    vec3 rgbSE = texture2D(u_screen, v_uv + vec2(1.0, 1.0) * inverseScreenSize).rgb;

    float lumNW = luminance(rgbNW);
    float lumNE = luminance(rgbNE);
    float lumSW = luminance(rgbSW);
    float lumSE = luminance(rgbSE);

    // Compute directional gradients
    float lumNS = lumN + lumS;
    float lumEW = lumE + lumW;
    float lumNWSW = lumNW + lumSW;
    float lumNESE = lumNE + lumSE;

    // Determine edge direction (horizontal or vertical)
    float edgeVert = abs((lumNW + lumNE) - 2.0 * lumN) +
                     2.0 * abs((lumW + lumE) - 2.0 * lumM) +
                     abs((lumSW + lumSE) - 2.0 * lumS);

    float edgeHorz = abs((lumNW + lumNE) - 2.0 * lumW) +
                     2.0 * abs((lumN + lumS) - 2.0 * lumM) +
                     abs((lumSW + lumSE) - 2.0 * lumE);

    bool isHorizontal = edgeHorz >= edgeVert;

    // Choose blend direction perpendicular to edge
    vec2 blendDir;
    float gradientScaled;

    if (isHorizontal) {
        blendDir = vec2(0.0, 1.0);
        float lumNeg = lumN;
        float lumPos = lumS;
        gradientScaled = abs(lumNeg - lumM) + abs(lumPos - lumM);

        // Extend search in negative direction if gradient stronger there
        if (abs(lumNeg - lumM) >= abs(lumPos - lumM)) {
            blendDir.y = -1.0;
        }
    } else {
        blendDir = vec2(1.0, 0.0);
        float lumNeg = lumW;
        float lumPos = lumE;
        gradientScaled = abs(lumNeg - lumM) + abs(lumPos - lumM);

        if (abs(lumNeg - lumM) >= abs(lumPos - lumM)) {
            blendDir.x = -1.0;
        }
    }

    // Scale blend direction by screen space step
    blendDir *= inverseScreenSize;

    // Quality tuning: how far to search along edge
    // Higher quality = more samples, smoother edges
    const int SEARCH_STEPS = 8;
    const float SEARCH_THRESHOLD = 0.25;

    // Search along edge to find blend length
    float blendFactor = 0.0;

    for (int i = 1; i <= SEARCH_STEPS; i++) {
        vec2 offset = blendDir * float(i);
        vec3 rgbTest = texture2D(u_screen, v_uv + offset).rgb;
        float lumTest = luminance(rgbTest);

        // Stop if we've moved past the edge
        if (abs(lumTest - lumM) > contrast * SEARCH_THRESHOLD) {
            blendFactor = float(i - 1) / float(SEARCH_STEPS);
            break;
        }
    }

    // If we didn't find edge end, use max blend
    if (blendFactor == 0.0) {
        blendFactor = 1.0;
    }

    // Apply intensity scaling (user control)
    blendFactor *= u_intensity;

    // Subpixel antialiasing
    float subpixelBlend = 0.0;
    if (contrast > threshold) {
        float lumAvg = (lumN + lumS + lumE + lumW + lumNW + lumNE + lumSW + lumSE) / 8.0;
        float subpixelContrast = abs(lumAvg - lumM) / contrast;
        subpixelBlend = smoothstep(0.0, 1.0, subpixelContrast);
        subpixelBlend = subpixelBlend * subpixelBlend * u_intensity * 0.75;
    }

    // Take maximum of edge blend and subpixel blend
    float finalBlend = max(blendFactor, subpixelBlend);

    // Sample along blend direction
    vec3 rgbBlend = texture2D(u_screen, v_uv + blendDir * finalBlend).rgb;

    // Final color is blend between center and blended sample
    vec3 finalColor = mix(rgbM, rgbBlend, finalBlend);

    gl_FragColor = vec4(finalColor, 1.0);
}
`;
}

/**
 * FXAAManager class
 * Manages FXAA rendering pass
 */
export class FXAAManager {
    constructor(gl, width, height, config = {}) {
        this.gl = gl;
        this.width = width;
        this.height = height;

        // Configuration
        this.enabled = config.enabled !== undefined ? config.enabled : true;
        this.intensity = config.intensity !== undefined ? config.intensity : 0.75;

        // Create framebuffer for FXAA output
        this.framebuffer = null;
        this.texture = null;

        // Shader program
        this.program = null;

        // Vertex buffer for fullscreen quad (shared with renderer)
        this.quadBuffer = null;

        this.initialize();

        logger.info('FXAAManager initialized', {
            size: `${width}x${height}`,
            enabled: this.enabled,
            intensity: this.intensity
        });
    }

    /**
     * Initialize FXAA resources
     */
    initialize() {
        const gl = this.gl;

        // Create output framebuffer and texture
        this.createFramebuffer();

        // Compile FXAA shader
        this.compileShader();

        // Create fullscreen quad buffer (if not provided externally)
        if (!this.quadBuffer) {
            const quadVertices = new Float32Array([
                -1, -1,  1, -1,  -1, 1,
                -1, 1,   1, -1,   1, 1
            ]);
            this.quadBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
        }
    }

    /**
     * Create FXAA output framebuffer
     */
    createFramebuffer() {
        const gl = this.gl;

        // Use LDR format (UNSIGNED_BYTE) since FXAA now works on tone-mapped data
        const textureType = gl.UNSIGNED_BYTE;

        // Create texture
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, textureType, null);

        // Create framebuffer
        this.framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);

        // Check framebuffer status
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            logger.error('FXAA framebuffer incomplete', { status });
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /**
     * Compile FXAA shader program
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

        const fragmentShaderSource = generateFXAAShader();

        this.program = createProgram(gl, vertexShaderSource, fragmentShaderSource);

        if (!this.program) {
            logger.error('Failed to compile FXAA shader');
        }
    }

    /**
     * Apply FXAA to input texture
     * @param {WebGLTexture} inputTexture - HDR texture to apply FXAA to
     * @returns {WebGLTexture} - FXAA output texture
     */
    apply(inputTexture) {
        if (!this.enabled || this.intensity <= 0.0) {
            // Pass through without FXAA
            return inputTexture;
        }

        const gl = this.gl;

        // Bind FXAA framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.viewport(0, 0, this.width, this.height);

        // Use FXAA shader
        gl.useProgram(this.program);

        // Bind input texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, inputTexture);
        gl.uniform1i(gl.getUniformLocation(this.program, 'u_screen'), 0);

        // Set uniforms
        gl.uniform2f(gl.getUniformLocation(this.program, 'u_resolution'), this.width, this.height);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_intensity'), this.intensity);

        // Bind quad buffer
        const aPosLoc = gl.getAttribLocation(this.program, 'a_pos');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.enableVertexAttribArray(aPosLoc);
        gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

        // Draw fullscreen quad
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Unbind framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // Return FXAA output texture
        return this.texture;
    }

    /**
     * Apply FXAA directly to canvas (for LDR post-tone-mapping)
     * @param {WebGLTexture} inputTexture - LDR texture to apply FXAA to
     * @param {WebGLBuffer} quadBuffer - Quad buffer to use for rendering
     */
    applyToCanvas(inputTexture, quadBuffer) {
        const gl = this.gl;

        // Assume framebuffer is already bound to canvas by caller
        // Use FXAA shader
        gl.useProgram(this.program);

        // Bind input texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, inputTexture);
        gl.uniform1i(gl.getUniformLocation(this.program, 'u_screen'), 0);

        // Set uniforms
        gl.uniform2f(gl.getUniformLocation(this.program, 'u_resolution'), this.width, this.height);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_intensity'), this.intensity);

        // Bind quad buffer
        const aPosLoc = gl.getAttribLocation(this.program, 'a_pos');
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.enableVertexAttribArray(aPosLoc);
        gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

        // Draw fullscreen quad to canvas
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    /**
     * Update FXAA configuration
     */
    updateConfig(config) {
        if (config.enabled !== undefined) {
            this.enabled = config.enabled;
        }
        if (config.intensity !== undefined) {
            this.intensity = config.intensity;
        }
    }

    /**
     * Check if FXAA is enabled
     */
    isEnabled() {
        return this.enabled && this.intensity > 0.0;
    }

    /**
     * Resize FXAA resources
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
     * Set quad buffer (share with renderer to avoid duplication)
     */
    setQuadBuffer(buffer) {
        this.quadBuffer = buffer;
    }
}
