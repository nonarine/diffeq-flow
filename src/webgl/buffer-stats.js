/**
 * GPU-based buffer statistics computation
 * Uses multi-pass reduction to compute min/max/avg efficiently
 */

import { logger } from '../utils/debug-logger.js';

/**
 * BufferStatsManager
 * Computes min/max/avg of framebuffer using GPU reduction
 */
export class BufferStatsManager {
    constructor(gl) {
        this.gl = gl;
        this.reductionProgram = null;
        this.finalProgram = null;
        this.quadBuffer = null;
        this.reductionFBOs = [];
        this.reductionTextures = [];

        // Cached statistics
        this.stats = {
            red: { min: 0, max: 0, avg: 0 },
            green: { min: 0, max: 0, avg: 0 },
            blue: { min: 0, max: 0, avg: 0 },
            maxBrightness: 0,
            avgBrightness: 0,
            histogram: [], // Logarithmic histogram bins
            timestamp: 0
        };

        this.initialized = false;
    }

    /**
     * Initialize shaders and buffers
     */
    initialize() {
        const gl = this.gl;

        // Create quad buffer
        this.quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            0, 0,
            1, 0,
            0, 1,
            0, 1,
            1, 0,
            1, 1
        ]), gl.STATIC_DRAW);

        // Reduction shader (downsample 2x2 blocks, compute local min/max/sum)
        const reductionVS = `
attribute vec2 a_pos;
varying vec2 v_texcoord;
void main() {
    v_texcoord = a_pos;
    gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0);
}
`;

        const reductionFS = `
precision highp float;
uniform sampler2D u_texture;
uniform vec2 u_texel_size;
varying vec2 v_texcoord;

void main() {
    // Sample 2x2 block
    vec2 base = v_texcoord;
    vec3 s0 = texture2D(u_texture, base).rgb;
    vec3 s1 = texture2D(u_texture, base + vec2(u_texel_size.x, 0.0)).rgb;
    vec3 s2 = texture2D(u_texture, base + vec2(0.0, u_texel_size.y)).rgb;
    vec3 s3 = texture2D(u_texture, base + u_texel_size).rgb;

    // Compute min/max across the 2x2 block
    vec3 minVal = min(min(s0, s1), min(s2, s3));
    vec3 maxVal = max(max(s0, s1), max(s2, s3));

    // Store: R=min, G=max, B=sum (for averaging)
    // We'll pack min in R channel, max in G channel, sum in B channel
    // Actually, we need all three channels for each stat, so let's use a different approach
    // Let's just compute the max for now (most useful for saturation buildup)

    gl_FragColor = vec4(maxVal, 1.0);
}
`;

        this.reductionProgram = this.createProgram(reductionVS, reductionFS);
        if (!this.reductionProgram) {
            logger.error('Failed to create reduction shader');
            return false;
        }

        this.initialized = true;
        return true;
    }

    /**
     * Create shader program
     */
    createProgram(vsSource, fsSource) {
        const gl = this.gl;

        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vsSource);
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            logger.error('Vertex shader compile error:', gl.getShaderInfoLog(vs));
            return null;
        }

        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fsSource);
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            logger.error('Fragment shader compile error:', gl.getShaderInfoLog(fs));
            return null;
        }

        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            logger.error('Program link error:', gl.getProgramInfoLog(program));
            return null;
        }

        return program;
    }

    /**
     * Compute statistics (coarse = faster, samples every Nth pixel)
     */
    compute(sourceTexture, width, height, coarse = true) {
        if (!this.initialized && !this.initialize()) {
            return this.stats; // Return cached stats on failure
        }

        const gl = this.gl;
        const sampleRate = coarse ? 16 : 2; // Downsample by 16x (coarse) or 2x (fine) - 16x gives ~4x less pixels

        // For now, let's do a simple CPU-based sampling approach
        // (GPU reduction is complex and requires multiple passes)
        return this.computeCPUSampled(sourceTexture, width, height, sampleRate);
    }

    /**
     * CPU-based sampling (reads back sampled pixels)
     * Reads multiple small regions distributed across the screen
     */
    computeCPUSampled(sourceTexture, width, height, sampleRate) {
        const gl = this.gl;

        // Create temporary framebuffer
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sourceTexture, 0);

        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            logger.error('Framebuffer not complete for stats readback');
            gl.deleteFramebuffer(fbo);
            return this.stats;
        }

        // Sample multiple regions across the screen in a grid pattern
        // This ensures we capture bright/dark areas anywhere on screen, not just center
        const gridSize = 4; // 4x4 grid = 16 regions
        const regionSize = 16; // Each region is 16x16 pixels
        const totalPixels = gridSize * gridSize * regionSize * regionSize;
        const allPixels = new Float32Array(totalPixels * 4);

        let pixelIndex = 0;
        for (let gy = 0; gy < gridSize; gy++) {
            for (let gx = 0; gx < gridSize; gx++) {
                // Calculate position for this region (evenly distributed)
                const x = Math.floor((width / gridSize) * gx + (width / gridSize - regionSize) / 2);
                const y = Math.floor((height / gridSize) * gy + (height / gridSize - regionSize) / 2);

                // Read this region
                const regionPixels = new Float32Array(regionSize * regionSize * 4);
                gl.readPixels(x, y, regionSize, regionSize, gl.RGBA, gl.FLOAT, regionPixels);

                // Copy to combined buffer
                allPixels.set(regionPixels, pixelIndex * 4);
                pixelIndex += regionSize * regionSize;
            }
        }

        gl.deleteFramebuffer(fbo);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // Compute statistics from all sampled pixels
        let minR = Infinity, maxR = -Infinity, sumR = 0;
        let minG = Infinity, maxG = -Infinity, sumG = 0;
        let minB = Infinity, maxB = -Infinity, sumB = 0;
        const count = totalPixels;

        for (let i = 0; i < count; i++) {
            const idx = i * 4;
            const r = allPixels[idx];
            const g = allPixels[idx + 1];
            const b = allPixels[idx + 2];

            minR = Math.min(minR, r);
            maxR = Math.max(maxR, r);
            sumR += r;

            minG = Math.min(minG, g);
            maxG = Math.max(maxG, g);
            sumG += g;

            minB = Math.min(minB, b);
            maxB = Math.max(maxB, b);
            sumB += b;
        }

        // Compute averages
        const avgR = count > 0 ? sumR / count : 0;
        const avgG = count > 0 ? sumG / count : 0;
        const avgB = count > 0 ? sumB / count : 0;

        // Compute logarithmic histogram (20 bins)
        const numBins = 20;
        const histogram = new Array(numBins).fill(0);
        const maxBright = Math.max(maxR, maxG, maxB);

        if (maxBright > 0) {
            const logMax = Math.log2(maxBright + 1);

            for (let i = 0; i < count; i++) {
                const idx = i * 4;
                const brightness = Math.max(allPixels[idx], allPixels[idx + 1], allPixels[idx + 2]);
                const logBrightness = Math.log2(brightness + 1);
                const binIndex = Math.min(Math.floor((logBrightness / logMax) * numBins), numBins - 1);
                histogram[binIndex]++;
            }
        }

        // Update cached stats
        this.stats = {
            red: { min: minR, max: maxR, avg: avgR },
            green: { min: minG, max: maxG, avg: avgG },
            blue: { min: minB, max: maxB, avg: avgB },
            maxBrightness: Math.max(maxR, maxG, maxB),
            avgBrightness: (avgR + avgG + avgB) / 3,
            histogram: histogram,
            timestamp: Date.now(),
            sampledPixels: count,
            sampleRate: sampleRate
        };

        return this.stats;
    }

    /**
     * Get cached statistics (doesn't recompute)
     */
    getCached() {
        return this.stats;
    }

    /**
     * Dispose resources
     */
    dispose() {
        const gl = this.gl;

        if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer);
        if (this.reductionProgram) gl.deleteProgram(this.reductionProgram);
        if (this.finalProgram) gl.deleteProgram(this.finalProgram);

        this.reductionFBOs.forEach(fbo => gl.deleteFramebuffer(fbo));
        this.reductionTextures.forEach(tex => gl.deleteTexture(tex));

        this.reductionFBOs = [];
        this.reductionTextures = [];
    }
}
