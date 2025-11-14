/**
 * RGBA-encoded coordinate storage strategy
 * Uses 32-bit fixed-point encoding to store floats as RGBA bytes
 *
 * Provides maximum compatibility with all WebGL devices, including those
 * without floating-point texture support.
 *
 * ENCODING:
 * - World coordinates normalized to [0, 1] relative to viewport bounds
 * - Normalized value mapped to 32-bit integer using scale factor 2^32 - 1
 * - Integer split into 4 bytes (RGBA) using big-endian byte order
 * - Provides approximately 32 bits of precision per coordinate
 *
 * PRECISION:
 * - ~8 bits per RGBA channel, combined to 32-bit fixed-point
 * - Slightly lower precision than native float textures (~23 bits mantissa)
 * - Very minor quantization artifacts may appear in extreme zoom scenarios
 * - Negligible for typical visualization use cases
 *
 * PERFORMANCE:
 * - No extension requirements, works on all devices
 * - Small encoding/decoding overhead in shaders
 * - Recommended for maximum compatibility
 *
 * COMPARISON TO FLOAT STRATEGY:
 * - FloatStrategy provides higher precision (~23-bit mantissa, direct storage)
 * - RGBAStrategy has wider device compatibility (no extension required)
 * - Both strategies produce visually identical results for most systems
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
