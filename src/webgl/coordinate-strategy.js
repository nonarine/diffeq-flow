/**
 * Base class for coordinate storage strategies
 * Defines the interface that all strategies must implement
 */
export class CoordinateStrategy {
    constructor(gl) {
        this.gl = gl;
    }

    /**
     * Get the WebGL texture format configuration
     * @returns {{internalFormat: number, format: number, type: number}}
     */
    getTextureFormat() {
        throw new Error('getTextureFormat() must be implemented by subclass');
    }

    /**
     * Get the JavaScript array type for storing data
     * @returns {TypedArrayConstructor} (e.g., Uint8Array or Float32Array)
     */
    getArrayType() {
        throw new Error('getArrayType() must be implemented by subclass');
    }

    /**
     * Get the number of components per value
     * @returns {number} (e.g., 4 for RGBA, 1 for single float)
     */
    getComponentsPerValue() {
        throw new Error('getComponentsPerValue() must be implemented by subclass');
    }

    /**
     * Check if this strategy requires a WebGL extension
     * @returns {boolean}
     */
    requiresExtension() {
        return false;
    }

    /**
     * Get the required WebGL extension name (if any)
     * @returns {string|null}
     */
    getExtensionName() {
        return null;
    }

    /**
     * Encode a world coordinate value for storage
     * @param {number} worldValue - Value in world coordinates
     * @param {number} min - Minimum world coordinate
     * @param {number} max - Maximum world coordinate
     * @returns {TypedArray} Encoded value as array (length = getComponentsPerValue())
     */
    encodeValue(worldValue, min, max) {
        throw new Error('encodeValue() must be implemented by subclass');
    }

    /**
     * Decode a stored value back to world coordinates
     * @param {TypedArray|Array} buffer - Encoded value
     * @param {number} min - Minimum world coordinate
     * @param {number} max - Maximum world coordinate
     * @returns {number} World coordinate value
     */
    decodeValue(buffer, min, max) {
        throw new Error('decodeValue() must be implemented by subclass');
    }

    /**
     * Normalize world coordinate to storage space
     * For RGBA: normalize to [0, 1]
     * For Float: might just return as-is
     * @param {number} worldValue - Value in world coordinates
     * @param {number} min - Minimum world coordinate
     * @param {number} max - Maximum world coordinate
     * @returns {number} Normalized value
     */
    normalizeWorld(worldValue, min, max) {
        throw new Error('normalizeWorld() must be implemented by subclass');
    }

    /**
     * Denormalize from storage space to world coordinates
     * @param {number} storageValue - Value from storage
     * @param {number} min - Minimum world coordinate
     * @param {number} max - Maximum world coordinate
     * @returns {number} World coordinate value
     */
    denormalizeWorld(storageValue, min, max) {
        throw new Error('denormalizeWorld() must be implemented by subclass');
    }

    /**
     * Get GLSL constant definitions needed by this strategy
     * @returns {string} GLSL code
     */
    getGLSLConstants() {
        throw new Error('getGLSLConstants() must be implemented by subclass');
    }

    /**
     * Get GLSL decode function
     * Converts from texture RGBA to float value
     * @returns {string} GLSL code
     */
    getGLSLDecodeFunction() {
        throw new Error('getGLSLDecodeFunction() must be implemented by subclass');
    }

    /**
     * Get GLSL encode function
     * Converts from float value to RGBA for texture storage
     * @returns {string} GLSL code
     */
    getGLSLEncodeFunction() {
        throw new Error('getGLSLEncodeFunction() must be implemented by subclass');
    }

    /**
     * Get GLSL normalize function
     * Converts world coordinates to storage space
     * @returns {string} GLSL code
     */
    getGLSLNormalizeFunction() {
        throw new Error('getGLSLNormalizeFunction() must be implemented by subclass');
    }

    /**
     * Get GLSL denormalize function
     * Converts from storage space to world coordinates
     * @returns {string} GLSL code
     */
    getGLSLDenormalizeFunction() {
        throw new Error('getGLSLDenormalizeFunction() must be implemented by subclass');
    }

    /**
     * Get a human-readable name for this strategy
     * @returns {string}
     */
    getName() {
        throw new Error('getName() must be implemented by subclass');
    }
}
