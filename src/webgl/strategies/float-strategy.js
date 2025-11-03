/**
 * Float texture coordinate storage strategy
 * Stores coordinates directly as floats without encoding
 * Requires OES_texture_float extension (available on most modern devices)
 */

import { CoordinateStrategy } from '../coordinate-strategy.js';
import { logger } from '../../utils/debug-logger.js';

export class FloatStrategy extends CoordinateStrategy {
    constructor(gl) {
        super(gl);

        // Check for float texture support
        const ext = gl.getExtension('OES_texture_float');
        if (!ext) {
            throw new Error('OES_texture_float extension not supported');
        }

        logger.info('Float texture support detected', {
            extension: 'OES_texture_float'
        });
    }

    getName() {
        return 'Float Textures (Direct Storage)';
    }

    getTextureFormat() {
        const gl = this.gl;
        return {
            internalFormat: gl.RGBA,
            format: gl.RGBA,
            type: gl.FLOAT
        };
    }

    getArrayType() {
        return Float32Array;
    }

    getComponentsPerValue() {
        // Store float in RGBA.r, leave g,b,a unused
        return 4;
    }

    requiresExtension() {
        return true;
    }

    getExtensionName() {
        return 'OES_texture_float';
    }

    encodeValue(worldValue, min, max) {
        // No encoding needed! Store world coordinate directly
        // But pack into RGBA format: [worldValue, 0, 0, 1]
        const buffer = new Float32Array(4);
        buffer[0] = worldValue;
        buffer[1] = 0;
        buffer[2] = 0;
        buffer[3] = 1;
        return buffer;
    }

    decodeValue(buffer, min, max) {
        // No decoding needed! Just return the value directly
        return buffer[0];
    }

    normalizeWorld(worldValue, min, max) {
        // No normalization needed for float textures
        return worldValue;
    }

    denormalizeWorld(storageValue, min, max) {
        // No denormalization needed for float textures
        return storageValue;
    }

    getGLSLConstants() {
        return `
// Float strategy: no constants needed
`;
    }

    getGLSLDecodeFunction() {
        return `
// Decode float from RGBA - just read the red channel directly
float decodeFloat(vec4 rgba) {
    return rgba.r;
}
`;
    }

    getGLSLEncodeFunction() {
        return `
// Encode float to RGBA - store in red channel
vec4 encodeFloat(float v) {
    return vec4(v, 0.0, 0.0, 1.0);
}
`;
    }

    getGLSLNormalizeFunction() {
        return `
// Float strategy: no normalization needed, pass through directly
float normalizeToViewport(float worldValue, float minVal, float maxVal) {
    return worldValue;
}
`;
    }

    getGLSLDenormalizeFunction() {
        return `
// Float strategy: no denormalization needed, pass through directly
float denormalizeFromViewport(float normalized, float minVal, float maxVal) {
    return normalized;
}
`;
    }
}
