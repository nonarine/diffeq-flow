/**
 * Float packing utilities for encoding/decoding floats into RGBA bytes
 * This allows high-precision storage in WebGL textures without requiring
 * floating point texture support.
 *
 * Uses fixed-point encoding for simplicity and reliability
 */

// Fixed point scale for encoding [0, 1] values to 32-bit integers
const FIXED_POINT_SCALE = 4294967295.0; // 2^32 - 1

/**
 * Encode a float into 4 bytes (RGBA) using fixed-point encoding
 * Expects value in [0, 1] range (viewport-normalized)
 * @param {number} value - Float value to encode (should be in [0, 1])
 * @param {Uint8Array} out - Output array
 * @param {number} offset - Offset in output array
 */
export function encodeFloatRGBA(value, out, offset) {
    // Clamp to [0, 1] range
    value = Math.max(0, Math.min(1, value));

    // Map to [0, 2^32-1]
    const intValue = Math.floor(value * FIXED_POINT_SCALE);

    // Split 32-bit integer into 4 bytes (big-endian)
    out[offset + 0] = (intValue >>> 24) & 0xFF;
    out[offset + 1] = (intValue >>> 16) & 0xFF;
    out[offset + 2] = (intValue >>> 8) & 0xFF;
    out[offset + 3] = intValue & 0xFF;
}

/**
 * Decode RGBA bytes into a float using fixed-point decoding
 * Returns value in [0, 1] range (viewport-normalized)
 * @param {number} r - Red channel (0-255)
 * @param {number} g - Green channel (0-255)
 * @param {number} b - Blue channel (0-255)
 * @param {number} a - Alpha channel (0-255)
 * @returns {number} Decoded float value in [0, 1]
 */
export function decodeFloatRGBA(r, g, b, a) {
    // Reconstruct 32-bit integer from bytes (big-endian)
    const intValue = (r << 24) | (g << 16) | (b << 8) | a;

    // Map from [0, 2^32-1] back to [0, 1]
    // Handle unsigned to avoid sign issues
    const uintValue = intValue >>> 0; // convert to unsigned
    return uintValue / FIXED_POINT_SCALE;
}

/**
 * GLSL shader code for fixed-point constants (shared by encode/decode)
 * @returns {string} GLSL constant definitions
 */
export function getFixedPointConstantsGLSL() {
    return `
// Map to [0, 1] range for maximum precision at any zoom level
const float FIXED_POINT_SCALE = 4294967295.0; // 2^32 - 1
`;
}

/**
 * GLSL shader code for encoding float to RGBA
 * Now uses viewport-relative encoding for dimensions 0 and 1 (x, y)
 * @returns {string} GLSL function code
 */
export function getEncodeGLSL() {
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

// Helper to normalize world coordinate to [0, 1] relative to viewport
float normalizeToViewport(float worldValue, float minVal, float maxVal) {
    return (worldValue - minVal) / (maxVal - minVal);
}

// Helper to denormalize from [0, 1] back to world coordinates
float denormalizeFromViewport(float normalized, float minVal, float maxVal) {
    return minVal + normalized * (maxVal - minVal);
}
`;
}

/**
 * GLSL shader code for decoding RGBA to float
 * @returns {string} GLSL function code
 */
export function getDecodeGLSL() {
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
