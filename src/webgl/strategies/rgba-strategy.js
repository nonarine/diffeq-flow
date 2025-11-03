/**
 * RGBA-encoded coordinate storage strategy
 * Uses fixed-point encoding to store floats as RGBA bytes
 * This is the original implementation for maximum compatibility
 *
 * ⚠️ KNOWN ISSUES - COORDINATE MAPPING BUGS ⚠️
 *
 * This implementation has systematic coordinate mapping errors that cause particles
 * to cluster in specific quadrants (typically negative quadrants) rather than
 * maintaining proper circular orbits or uniform distributions.
 *
 * SYMPTOMS OBSERVED:
 * - Frame 0: Particles initialize with balanced distribution across all quadrants
 * - Frame 120+: All particles drift and cluster in lower-left quadrant
 * - With simple rotation field (dx/dt = -y, dy/dt = x), particles should maintain
 *   circular orbits, but instead they systematically drift toward negative coordinates
 * - The clustering behavior is consistent and reproducible, not random drift
 *
 * SUSPECTED ROOT CAUSES:
 *
 * 1. **Precision Loss in Fixed-Point Encoding**
 *    - 32-bit fixed-point (RGBA bytes) may have insufficient precision for world coordinates
 *    - Each encode/decode cycle through GPU introduces quantization error
 *    - Errors accumulate over frames, causing systematic drift
 *
 * 2. **Asymmetric Precision Around Zero**
 *    - Normalization to [0,1] before encoding: normalized = (worldValue - min) / (max - min)
 *    - For bbox [-5, 5], world value 0 maps to normalized 0.5
 *    - Floating point operations in GLSL may have asymmetric rounding behavior
 *    - Small biases toward one direction accumulate over time
 *
 * 3. **GLSL floor() in Byte Extraction**
 *    - The encodeFloat function uses floor() to extract bytes (see getGLSLEncodeFunction)
 *    - floor() always rounds down, potentially introducing systematic bias
 *    - Combined with normalization, this may create coordinate-dependent errors
 *
 * 4. **Texture Sampling Interpolation**
 *    - Even with NEAREST filtering, texture coordinate calculations involve floating point
 *    - Subtle interpolation or sampling errors could introduce position-dependent bias
 *
 * 5. **Byte-Order or Endianness Issues**
 *    - Big-endian byte packing (R = MSB, A = LSB) may interact poorly with GPU hardware
 *    - Different GPUs may handle byte-order differently
 *
 * WHY FLOAT TEXTURES FIX IT:
 * - Float textures (OES_texture_float) store world coordinates directly
 * - No encode/decode step = no quantization error accumulation
 * - No normalization = no asymmetric precision issues
 * - Direct float storage has ~23 bits mantissa precision vs ~8 bits per RGBA channel
 *
 * TESTING PERFORMED:
 * - Confirmed dropProbability = 0 (no respawning) still shows clustering
 * - Proved bug is in integration/encoding pipeline, not random particle initialization
 * - Float texture implementation shows perfect circular orbits and uniform distribution
 *
 * RECOMMENDATION:
 * Use FloatStrategy whenever possible. Only use RGBAStrategy for compatibility
 * with very old mobile devices that don't support OES_texture_float.
 */

import { CoordinateStrategy } from '../coordinate-strategy.js';
import { encodeFloatRGBA, decodeFloatRGBA } from '../../utils/float-packing.js';

export class RGBAStrategy extends CoordinateStrategy {
    constructor(gl) {
        super(gl);
    }

    getName() {
        return 'RGBA Fixed-Point Encoding';
    }

    getTextureFormat() {
        const gl = this.gl;
        return {
            internalFormat: gl.RGBA,
            format: gl.RGBA,
            type: gl.UNSIGNED_BYTE
        };
    }

    getArrayType() {
        return Uint8Array;
    }

    getComponentsPerValue() {
        return 4; // RGBA = 4 bytes per encoded float
    }

    requiresExtension() {
        return false; // RGBA UNSIGNED_BYTE always supported
    }

    getExtensionName() {
        return null;
    }

    encodeValue(worldValue, min, max) {
        // Normalize world value to [0, 1]
        const normalized = (worldValue - min) / (max - min);

        // Encode to RGBA bytes
        const buffer = new Uint8Array(4);
        encodeFloatRGBA(normalized, buffer, 0);

        return buffer;
    }

    decodeValue(buffer, min, max) {
        // Decode RGBA bytes to [0, 1]
        const normalized = decodeFloatRGBA(buffer[0], buffer[1], buffer[2], buffer[3]);

        // Denormalize to world coordinates
        return min + normalized * (max - min);
    }

    normalizeWorld(worldValue, min, max) {
        return (worldValue - min) / (max - min);
    }

    denormalizeWorld(normalized, min, max) {
        return min + normalized * (max - min);
    }

    getGLSLConstants() {
        return `
// Map to [0, 1] range for maximum precision at any zoom level
const float FIXED_POINT_SCALE = 4294967295.0; // 2^32 - 1
`;
    }

    getGLSLDecodeFunction() {
        return `
// Decode RGBA bytes back to float in [0, 1] range
float decodeFloat(vec4 rgba) {
    // Reconstruct 32-bit integer from bytes (big-endian)
    vec4 bytes = rgba * 255.0;
    float intValue = bytes.r * 16777216.0 + bytes.g * 65536.0 + bytes.b * 256.0 + bytes.a;

    // Map from [0, 2^32-1] back to [0, 1]
    return intValue / FIXED_POINT_SCALE;
}
`;
    }

    getGLSLEncodeFunction() {
        return `
// Encode float in [0, 1] range to RGBA bytes
vec4 encodeFloat(float v) {
    // Clamp to [0, 1]
    v = clamp(v, 0.0, 1.0);

    // Map to [0, 2^32-1]
    float normalized = v * FIXED_POINT_SCALE;

    // Split into 4 bytes (big-endian)
    float byte0 = floor(normalized / 16777216.0);  // 2^24
    normalized -= byte0 * 16777216.0;
    float byte1 = floor(normalized / 65536.0);      // 2^16
    normalized -= byte1 * 65536.0;
    float byte2 = floor(normalized / 256.0);        // 2^8
    normalized -= byte2 * 256.0;
    float byte3 = floor(normalized);

    return vec4(byte0, byte1, byte2, byte3) / 255.0;
}
`;
    }

    getGLSLNormalizeFunction() {
        return `
// Helper to normalize world coordinate to [0, 1] relative to viewport
float normalizeToViewport(float worldValue, float minVal, float maxVal) {
    return (worldValue - minVal) / (maxVal - minVal);
}
`;
    }

    getGLSLDenormalizeFunction() {
        return `
// Helper to denormalize from [0, 1] back to world coordinates
float denormalizeFromViewport(float normalized, float minVal, float maxVal) {
    return minVal + normalized * (maxVal - minVal);
}
`;
    }
}
