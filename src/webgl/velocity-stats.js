/**
 * GPU-based velocity statistics computation
 * Samples particles and computes max/avg velocity using shaders
 */

import { logger } from '../utils/debug-logger.js';

export class VelocityStatsManager {
    constructor(gl) {
        this.gl = gl;
        this.program = null;
        this.quadBuffer = null;
        this.resultTexture = null;
        this.resultFBO = null;

        // Cached statistics
        this.stats = {
            maxVelocity: 5.0,
            avgVelocity: 2.0,
            sampleCount: 0,
            timestamp: 0
        };

        this.initialized = false;
        this.shaderSource = null; // Store for debugging
    }

    /**
     * Initialize shaders and buffers
     */
    initialize(dimensions, velocityExpressions) {
        const gl = this.gl;

        // Create quad buffer for full-screen pass
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

        // Create small result texture (64x1 pixels for 64 samples)
        this.resultTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.resultTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 64, 1, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Create framebuffer
        this.resultFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.resultFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.resultTexture, 0);

        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            logger.error('Velocity stats framebuffer not complete');
            this.dispose();
            return false;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // Generate velocity function from expressions
        const vecType = `vec${dimensions}`;
        const swizzles = ['x', 'y', 'z', 'w'];
        const velocityComponents = velocityExpressions.map((expr, i) =>
            `    result.${swizzles[i]} = ${expr};`
        ).join('\n');

        const velocityFunction = `
// User-defined velocity field
${vecType} get_velocity(${vecType} pos) {
    ${vecType} result;
    float x = pos.x;
    ${dimensions > 1 ? 'float y = pos.y;' : ''}
    ${dimensions > 2 ? 'float z = pos.z;' : ''}
    ${dimensions > 3 ? 'float w = pos.w;' : ''}

${velocityComponents}

    return result;
}
`;

        // Create shader program
        const vertexShader = `
attribute vec2 a_pos;
varying vec2 v_texcoord;
void main() {
    v_texcoord = a_pos;
    gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0);
}
`;

        const fragmentShader = `
precision highp float;

${Array.from({length: dimensions}, (_, i) => `uniform sampler2D u_pos_${i};`).join('\n')}
uniform vec2 u_bbox_min;
uniform vec2 u_bbox_max;
uniform float u_resolution;
uniform float u_sample_count;

varying vec2 v_texcoord;

${velocityFunction}

void main() {
    // Each output pixel computes velocity for one sampled particle
    float particleIndex = floor(v_texcoord.x * u_sample_count);

    // Random sampling across all particles
    float totalParticles = u_resolution * u_resolution;
    float stride = totalParticles / u_sample_count;
    float sampleIdx = particleIndex * stride;

    // Convert to texture coordinates
    float x = mod(sampleIdx, u_resolution);
    float y = floor(sampleIdx / u_resolution);
    vec2 texCoord = (vec2(x, y) + 0.5) / u_resolution;

    // Read position from textures
    vec${dimensions} position;
    ${Array.from({length: dimensions}, (_, i) =>
        `position[${i}] = texture2D(u_pos_${i}, texCoord).r;`
    ).join('\n    ')}

    // Compute velocity
    vec${dimensions} velocity = get_velocity(position);

    // Compute magnitude
    float speed = length(velocity);

    // Output: R = velocity magnitude, G = 1.0 (for counting), B/A unused
    gl_FragColor = vec4(speed, 1.0, 0.0, 1.0);
}
`;

        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vertexShader);
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            logger.error('Velocity stats vertex shader error:', gl.getShaderInfoLog(vs));
            return false;
        }

        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fragmentShader);
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            logger.error('Velocity stats fragment shader error:', gl.getShaderInfoLog(fs));
            logger.error('Generated shader code:\n' + fragmentShader);
            return false;
        }

        this.program = gl.createProgram();
        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            logger.error('Velocity stats program link error:', gl.getProgramInfoLog(this.program));
            return false;
        }

        this.initialized = true;
        this.dimensions = dimensions;
        this.shaderSource = fragmentShader; // Store for debugging
        logger.verbose('VelocityStatsManager initialized');
        return true;
    }

    /**
     * Compute velocity statistics
     */
    compute(positionTextures, bbox, resolution) {
        if (!this.initialized) {
            return this.stats;
        }

        const gl = this.gl;

        // Render to result texture
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.resultFBO);
        gl.viewport(0, 0, 64, 1);

        gl.useProgram(this.program);

        // Bind position textures
        for (let i = 0; i < this.dimensions; i++) {
            gl.activeTexture(gl.TEXTURE0 + i);
            gl.bindTexture(gl.TEXTURE_2D, positionTextures[i]);
            gl.uniform1i(gl.getUniformLocation(this.program, `u_pos_${i}`), i);
        }

        // Set uniforms
        gl.uniform2f(gl.getUniformLocation(this.program, 'u_bbox_min'), bbox.min[0], bbox.min[1]);
        gl.uniform2f(gl.getUniformLocation(this.program, 'u_bbox_max'), bbox.max[0], bbox.max[1]);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_resolution'), resolution);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_sample_count'), 64);

        // Draw quad
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        const aPosLoc = gl.getAttribLocation(this.program, 'a_pos');
        gl.enableVertexAttribArray(aPosLoc);
        gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Read back result (64 pixels × 4 channels)
        const results = new Float32Array(64 * 4);
        gl.readPixels(0, 0, 64, 1, gl.RGBA, gl.FLOAT, results);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // Process results - extract valid velocities
        const velocities = [];
        let maxVel = 0;
        let sumVel = 0;

        for (let i = 0; i < 64; i++) {
            const vel = results[i * 4]; // R channel = velocity magnitude
            if (isFinite(vel) && vel > 0) {
                velocities.push(vel);
                maxVel = Math.max(maxVel, vel);
                sumVel += vel;
            }
        }

        const count = velocities.length;
        const avgVel = count > 0 ? sumVel / count : 0;

        // Compute percentiles (90th and 95th) for more robust scaling
        let percentile90 = avgVel;
        let percentile95 = avgVel;
        if (count > 0) {
            velocities.sort((a, b) => a - b);
            const idx90 = Math.floor(count * 0.90);
            const idx95 = Math.floor(count * 0.95);
            percentile90 = velocities[Math.min(idx90, count - 1)];
            percentile95 = velocities[Math.min(idx95, count - 1)];
        }

        // Update cached stats
        this.stats = {
            maxVelocity: maxVel > 0 ? maxVel : this.stats.maxVelocity,
            avgVelocity: avgVel > 0 ? avgVel : this.stats.avgVelocity,
            percentile90: percentile90 > 0 ? percentile90 : this.stats.percentile90 || avgVel,
            percentile95: percentile95 > 0 ? percentile95 : this.stats.percentile95 || avgVel,
            sampleCount: count,
            timestamp: Date.now()
        };

        return this.stats;
    }

    /**
     * Get cached statistics
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
        if (this.program) gl.deleteProgram(this.program);
        if (this.resultTexture) gl.deleteTexture(this.resultTexture);
        if (this.resultFBO) gl.deleteFramebuffer(this.resultFBO);
        this.initialized = false;
    }

    /**
     * Needs recompilation when velocity field changes
     */
    needsRecompile() {
        return true; // Caller should track this
    }

    /**
     * Get shader source for debugging
     */
    getShaderSource() {
        return this.shaderSource;
    }
}
