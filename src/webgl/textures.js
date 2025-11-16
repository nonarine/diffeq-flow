/**
 * Texture manager for N-dimensional particle positions
 * Uses ping-pong textures to update positions on GPU
 */

/**
 * Create a collection of textures for storing N-dimensional positions
 */
export class TextureManager {
    constructor(gl, dimensions, resolution, strategy) {
        this.gl = gl;
        this.dimensions = dimensions;
        this.resolution = resolution;
        this.strategy = strategy;

        // Create read and write texture pairs for each dimension (dual buffering for point mode)
        this.readTextures = [];
        this.writeTextures = [];

        for (let i = 0; i < dimensions; i++) {
            this.readTextures.push(this.createTexture());
            this.writeTextures.push(this.createTexture());
        }

        // Triple buffering (always active for velocity computation and line rendering)
        this.lineMode = false; // Render mode: false = points, true = lines
        this.prevTextures = [];
        for (let i = 0; i < dimensions; i++) {
            this.prevTextures.push(this.createTexture());
        }

        // Note: Age is stored in alpha channel of dimension 0, no separate age textures needed

        // Texture units start from 0
        this.textureUnitOffset = 0;
    }

    /**
     * Create a single texture using the configured strategy
     */
    createTexture() {
        const gl = this.gl;
        const texture = gl.createTexture();
        const format = this.strategy.getTextureFormat();

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        // Create empty texture using strategy's format
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            format.internalFormat,
            this.resolution,
            this.resolution,
            0,
            format.format,
            format.type,
            null
        );

        return texture;
    }

    /**
     * Set line rendering mode (affects draw call only, not texture management)
     * @param {boolean} enabled - Whether to render lines (true) or points (false)
     */
    setLineMode(enabled) {
        this.lineMode = enabled; // Only affects rendering, prevTextures always exist
    }

    /**
     * Enable previous textures (no-op, textures always exist now)
     * @param {boolean} enabled - Whether previous textures are needed
     */
    setNeedsPrevTextures(enabled) {
        // No-op: prevTextures are always created now
    }

    /**
     * Initialize textures with particle data
     * @param {TypedArray[]} data - Array of encoded particle positions (one per dimension)
     */
    initializeData(data) {
        const gl = this.gl;
        const format = this.strategy.getTextureFormat();

        for (let i = 0; i < this.dimensions; i++) {
            // Initialize read texture with data
            gl.bindTexture(gl.TEXTURE_2D, this.readTextures[i]);
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                format.internalFormat,
                this.resolution,
                this.resolution,
                0,
                format.format,
                format.type,
                data[i]
            );

            // Write texture stays empty (will be written to in first frame)
            gl.bindTexture(gl.TEXTURE_2D, this.writeTextures[i]);
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                format.internalFormat,
                this.resolution,
                this.resolution,
                0,
                format.format,
                format.type,
                null
            );

            // Initialize previous texture with same data
            gl.bindTexture(gl.TEXTURE_2D, this.prevTextures[i]);
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                format.internalFormat,
                this.resolution,
                this.resolution,
                0,
                format.format,
                format.type,
                data[i]
            );
        }

        // Initialize alpha channel of dimension 0 to age = 1.0 so particles render immediately
        // Age is stored in alpha channel of u_pos_0
        const ArrayType = this.strategy.getArrayType();
        const componentsPerValue = this.strategy.getComponentsPerValue();

        // For float textures (RGBA format), set alpha channel to 1.0
        if (format.format === gl.RGBA) {
            // Re-read the data[0] texture to modify alpha channel
            const dim0Data = data[0];
            for (let i = 0; i < this.resolution * this.resolution; i++) {
                // Alpha is the 4th component (index 3) in RGBA
                if (componentsPerValue === 4) {
                    dim0Data[i * 4 + 3] = 1.0; // Set age = 1.0
                }
            }

            // Re-upload dimension 0 with modified alpha
            gl.bindTexture(gl.TEXTURE_2D, this.readTextures[0]);
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                format.internalFormat,
                this.resolution,
                this.resolution,
                0,
                format.format,
                format.type,
                dim0Data
            );

            // Also upload to previous texture
            gl.bindTexture(gl.TEXTURE_2D, this.prevTextures[0]);
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                format.internalFormat,
                this.resolution,
                this.resolution,
                0,
                format.format,
                format.type,
                dim0Data
            );
        }
    }

    /**
     * Bind read textures to shader uniforms
     * @param {WebGLProgram} program - Shader program
     */
    bindReadTextures(program) {
        const gl = this.gl;

        for (let i = 0; i < this.dimensions; i++) {
            const uniformName = `u_pos_${i}`;
            const location = gl.getUniformLocation(program, uniformName);

            if (location !== null) {
                gl.activeTexture(gl.TEXTURE0 + this.textureUnitOffset + i);
                gl.bindTexture(gl.TEXTURE_2D, this.readTextures[i]);
                gl.uniform1i(location, this.textureUnitOffset + i);
            }
        }
    }

    /**
     * Bind previous frame textures to shader uniforms (always available)
     * @param {WebGLProgram} program - Shader program
     */
    bindPrevTextures(program) {
        const gl = this.gl;

        for (let i = 0; i < this.dimensions; i++) {
            const uniformName = `u_prev_pos_${i}`;
            const location = gl.getUniformLocation(program, uniformName);

            if (location !== null) {
                // Use texture units after the current position textures
                const textureUnit = this.textureUnitOffset + this.dimensions + i;
                gl.activeTexture(gl.TEXTURE0 + textureUnit);
                gl.bindTexture(gl.TEXTURE_2D, this.prevTextures[i]);
                gl.uniform1i(location, textureUnit);
            }
        }
    }

    /**
     * Get write texture for a specific dimension
     * @param {number} dimension - Dimension index
     */
    getWriteTexture(dimension) {
        return this.writeTextures[dimension];
    }

    /**
     * Swap read and write textures (ping-pong for points, triple-buffer rotation for lines)
     */
    swap() {
        // Triple buffer rotation: prev <- read <- write <- prev
        const temp = this.prevTextures;
        this.prevTextures = this.readTextures;
        this.readTextures = this.writeTextures;
        this.writeTextures = temp;

        // Age is now in alpha channel of dimension 0, swapped with position textures
    }

    /**
     * Resize textures
     */
    resize(newResolution) {
        const gl = this.gl;
        this.resolution = newResolution;

        // Delete old textures
        for (let i = 0; i < this.dimensions; i++) {
            gl.deleteTexture(this.readTextures[i]);
            gl.deleteTexture(this.writeTextures[i]);
            gl.deleteTexture(this.prevTextures[i]);
        }

        // Create new ones
        this.readTextures = [];
        this.writeTextures = [];
        this.prevTextures = [];

        for (let i = 0; i < this.dimensions; i++) {
            this.readTextures.push(this.createTexture());
            this.writeTextures.push(this.createTexture());
            this.prevTextures.push(this.createTexture());
        }
    }

    /**
     * Clean up resources
     */
    dispose() {
        const gl = this.gl;

        for (let i = 0; i < this.dimensions; i++) {
            gl.deleteTexture(this.readTextures[i]);
            gl.deleteTexture(this.writeTextures[i]);
            gl.deleteTexture(this.prevTextures[i]);
        }

        this.readTextures = [];
        this.writeTextures = [];
        this.prevTextures = [];
    }

    /**
     * Get current read textures (for debugging)
     */
    getReadTextures() {
        return this.readTextures;
    }

    /**
     * Read back texture data (for debugging/analysis)
     */
    readTexture(dimension) {
        const gl = this.gl;
        const format = this.strategy.getTextureFormat();
        const ArrayType = this.strategy.getArrayType();
        const componentsPerValue = this.strategy.getComponentsPerValue();

        const data = new ArrayType(this.resolution * this.resolution * componentsPerValue);

        const framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            this.readTextures[dimension],
            0
        );

        gl.readPixels(0, 0, this.resolution, this.resolution, format.format, format.type, data);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(framebuffer);

        return data;
    }
}
