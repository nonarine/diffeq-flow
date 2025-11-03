/**
 * Particle system for managing particle data
 */

import { logger } from '../utils/debug-logger.js';

/**
 * Particle system class
 */
export class ParticleSystem {
    constructor(particleCount, dimensions, bbox, strategy) {
        this.particleCount = particleCount;
        this.dimensions = dimensions;
        this.bbox = bbox || this.getDefaultBBox(dimensions);
        this.strategy = strategy;

        // Calculate texture resolution (square texture)
        this.resolution = Math.ceil(Math.sqrt(particleCount));
        this.actualParticleCount = this.resolution * this.resolution;

        // Initialize particle data
        this.initializeParticles();
    }

    /**
     * Get default bounding box based on dimensions
     */
    getDefaultBBox(dimensions) {
        const bbox = {
            min: new Array(dimensions).fill(-5),
            max: new Array(dimensions).fill(5)
        };
        return bbox;
    }

    /**
     * Initialize particle positions randomly within bounding box
     */
    initializeParticles() {
        this.data = [];
        const debugSamples = []; // Track samples for debugging

        const ArrayType = this.strategy.getArrayType();
        const componentsPerValue = this.strategy.getComponentsPerValue();

        for (let dim = 0; dim < this.dimensions; dim++) {
            const dimData = new ArrayType(this.actualParticleCount * componentsPerValue);

            for (let i = 0; i < this.actualParticleCount; i++) {
                // Random position within bounding box for this dimension
                // Generate world coordinate
                // Spawn 2% OUTSIDE viewport for natural flow-in effect
                const margin = -0.02;
                let worldValue;

                if (dim < 2 && this.bbox.min && this.bbox.max) {
                    // Use 2D bounding box for first two dimensions
                    const min = dim === 0 ? this.bbox.min[0] : this.bbox.min[1];
                    const max = dim === 0 ? this.bbox.max[0] : this.bbox.max[1];
                    const range = max - min;
                    // Spawn slightly outside viewport (negative margin)
                    worldValue = min + range * margin + Math.random() * range * (1 - 2 * margin);
                } else {
                    // For higher dimensions, use default range [-10, 10] extending slightly beyond
                    worldValue = -10.4 + Math.random() * 20.8;
                }

                // Encode using strategy
                const min = dim < 2 ? (dim === 0 ? this.bbox.min[0] : this.bbox.min[1]) : -10;
                const max = dim < 2 ? (dim === 0 ? this.bbox.max[0] : this.bbox.max[1]) : 10;
                const encoded = this.strategy.encodeValue(worldValue, min, max);

                // Copy encoded value to dimData
                const offset = i * componentsPerValue;
                for (let c = 0; c < componentsPerValue; c++) {
                    dimData[offset + c] = encoded[c];
                }

                // Debug: log first 10 particles for dimension 0 and 1
                if (i < 10 && dim < 2) {
                    // Test round-trip: decode what we just encoded
                    const buffer = new ArrayType(componentsPerValue);
                    for (let c = 0; c < componentsPerValue; c++) {
                        buffer[c] = dimData[offset + c];
                    }
                    const decodedWorld = this.strategy.decodeValue(buffer, min, max);

                    if (!debugSamples[i]) debugSamples[i] = {};

                    // Format encoded value for display
                    let encodedStr;
                    if (componentsPerValue === 4) {
                        encodedStr = `[${encoded[0].toFixed?.(0) || encoded[0]}, ${encoded[1].toFixed?.(0) || encoded[1]}, ${encoded[2].toFixed?.(0) || encoded[2]}, ${encoded[3].toFixed?.(0) || encoded[3]}]`;
                    } else {
                        encodedStr = encoded[0].toString();
                    }

                    debugSamples[i][dim === 0 ? 'x' : 'y'] = {
                        worldValue: worldValue.toFixed(4),
                        encoded: encodedStr,
                        decodedWorld: decodedWorld.toFixed(4),
                        error: Math.abs(worldValue - decodedWorld).toFixed(6)
                    };
                }
            }

            this.data.push(dimData);
        }

        // Log debug samples
        if (debugSamples.length > 0) {
            logger.info('Particle initialization - first 10 particles:', {
                strategy: this.strategy.getName(),
                bbox: `[${this.bbox.min[0]}, ${this.bbox.min[1]}] to [${this.bbox.max[0]}, ${this.bbox.max[1]}]`,
                samples: debugSamples.filter(s => s) // Filter out undefined
            });
        }

        // Create particle index buffer (for rendering)
        this.indices = new Float32Array(this.actualParticleCount);
        for (let i = 0; i < this.actualParticleCount; i++) {
            this.indices[i] = i;
        }
    }

    /**
     * Get particle data for a specific dimension
     */
    getDimensionData(dimension) {
        return this.data[dimension];
    }

    /**
     * Get all particle data
     */
    getAllData() {
        return this.data;
    }

    /**
     * Get particle indices for rendering
     */
    getIndices() {
        return this.indices;
    }

    /**
     * Update particle count and reinitialize
     */
    setParticleCount(newCount) {
        this.particleCount = newCount;
        this.resolution = Math.ceil(Math.sqrt(newCount));
        this.actualParticleCount = this.resolution * this.resolution;
        this.initializeParticles();
    }

    /**
     * Update dimensions and reinitialize
     */
    setDimensions(newDimensions) {
        this.dimensions = newDimensions;
        this.bbox = this.getDefaultBBox(newDimensions);
        this.initializeParticles();
    }

    /**
     * Update bounding box
     */
    setBBox(newBBox) {
        this.bbox = newBBox;
    }

    /**
     * Get current resolution
     */
    getResolution() {
        return this.resolution;
    }

    /**
     * Get actual particle count (may be higher than requested due to square texture)
     */
    getActualParticleCount() {
        return this.actualParticleCount;
    }
}
