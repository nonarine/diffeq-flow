/**
 * Main WebGL renderer for N-dimensional vector field visualization
 */

import { TextureManager } from './textures.js';
import { FramebufferManager } from './framebuffer.js';
import { BloomManager } from './bloom.js';
import { BilateralFilterManager } from './bilateral.js';
import { SMAAManager } from './smaa.js';
import { BufferStatsManager } from './buffer-stats.js';
import { VelocityStatsManager } from './velocity-stats.js';
import { ParticleSystem } from '../particles/system.js';
import {
    createProgram,
    generateUpdateVertexShader,
    generateUpdateFragmentShader,
    generateDrawVertexShader,
    generateDrawFragmentShader,
    generateScreenVertexShader,
    generateScreenFadeFragmentShader,
    generateScreenCopyFragmentShader,
    generateTonemapFragmentShader,
    generateBloomBrightPassShader,
    generateBloomBlurShader,
    generateBloomCombineShader
} from './shaders.js';
import { parseVectorField, createVelocityEvaluators, parseExpression } from '../math/parser.js';
import { getIntegrator } from '../math/integrators.js';
import { getMapper } from '../math/mappers.js';
import { getTransform } from '../math/transforms.js';
import { getColorMode, generateExpressionColorMode, generateGradientColorMode } from '../math/colors.js';
import { generateGradientGLSL, getDefaultGradient } from '../math/gradients.js';
import { generateTonemapGLSL, getToneMapper } from '../math/tonemapping.js';
import { logger } from '../utils/debug-logger.js';
import { RGBAStrategy } from './strategies/rgba-strategy.js';
import { FloatStrategy } from './strategies/float-strategy.js';

/**
 * WebGL Renderer class
 */
export class Renderer {
    constructor(canvas, config = {}) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl', {
            alpha: false,
            depth: false,
            stencil: false,
            antialias: false,
            preserveDrawingBuffer: false
        });

        if (!this.gl) {
            throw new Error('WebGL not supported');
        }

        const gl = this.gl;

        // Disable depth and stencil tests
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.STENCIL_TEST);

        // Enable blending (blend mode will be set per render pass)
        gl.enable(gl.BLEND);

        // Select coordinate storage strategy
        const strategyType = config.storageStrategy || 'rgba';
        try {
            if (strategyType === 'float') {
                this.strategy = new FloatStrategy(gl);
                logger.info('Using Float texture strategy');
            } else {
                this.strategy = new RGBAStrategy(gl);
                logger.info('Using RGBA encoded texture strategy');
            }
        } catch (error) {
            logger.warn(`Failed to initialize ${strategyType} strategy: ${error.message}`);
            logger.info('Falling back to RGBA strategy');
            this.strategy = new RGBAStrategy(gl);
        }

        // Initialize state
        this.dimensions = 2;
        this.expressions = ['-y', 'x'];

        // Create velocity evaluators for sampling
        try {
            this.velocityEvaluators = createVelocityEvaluators(this.expressions);
            logger.verbose('Initial velocity evaluators created');
        } catch (error) {
            logger.warn('Failed to create initial velocity evaluators', error);
            this.velocityEvaluators = null;
        }

        this.integratorType = 'rk4';
        this.integratorParams = { iterations: 3 }; // For implicit methods
        this.integratorCostFactor = 1; // Cost factor for fair integrator comparison (set during shader compilation)
        this.solutionMethod = 'fixed-point'; // For implicit methods: 'fixed-point' or 'newton'
        this.transformType = 'identity'; // Domain transformation type
        this.transformParams = {}; // Transform parameters
        this.mapperType = 'select';
        this.mapperParams = { dim1: 0, dim2: 1 };
        this.colorMode = 'white';
        this.colorExpression = 'x * y'; // Default expression for expression mode
        this.colorGradient = getDefaultGradient(); // Default gradient
        this.useCustomGradient = false; // Apply custom gradient to preset modes
        this.velocityScaleMode = 'percentile95'; // 'max', 'average', 'percentile90', 'percentile95'
        this.velocityLogScale = false; // Use logarithmic scaling for velocity colors

        // HDR rendering settings
        this.useHDR = config.useHDR !== undefined ? config.useHDR : true;
        this.tonemapOperator = config.tonemapOperator || 'aces';
        this.exposure = config.exposure !== undefined ? config.exposure : 1.0;
        this.gamma = config.gamma !== undefined ? config.gamma : 2.2;
        this.luminanceGamma = config.luminanceGamma !== undefined ? config.luminanceGamma : 1.0;
        this.whitePoint = config.whitePoint !== undefined ? config.whitePoint : 2.0;
        this.particleIntensity = config.particleIntensity !== undefined ? config.particleIntensity : 1.0;

        // Depth testing (plasma mode)
        this.useDepthTest = config.useDepthTest !== undefined ? config.useDepthTest : false;
        this.colorSaturation = config.colorSaturation !== undefined ? config.colorSaturation : 1.0; // 0.0 = grayscale, 1.0 = full saturation
        this.brightnessDesaturation = config.brightnessDesaturation !== undefined ? config.brightnessDesaturation : 0.0; // 0.0 = no desat, 1.0 = full desat at bright areas
        this.brightnessSaturation = config.brightnessSaturation !== undefined ? config.brightnessSaturation : 0.0; // 0.0 = no effect, 1.0 = dim areas fully desaturated

        // Bloom settings (disabled by default - WIP)
        this.bloomEnabled = config.bloomEnabled !== undefined ? config.bloomEnabled : false;
        this.bloomIntensity = config.bloomIntensity !== undefined ? config.bloomIntensity : 0.3;
        this.bloomRadius = config.bloomRadius !== undefined ? config.bloomRadius : 1.0;
        this.bloomAlpha = config.bloomAlpha !== undefined ? config.bloomAlpha : 1.0;
        this.currentBloomTexture = null; // Stores bloom texture for current frame

        // SMAA settings (morphological antialiasing)
        this.smaaEnabled = config.smaaEnabled !== undefined ? config.smaaEnabled : true;
        this.smaaIntensity = config.smaaIntensity !== undefined ? config.smaaIntensity : 0.75;
        this.smaaThreshold = config.smaaThreshold !== undefined ? config.smaaThreshold : 0.1;

        // Bilateral filter settings (edge-preserving noise reduction)
        this.bilateralEnabled = config.bilateralEnabled !== undefined ? config.bilateralEnabled : false;
        this.bilateralSpatialSigma = config.bilateralSpatialSigma !== undefined ? config.bilateralSpatialSigma : 4.0;
        this.bilateralIntensitySigma = config.bilateralIntensitySigma !== undefined ? config.bilateralIntensitySigma : 0.2;

        // Supersampling (render at higher resolution, downsample to canvas)
        // Validate and clamp supersample factor
        let supersampleFactor = config.supersampleFactor !== undefined ? config.supersampleFactor : 1.0;
        if (typeof supersampleFactor !== 'number' || isNaN(supersampleFactor) || supersampleFactor <= 0) {
            logger.warn(`Invalid supersampleFactor: ${supersampleFactor}, using default 1.0`);
            supersampleFactor = 1.0;
        }
        this.supersampleFactor = Math.max(0.5, Math.min(3.0, supersampleFactor));
        logger.info(`Initial supersample factor set to: ${this.supersampleFactor}`);

        this.timestep = 0.01;
        this.fadeOpacity = 0.99;
        this.dropProbability = 0.003;
        this.dropLowVelocity = false; // Drop particles below velocity threshold

        // Exponential moving average for max velocity (for color scaling)
        this.maxVelocity = 5.0; // Initial reasonable value
        this.prevMaxVelocity = 5.0; // Previous value for change detection
        this.velocityEMAAlpha = 0.1; // Blend factor for new samples (10% new, 90% old)
        this.velocitySampleInterval = 10; // Adaptive sample interval
        this.velocitySampleIntervalMin = 5; // Sample at least every 5 frames when changing
        this.velocitySampleIntervalMax = 60; // Sample at most every 60 frames when stable
        this.framesSinceLastSample = 0; // Track frames for adaptive sampling
        this.lowVelocityThreshold = 0.02; // Drop particles below 2% of max velocity

        // Bounding box for 2D display (with aspect ratio correction)
        const aspectRatio = canvas.width / canvas.height;
        const height = 10; // -5 to 5
        const width = height * aspectRatio;
        this.bbox = {
            min: [-width / 2, -5],
            max: [width / 2, 5]
        };

        // Particle system
        this.particleSystem = new ParticleSystem(10000, this.dimensions, this.bbox, this.strategy);

        // Texture manager
        this.textureManager = new TextureManager(
            gl,
            this.dimensions,
            this.particleSystem.getResolution(),
            this.strategy
        );

        // Create framebuffer for particle position updates (not HDR, separate from screen rendering)
        this.updateFramebuffer = gl.createFramebuffer();

        // Calculate render resolution based on supersample factor
        // Ensure we always have valid dimensions (minimum 1x1)
        const canvasWidth = Math.max(1, canvas.width || 800);
        const canvasHeight = Math.max(1, canvas.height || 600);
        this.renderWidth = Math.max(1, Math.floor(canvasWidth * this.supersampleFactor));
        this.renderHeight = Math.max(1, Math.floor(canvasHeight * this.supersampleFactor));

        logger.verbose('Render dimensions calculated', {
            canvasSize: `${canvasWidth}x${canvasHeight}`,
            renderSize: `${this.renderWidth}x${this.renderHeight}`,
            supersampleFactor: this.supersampleFactor
        });

        // Create framebuffer manager for HDR rendering
        logger.info('Initializing HDR rendering system...', {
            requested: this.useHDR,
            canvasSize: `${canvas.width}x${canvas.height}`,
            renderSize: `${this.renderWidth}x${this.renderHeight}`,
            supersampleFactor: this.supersampleFactor
        });

        this.framebufferManager = new FramebufferManager(
            gl,
            this.renderWidth,
            this.renderHeight,
            {
                useHDR: this.useHDR,
                usePingPong: true
            }
        );

        // Log HDR capabilities and status
        const hdrSupport = this.framebufferManager.getHDRSupport();
        logger.info('HDR rendering system initialized', {
            hdrEnabled: hdrSupport.enabled,
            hdrSupported: hdrSupport.supported,
            textureFormat: hdrSupport.format,
            extensions: {
                floatColorBuffer: hdrSupport.hasFloatColorBuffer,
                halfFloatColorBuffer: hdrSupport.hasHalfFloatColorBuffer,
                linearFiltering: hdrSupport.hasLinearFiltering
            },
            exposure: this.exposure,
            gamma: this.gamma
        });

        if (this.useHDR && !hdrSupport.supported) {
            logger.warn('HDR rendering requested but not supported by device. Using LDR fallback.');
        }

        if (hdrSupport.enabled && !hdrSupport.hasLinearFiltering) {
            logger.warn('Linear filtering not available for HDR textures. Bloom quality will be affected.');
        }

        // Create bloom manager (uses white point as threshold)
        logger.info('Initializing bloom system...', {
            enabled: this.bloomEnabled,
            intensity: this.bloomIntensity,
            threshold: this.whitePoint
        });

        this.bloomManager = new BloomManager(
            gl,
            this.renderWidth,
            this.renderHeight,
            {
                enabled: this.bloomEnabled && hdrSupport.enabled,
                intensity: this.bloomIntensity,
                threshold: this.whitePoint,
                radius: this.bloomRadius
            }
        );

        logger.info('Bloom system initialized', {
            enabled: this.bloomManager.isEnabled(),
            bloomSize: this.bloomManager.isEnabled() ?
                `${this.bloomManager.getBloomSize().width}x${this.bloomManager.getBloomSize().height}` : 'N/A'
        });

        // Create SMAA manager
        this.smaaManager = new SMAAManager(
            gl,
            this.renderWidth,
            this.renderHeight,
            {
                enabled: this.smaaEnabled,
                intensity: this.smaaIntensity,
                threshold: this.smaaThreshold
            }
        );

        logger.info('SMAA system initialized', {
            enabled: this.smaaManager.isEnabled(),
            intensity: this.smaaIntensity,
            threshold: this.smaaThreshold
        });

        // Create bilateral filter manager
        this.bilateralManager = new BilateralFilterManager(
            gl,
            this.renderWidth,
            this.renderHeight,
            {
                enabled: this.bilateralEnabled,
                spatialSigma: this.bilateralSpatialSigma,
                intensitySigma: this.bilateralIntensitySigma
            }
        );

        logger.info('Bilateral filter initialized', {
            enabled: this.bilateralManager.isEnabled(),
            spatialSigma: this.bilateralSpatialSigma,
            intensitySigma: this.bilateralIntensitySigma
        });

        // Create dedicated LDR framebuffer for tone mapping output
        // (prevents conflicts with SMAA's edges framebuffer)
        this.ldrFramebuffer = gl.createFramebuffer();
        this.ldrTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.ldrTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.renderWidth, this.renderHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.ldrFramebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.ldrTexture, 0);

        const ldrFBStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (ldrFBStatus !== gl.FRAMEBUFFER_COMPLETE) {
            logger.error('LDR framebuffer incomplete', { status: ldrFBStatus });
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        logger.info('LDR framebuffer created for tone mapping output');

        // Create final output framebuffer for supersampled rendering
        // SMAA will render to this at high resolution, then we downsample to canvas
        this.finalFramebuffer = gl.createFramebuffer();
        this.finalTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.finalTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.renderWidth, this.renderHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.finalFramebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.finalTexture, 0);

        const finalFBStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (finalFBStatus !== gl.FRAMEBUFFER_COMPLETE) {
            logger.error('Final framebuffer incomplete', { status: finalFBStatus });
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        logger.info('Final framebuffer created for supersampling output');

        // Create buffer statistics manager
        this.bufferStatsManager = new BufferStatsManager(gl);
        this.velocityStatsManager = new VelocityStatsManager(gl);
        this.statsUpdateInterval = 60; // Update stats every 60 frames
        this.statsCoarseMode = true; // Use coarse sampling by default

        // Create full-screen quad buffer
        this.quadBuffer = this.createBuffer(new Float32Array([
            0, 0,
            1, 0,
            0, 1,
            0, 1,
            1, 0,
            1, 1
        ]));

        // Share quad buffer with postprocessing managers to avoid duplication
        this.smaaManager.setQuadBuffer(this.quadBuffer);
        this.bilateralManager.setQuadBuffer(this.quadBuffer);

        // Compile shaders
        logger.info('Compiling shaders...', { dimensions: this.dimensions, integrator: this.integratorType });
        const shaderError = this.compileShaders();
        if (shaderError) {
            logger.error('Shader compilation failed', shaderError);
            throw new Error(`Shader compilation failed: ${shaderError}`);
        }
        logger.info('Shaders compiled successfully');

        // Initialize textures with particle data
        logger.info('Initializing particle textures...', {
            resolution: this.particleSystem.getResolution(),
            particleCount: this.particleSystem.getActualParticleCount()
        });
        this.textureManager.initializeData(this.particleSystem.getAllData());

        // Create particle index buffer
        this.indexBuffer = this.createBuffer(this.particleSystem.getIndices());

        // Animation state
        this.isRunning = false;
        this.frame = 0;
        this.hdrLogged = false; // Flag to log HDR info on first frame
    }

    /**
     * Create a WebGL buffer
     */
    createBuffer(data) {
        const gl = this.gl;
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        return buffer;
    }


    /**
     * Compile all shader programs
     */
    compileShaders() {
        const gl = this.gl;

        try {
            // Parse expressions to GLSL
            const velocityGLSL = parseVectorField(this.expressions);
            logger.verbose('Generated velocity GLSL', { expressions: this.expressions, glsl: velocityGLSL });

            // Get integrator code (pass expressions and solutionMethod for Newton's method support)
            const integratorParams = {
                ...this.integratorParams,
                expressions: this.expressions,
                solutionMethod: this.solutionMethod
            };
            const integrator = getIntegrator(this.integratorType, this.dimensions, integratorParams);

            // Store integrator costFactor for timestep scaling
            this.integratorCostFactor = integrator.costFactor || 1;

            // Get mapper code
            const mapper = getMapper(this.mapperType, this.dimensions, this.mapperParams);

            // Get transform code (domain transformation)
            let transformCode = null;
            if (this.transformType !== 'identity') {
                const transform = getTransform(this.transformType);
                transformCode = {
                    helpers: transform.generateHelpers(this.dimensions),
                    forward: transform.generateForward(this.dimensions),
                    inverse: transform.generateInverse(this.dimensions),
                    jacobian: transform.generateJacobian(this.dimensions)
                };
            }

            // Get color mode code
            const colorMode = getColorMode(this.colorMode, this.dimensions);
            let colorCode = colorMode.code;
            let usesMaxVelocity = colorMode.usesMaxVelocity || false;

            // Handle expression mode specially
            if (this.colorMode === 'expression') {
                // Parse color expression to GLSL
                const expressionGLSL = parseExpression(this.colorExpression, this.dimensions);

                // Generate gradient GLSL
                const gradientGLSL = generateGradientGLSL(this.colorGradient);

                // Generate complete color function
                colorCode = generateExpressionColorMode(this.dimensions, expressionGLSL, gradientGLSL);
            }
            // Handle custom gradient for preset modes
            else if (this.useCustomGradient &&
                     (this.colorMode === 'velocity_magnitude' ||
                      this.colorMode === 'velocity_angle' ||
                      this.colorMode === 'velocity_combined')) {
                // Generate gradient GLSL
                const gradientGLSL = generateGradientGLSL(this.colorGradient);

                // Generate gradient-based version of the preset mode
                colorCode = generateGradientColorMode(this.colorMode, this.dimensions, gradientGLSL);

                // These modes still use max velocity
                usesMaxVelocity = this.colorMode === 'velocity_magnitude' || this.colorMode === 'velocity_combined';
            }

            // Create update program
            const updateVertexShader = generateUpdateVertexShader();
            const updateFragmentShader = generateUpdateFragmentShader(
                this.dimensions,
                velocityGLSL,
                integrator.code,
                this.strategy,
                transformCode
            );

            this.updateProgram = createProgram(gl, updateVertexShader, updateFragmentShader);

            // Note: Age is now stored in alpha channel of u_pos_0, no separate age shader needed

            // Create draw program
            const drawVertexShader = generateDrawVertexShader(this.dimensions, mapper.code, velocityGLSL, this.strategy);
            const drawFragmentShader = generateDrawFragmentShader(this.dimensions, colorCode, usesMaxVelocity);

            this.drawProgram = createProgram(gl, drawVertexShader, drawFragmentShader);

            // Track whether we need to compute max velocity
            this.usesMaxVelocity = usesMaxVelocity;

            // Store shader source for debugging
            this.shaderSource = {
                updateVertex: updateVertexShader,
                updateFragment: updateFragmentShader,
                drawVertex: drawVertexShader,
                drawFragment: drawFragmentShader,
                velocityField: velocityGLSL  // Store for velocity stats manager
            };

            // Initialize velocity stats manager with current velocity field
            if (this.velocityStatsManager) {
                this.velocityStatsManager.dispose(); // Clean up old instance
                const initSuccess = this.velocityStatsManager.initialize(this.dimensions, velocityGLSL);
                if (initSuccess) {
                    logger.verbose('Velocity stats manager initialized');
                } else {
                    logger.warn('Failed to initialize velocity stats manager');
                }
            }

            // Create screen programs
            const screenVertexShader = generateScreenVertexShader();
            const fadeFragmentShader = generateScreenFadeFragmentShader();

            // Generate tone mapping shader with selected operator
            const tonemapCode = generateTonemapGLSL(this.tonemapOperator, {
                exposure: this.exposure,
                gamma: this.gamma,
                luminanceGamma: this.luminanceGamma,
                whitePoint: this.whitePoint
            });
            const tonemapFragmentShader = generateTonemapFragmentShader(tonemapCode);

            this.screenFadeProgram = createProgram(gl, screenVertexShader, fadeFragmentShader);
            this.tonemapProgram = createProgram(gl, screenVertexShader, tonemapFragmentShader);

            // Compile bloom shaders if bloom is enabled
            if (this.bloomManager.isEnabled()) {
                const bloomBrightPassShader = generateBloomBrightPassShader();
                const bloomBlurHorizontalShader = generateBloomBlurShader(true, this.bloomRadius);
                const bloomBlurVerticalShader = generateBloomBlurShader(false, this.bloomRadius);
                const bloomCombineShader = generateBloomCombineShader();

                this.bloomBrightPassProgram = createProgram(gl, screenVertexShader, bloomBrightPassShader);
                this.bloomBlurHProgram = createProgram(gl, screenVertexShader, bloomBlurHorizontalShader);
                this.bloomBlurVProgram = createProgram(gl, screenVertexShader, bloomBlurVerticalShader);
                this.bloomCombineProgram = createProgram(gl, screenVertexShader, bloomCombineShader);

                logger.verbose('Bloom shaders compiled', {
                    threshold: this.whitePoint,
                    intensity: this.bloomIntensity,
                    radius: this.bloomRadius
                });
            }

            // Store shader source for debugging
            this.shaderSource.screenFade = fadeFragmentShader;
            this.shaderSource.tonemap = tonemapFragmentShader;

            logger.verbose('Tone mapping operator compiled', {
                operator: this.tonemapOperator,
                exposure: this.exposure,
                gamma: this.gamma,
                whitePoint: this.whitePoint
            });

            return null; // No error
        } catch (error) {
            return error.message;
        }
    }

    /**
     * Update particle positions
     */
    updatePositions() {
        const gl = this.gl;
        const program = this.updateProgram;

        // Sample actual particle data every 60 frames for detailed inspection
        if (this.frame % 60 === 0) {
            this.sampleParticleData();
        }

        // Debug: log shader uniforms occasionally
        if (this.frame % 600 === 0) {
            logger.verbose(`Frame ${this.frame}: Shader uniforms`, {
                u_min: [this.bbox.min[0], this.bbox.min[1]],
                u_max: [this.bbox.max[0], this.bbox.max[1]],
                u_h: this.timestep * (this.integratorCostFactor || 1),
                timestep_base: this.timestep,
                costFactor: this.integratorCostFactor || 1,
                u_drop_rate: this.dropProbability
            });
        }

        gl.useProgram(program);

        // Bind quad for full-screen pass
        const aPosLoc = gl.getAttribLocation(program, 'a_pos');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.enableVertexAttribArray(aPosLoc);
        gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

        // Bind position textures
        this.textureManager.bindReadTextures(program);

        // Set uniforms
        const resolution = this.particleSystem.getResolution();
        const randSeed = Math.random(); // Generate once per frame for consistency
        gl.uniform2f(gl.getUniformLocation(program, 'u_min'), this.bbox.min[0], this.bbox.min[1]);
        gl.uniform2f(gl.getUniformLocation(program, 'u_max'), this.bbox.max[0], this.bbox.max[1]);
        // Scale timestep by integrator cost factor for fair comparison
        gl.uniform1f(gl.getUniformLocation(program, 'u_h'), this.timestep * (this.integratorCostFactor || 1));
        gl.uniform1f(gl.getUniformLocation(program, 'u_rand_seed'), randSeed);
        gl.uniform1f(gl.getUniformLocation(program, 'u_drop_rate'), this.dropProbability);
        gl.uniform1f(gl.getUniformLocation(program, 'u_particles_res'), resolution);
        const velocityScale = this.getVelocityScale();
        gl.uniform1f(gl.getUniformLocation(program, 'u_max_velocity'), velocityScale);
        gl.uniform1f(gl.getUniformLocation(program, 'u_drop_low_velocity'), this.dropLowVelocity ? 1.0 : 0.0);
        gl.uniform1f(gl.getUniformLocation(program, 'u_velocity_threshold'), this.lowVelocityThreshold);

        // Set transform parameters (if transform is active)
        if (this.transformType !== 'identity') {
            const params = this.transformParams || {};
            // Map transform-specific parameters to vec4
            // power: alpha, 0, 0, 0
            // tanh: beta, 0, 0, 0
            // sigmoid: k, 0, 0, 0
            // exp: alpha, 0, 0, 0
            // sine: amplitude, frequency, 0, 0
            // radial_power: alpha, 0, 0, 0
            const paramValues = [
                params.alpha || params.beta || params.k || params.amplitude || 0.5,  // First param
                params.frequency || 0.0,  // Second param (sine wave)
                0.0,  // Reserved
                0.0   // Reserved
            ];
            gl.uniform4f(gl.getUniformLocation(program, 'u_transform_params'),
                paramValues[0], paramValues[1], paramValues[2], paramValues[3]);
        }

        // Render to each dimension texture
        for (let dim = 0; dim < this.dimensions; dim++) {
            gl.uniform1i(gl.getUniformLocation(program, 'u_out_coordinate'), dim);

            const writeTexture = this.textureManager.getWriteTexture(dim);

            gl.bindFramebuffer(gl.FRAMEBUFFER, this.updateFramebuffer);
            gl.framebufferTexture2D(
                gl.FRAMEBUFFER,
                gl.COLOR_ATTACHMENT0,
                gl.TEXTURE_2D,
                writeTexture,
                0
            );

            gl.viewport(0, 0, resolution, resolution);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }

        // Age is now stored in alpha channel of u_pos_0, no separate update needed

        // Swap textures
        this.textureManager.swap();

        this.frame++;
    }

    /**
     * Draw particles to screen
     */
    drawParticles() {
        const gl = this.gl;
        const program = this.drawProgram;

        gl.useProgram(program);

        // Use additive blending for HDR accumulation (allows values > 1.0)
        // Formula: src * src_alpha + dst * 1.0
        // This allows overlapping particles to create bright HDR values
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

        // Update max velocity tracker using GPU-based sampling and exponential moving average
        this.framesSinceLastSample++;

        // Adaptive sampling: sample more frequently when velocity is changing
        if (this.framesSinceLastSample >= this.velocitySampleInterval) {
            this.framesSinceLastSample = 0;

            // GPU-based velocity sampling (much faster than CPU approach)
            if (this.velocityStatsManager && this.velocityStatsManager.initialized) {
                const posTextures = this.textureManager.getReadTextures();
                const stats = this.velocityStatsManager.compute(posTextures, this.bbox, this.particleSystem.getResolution());

                // Log occasionally for debugging
                if (this.frame % 600 === 0 && stats.sampleCount > 0) {
                    logger.debug(`GPU velocity stats: avg=${stats.avgVelocity.toFixed(3)}, max=${stats.maxVelocity.toFixed(3)} (${stats.sampleCount} samples)`);
                }

                // Update max velocity with exponential moving average
                if (stats.maxVelocity > 0) {
                    // Use asymmetric blending: faster response to increases, slower to decreases
                    const alpha = stats.maxVelocity > this.maxVelocity ?
                                 this.velocityEMAAlpha * 2 : // Faster tracking upward
                                 this.velocityEMAAlpha;      // Slower decay downward

                    this.prevMaxVelocity = this.maxVelocity;
                    this.maxVelocity = alpha * stats.maxVelocity + (1 - alpha) * this.maxVelocity;
                }
            } else {
                // Manager not initialized - log warning once
                if (!this.velocityStatsWarningLogged) {
                    logger.warn('Velocity stats manager not initialized - max velocity will not be computed');
                    this.velocityStatsWarningLogged = true;
                }
            }

            // Calculate relative change rate (normalized by current value)
            const relativeChange = Math.abs(this.maxVelocity - this.prevMaxVelocity) /
                                  Math.max(this.maxVelocity, 0.1);

            // Adapt sample interval based on rate of change
            // High change rate (>5%) → sample frequently (min interval)
            // Low change rate (<1%) → sample infrequently (max interval)
            // Linear interpolation between min and max based on change rate
            const changeThresholdHigh = 0.05; // 5% change
            const changeThresholdLow = 0.01;  // 1% change

            if (relativeChange > changeThresholdHigh) {
                // Rapidly changing: sample frequently
                this.velocitySampleInterval = this.velocitySampleIntervalMin;
            } else if (relativeChange < changeThresholdLow) {
                // Stable: sample infrequently
                this.velocitySampleInterval = this.velocitySampleIntervalMax;
            } else {
                // Moderate change: interpolate
                const t = (relativeChange - changeThresholdLow) /
                         (changeThresholdHigh - changeThresholdLow);
                this.velocitySampleInterval = Math.round(
                    this.velocitySampleIntervalMax * (1 - t) +
                    this.velocitySampleIntervalMin * t
                );
            }
        }

        // Prevent from dropping too low
        this.maxVelocity = Math.max(this.maxVelocity, 0.5);

        // Bind particle indices
        const aIndexLoc = gl.getAttribLocation(program, 'a_index');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.indexBuffer);
        gl.enableVertexAttribArray(aIndexLoc);
        gl.vertexAttribPointer(aIndexLoc, 1, gl.FLOAT, false, 0, 0);

        // Bind position textures (age is in alpha channel of u_pos_0)
        this.textureManager.bindReadTextures(program);

        // Set uniforms
        gl.uniform1f(gl.getUniformLocation(program, 'u_particles_res'), this.particleSystem.getResolution());
        gl.uniform2f(gl.getUniformLocation(program, 'u_min'), this.bbox.min[0], this.bbox.min[1]);
        gl.uniform2f(gl.getUniformLocation(program, 'u_max'), this.bbox.max[0], this.bbox.max[1]);
        gl.uniform1f(gl.getUniformLocation(program, 'u_particle_intensity'), this.particleIntensity);
        gl.uniform1f(gl.getUniformLocation(program, 'u_color_saturation'), this.colorSaturation);

        // Set max velocity uniform if needed
        if (this.usesMaxVelocity) {
            const velocityScale = this.getVelocityScale();
            gl.uniform1f(gl.getUniformLocation(program, 'u_max_velocity'), velocityScale);
            gl.uniform1f(gl.getUniformLocation(program, 'u_velocity_log_scale'), this.velocityLogScale ? 1.0 : 0.0);
        }

        // Draw particles
        gl.drawArrays(gl.POINTS, 0, this.particleSystem.getActualParticleCount());
    }

    /**
     * Get velocity scale value based on selected mode
     */
    getVelocityScale() {
        if (!this.velocityStatsManager || !this.velocityStatsManager.initialized) {
            return this.maxVelocity;
        }

        const stats = this.velocityStatsManager.getCached();

        switch (this.velocityScaleMode) {
            case 'max':
                return stats.maxVelocity || this.maxVelocity;
            case 'average':
                return stats.avgVelocity || this.maxVelocity;
            case 'percentile90':
                return stats.percentile90 || stats.avgVelocity || this.maxVelocity;
            case 'percentile95':
                return stats.percentile95 || stats.avgVelocity || this.maxVelocity;
            default:
                return this.maxVelocity;
        }
    }

    /**
     * Fade previous frame
     */
    fadeScreen() {
        const gl = this.gl;

        const currentTex = this.framebufferManager.getCurrentTexture();

        // Swap to next buffer
        this.framebufferManager.swap();

        // Bind next buffer for rendering
        this.framebufferManager.bind();

        // CRITICAL: Set viewport to render size for HDR framebuffer rendering
        // Use supersample resolution for higher quality
        gl.viewport(0, 0, this.renderWidth, this.renderHeight);

        // Disable blending for fade pass (we're doing a direct texture copy with multiplication)
        gl.disable(gl.BLEND);

        gl.useProgram(this.screenFadeProgram);

        const aPosLoc = gl.getAttribLocation(this.screenFadeProgram, 'a_pos');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.enableVertexAttribArray(aPosLoc);
        gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, currentTex);
        gl.uniform1i(gl.getUniformLocation(this.screenFadeProgram, 'u_screen'), 0);
        gl.uniform1f(gl.getUniformLocation(this.screenFadeProgram, 'u_fade'), this.fadeOpacity);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Re-enable blending for particle drawing
        gl.enable(gl.BLEND);
    }

    /**
     * Apply bloom effect
     * Extracts bright regions, blurs them, and combines with base image
     */
    applyBloom() {
        if (!this.bloomManager.isEnabled()) return;

        const gl = this.gl;
        const bloomSize = this.bloomManager.getBloomSize();

        // Step 1: Extract bright pass (pixels above white point threshold)
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomManager.getBrightFBO());
        gl.viewport(0, 0, bloomSize.width, bloomSize.height);
        gl.disable(gl.BLEND);

        gl.useProgram(this.bloomBrightPassProgram);
        const aPosLoc1 = gl.getAttribLocation(this.bloomBrightPassProgram, 'a_pos');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.enableVertexAttribArray(aPosLoc1);
        gl.vertexAttribPointer(aPosLoc1, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.framebufferManager.getCurrentTexture());
        gl.uniform1i(gl.getUniformLocation(this.bloomBrightPassProgram, 'u_screen'), 0);
        gl.uniform1f(gl.getUniformLocation(this.bloomBrightPassProgram, 'u_threshold'), this.whitePoint);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Step 2: Blur horizontally
        const blurFBOs = this.bloomManager.getBlurFBOs();
        const blurTextures = this.bloomManager.getBlurTextures();

        gl.bindFramebuffer(gl.FRAMEBUFFER, blurFBOs[0]);
        gl.useProgram(this.bloomBlurHProgram);

        const aPosLoc2 = gl.getAttribLocation(this.bloomBlurHProgram, 'a_pos');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.enableVertexAttribArray(aPosLoc2);
        gl.vertexAttribPointer(aPosLoc2, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.bloomManager.getBrightTexture());
        gl.uniform1i(gl.getUniformLocation(this.bloomBlurHProgram, 'u_texture'), 0);
        gl.uniform2f(gl.getUniformLocation(this.bloomBlurHProgram, 'u_texel_size'),
                    1.0 / bloomSize.width, 1.0 / bloomSize.height);
        gl.uniform1f(gl.getUniformLocation(this.bloomBlurHProgram, 'u_radius'), this.bloomRadius);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Step 3: Blur vertically
        gl.bindFramebuffer(gl.FRAMEBUFFER, blurFBOs[1]);
        gl.useProgram(this.bloomBlurVProgram);

        const aPosLoc3 = gl.getAttribLocation(this.bloomBlurVProgram, 'a_pos');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.enableVertexAttribArray(aPosLoc3);
        gl.vertexAttribPointer(aPosLoc3, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, blurTextures[0]);
        gl.uniform1i(gl.getUniformLocation(this.bloomBlurVProgram, 'u_texture'), 0);
        gl.uniform2f(gl.getUniformLocation(this.bloomBlurVProgram, 'u_texel_size'),
                    1.0 / bloomSize.width, 1.0 / bloomSize.height);
        gl.uniform1f(gl.getUniformLocation(this.bloomBlurVProgram, 'u_radius'), this.bloomRadius);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // DON'T combine bloom back to HDR buffer - that causes accumulation
        // Instead, we'll pass the bloom texture to the tone mapping shader
        // Store bloom texture for later use in tone mapping
        this.currentBloomTexture = blurTextures[1];
    }

    /**
     * Downsample supersampled image to canvas
     * Simple copy with linear filtering for smooth result
     */
    downsampleToCanvas() {
        const gl = this.gl;

        // Bind canvas
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);

        // Use a simple copy shader (reuse tone map program's vertex shader)
        gl.useProgram(this.tonemapProgram);

        const aPosLoc = gl.getAttribLocation(this.tonemapProgram, 'a_pos');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.enableVertexAttribArray(aPosLoc);
        gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

        // Bind final texture (supersampled SMAA output)
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.finalTexture);
        gl.uniform1i(gl.getUniformLocation(this.tonemapProgram, 'u_screen'), 0);

        // Disable bloom for downsample (already applied)
        gl.uniform1i(gl.getUniformLocation(this.tonemapProgram, 'u_bloom_enabled'), 0);

        // Set uniforms to passthrough (exposure=1, gamma=1)
        // Actually, tone mapping is already done, so we just need to copy
        // But tonemapProgram applies tone mapping, so we need a simpler shader
        // Let's reuse the screen copy shader instead
        gl.useProgram(this.screenFadeProgram);

        const aPosLoc2 = gl.getAttribLocation(this.screenFadeProgram, 'a_pos');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.enableVertexAttribArray(aPosLoc2);
        gl.vertexAttribPointer(aPosLoc2, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.finalTexture);
        gl.uniform1i(gl.getUniformLocation(this.screenFadeProgram, 'u_screen'), 0);
        gl.uniform1f(gl.getUniformLocation(this.screenFadeProgram, 'u_fade'), 1.0); // No fade, just copy

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    /**
     * Render one frame
     */
    render() {
        const gl = this.gl;

        // Log HDR status on first frame
        if (!this.hdrLogged) {
            const hdrSupport = this.framebufferManager.getHDRSupport();
            logger.info('First frame render', {
                renderingMode: hdrSupport.enabled ? 'HDR' : 'LDR',
                textureFormat: hdrSupport.format,
                exposure: this.exposure,
                gamma: this.gamma
            });
            this.hdrLogged = true;
        }

        // Update positions
        this.updatePositions();

        // Fade previous frame
        this.fadeScreen();

        // Draw particles to current framebuffer
        this.framebufferManager.bind();

        // Enable depth testing if configured (plasma mode)
        if (this.useDepthTest) {
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LESS);  // Closer particles occlude farther ones

            // Clear depth buffer (color is not cleared - we want trails from fade)
            gl.clear(gl.DEPTH_BUFFER_BIT);
        }

        this.drawParticles();

        // Disable depth test after particle drawing (if it was enabled)
        if (this.useDepthTest) {
            gl.disable(gl.DEPTH_TEST);
        }

        // Apply bloom effect (extract bright regions, blur, combine)
        this.applyBloom();

        // Render tone mapping to dedicated LDR framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.ldrFramebuffer);
        gl.viewport(0, 0, this.renderWidth, this.renderHeight);

        // Disable blending for tone mapping pass
        gl.disable(gl.BLEND);

        // Use tone mapping shader
        gl.useProgram(this.tonemapProgram);

        const aPosLoc = gl.getAttribLocation(this.tonemapProgram, 'a_pos');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.enableVertexAttribArray(aPosLoc);
        gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

        // Base HDR texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.framebufferManager.getCurrentTexture());
        gl.uniform1i(gl.getUniformLocation(this.tonemapProgram, 'u_screen'), 0);

        // Bloom texture (if enabled)
        if (this.bloomManager.isEnabled() && this.currentBloomTexture) {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this.currentBloomTexture);
            gl.uniform1i(gl.getUniformLocation(this.tonemapProgram, 'u_bloom'), 1);
            gl.uniform1i(gl.getUniformLocation(this.tonemapProgram, 'u_bloom_enabled'), 1);
            gl.uniform1f(gl.getUniformLocation(this.tonemapProgram, 'u_bloom_intensity'), this.bloomIntensity);
            gl.uniform1f(gl.getUniformLocation(this.tonemapProgram, 'u_bloom_alpha'), this.bloomAlpha);
        } else {
            gl.uniform1i(gl.getUniformLocation(this.tonemapProgram, 'u_bloom_enabled'), 0);
        }

        // Get cached buffer stats
        const stats = this.bufferStatsManager.getCached();

        gl.uniform1f(gl.getUniformLocation(this.tonemapProgram, 'u_exposure'), this.exposure);
        gl.uniform1f(gl.getUniformLocation(this.tonemapProgram, 'u_gamma'), this.gamma);
        gl.uniform1f(gl.getUniformLocation(this.tonemapProgram, 'u_whitePoint'), this.whitePoint);
        gl.uniform1f(gl.getUniformLocation(this.tonemapProgram, 'u_brightness_desat'), this.brightnessDesaturation);
        gl.uniform1f(gl.getUniformLocation(this.tonemapProgram, 'u_brightness_sat'), this.brightnessSaturation);
        gl.uniform1f(gl.getUniformLocation(this.tonemapProgram, 'u_hdr_max_brightness'), stats.maxBrightness);
        gl.uniform1f(gl.getUniformLocation(this.tonemapProgram, 'u_hdr_avg_brightness'), stats.avgBrightness);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Apply bilateral filter for edge-preserving noise reduction
        // Reads from LDR tone-mapped texture, writes to bilateral framebuffer
        const filteredTexture = this.bilateralManager.apply(this.ldrTexture);

        // Apply SMAA to filtered LDR image (3-pass morphological AA)
        // SMAA reads from filtered texture and outputs to final framebuffer
        this.smaaManager.applyToFramebuffer(filteredTexture, this.finalFramebuffer, this.quadBuffer);

        // Downsample to canvas (with linear filtering for smooth result)
        this.downsampleToCanvas();

        // Update buffer statistics periodically
        if (!this.frame) this.frame = 0;
        this.frame++;

        if (this.frame % this.statsUpdateInterval === 0) {
            const hdrTexture = this.framebufferManager.getCurrentTexture();
            const newStats = this.bufferStatsManager.compute(
                hdrTexture,
                this.canvas.width,
                this.canvas.height,
                this.statsCoarseMode
            );

            // Log stats occasionally for debugging
            if (this.frame % (this.statsUpdateInterval * 10) === 0) {
                logger.info('HDR Buffer Stats (sampled)', {
                    avgBrightness: newStats.avgBrightness.toFixed(2),
                    maxBrightness: newStats.maxBrightness.toFixed(2),
                    sampledPixels: newStats.sampledPixels,
                    sampleRate: newStats.sampleRate
                });
            }
        }
    }

    /**
     * Get current HDR buffer statistics (using cached values from BufferStatsManager)
     */
    getBufferStats() {
        const stats = this.bufferStatsManager.getCached();
        // Add velocity info from GPU-based velocity stats
        const velStats = this.velocityStatsManager ? this.velocityStatsManager.getCached() : null;
        stats.maxVelocity = this.maxVelocity; // EMA-smoothed max velocity
        stats.avgVelocity = velStats ? velStats.avgVelocity : 0;
        stats.velocitySampleCount = velStats ? velStats.sampleCount : 0; // 64 GPU samples
        return stats;
    }

    /**
     * Log HDR buffer statistics to console
     */
    logBufferStats() {
        const stats = this.getBufferStats(); // Use getBufferStats to include velocity
        const age = Date.now() - stats.timestamp;

        logger.info('=== HDR Buffer Statistics (Sampled) ===');
        logger.info(`Cached age: ${(age / 1000).toFixed(1)}s`);
        logger.info(`Sample rate: every ${stats.sampleRate}th pixel (${stats.sampledPixels} total)`);
        logger.info(`Red   - Min: ${stats.red.min.toFixed(6)}, Max: ${stats.red.max.toFixed(6)}, Avg: ${stats.red.avg.toFixed(6)}`);
        logger.info(`Green - Min: ${stats.green.min.toFixed(6)}, Max: ${stats.green.max.toFixed(6)}, Avg: ${stats.green.avg.toFixed(6)}`);
        logger.info(`Blue  - Min: ${stats.blue.min.toFixed(6)}, Max: ${stats.blue.max.toFixed(6)}, Avg: ${stats.blue.avg.toFixed(6)}`);
        logger.info(`Max Brightness: ${stats.maxBrightness.toFixed(6)}`);
        logger.info(`Avg Brightness: ${stats.avgBrightness.toFixed(6)}`);
        logger.info(`Max Velocity: ${stats.maxVelocity.toFixed(6)} (GPU-sampled, ${stats.velocitySampleCount} particles, EMA-smoothed)`);
        if (stats.avgVelocity) {
            logger.info(`Avg Velocity: ${stats.avgVelocity.toFixed(6)}`);
        }
    }

    /**
     * DEPRECATED: Old particle statistics (removed - use BufferStatsManager instead)
     */
    calculateParticleStatistics_REMOVED() {
        const resolution = this.particleSystem.getResolution();

        // Read back texture data for each dimension
        const dimensionData = [];
        for (let dim = 0; dim < this.dimensions; dim++) {
            dimensionData.push(this.textureManager.readTexture(dim));
        }

        const posStats = [];
        const velStats = [];

        // Decode all particle positions
        const componentsPerValue = this.strategy.getComponentsPerValue();
        const ArrayType = this.strategy.getArrayType();
        const positions = [];

        for (let i = 0; i < this.particleSystem.getActualParticleCount(); i++) {
            const pos = [];
            for (let dim = 0; dim < this.dimensions; dim++) {
                const data = dimensionData[dim];
                const texelIdx = i * componentsPerValue;

                // Extract buffer for this value
                const buffer = new ArrayType(componentsPerValue);
                for (let c = 0; c < componentsPerValue; c++) {
                    buffer[c] = data[texelIdx + c];
                }

                // Determine min/max for this dimension
                const min = dim === 0 ? this.bbox.min[0] : (dim === 1 ? this.bbox.min[1] : -10.0);
                const max = dim === 0 ? this.bbox.max[0] : (dim === 1 ? this.bbox.max[1] : 10.0);

                // Decode using strategy
                const worldValue = this.strategy.decodeValue(buffer, min, max);

                pos.push(worldValue);
            }
            positions.push(pos);
        }

        // Calculate position statistics
        for (let dim = 0; dim < this.dimensions; dim++) {
            let min = Infinity;
            let max = -Infinity;
            let sum = 0;

            for (const pos of positions) {
                min = Math.min(min, pos[dim]);
                max = Math.max(max, pos[dim]);
                sum += pos[dim];
            }

            const dimName = ['x', 'y', 'z', 'w'][dim] || `dim${dim}`;
            posStats.push({
                dim: dimName,
                min: min.toFixed(3),
                max: max.toFixed(3),
                avg: (sum / positions.length).toFixed(3)
            });
        }

        // Calculate velocity statistics
        if (this.velocityEvaluators) {
            for (let dim = 0; dim < this.dimensions; dim++) {
                let min = Infinity;
                let max = -Infinity;
                let sum = 0;

                try {
                    for (const pos of positions) {
                        const velocity = this.velocityEvaluators[dim](...pos);
                        min = Math.min(min, velocity);
                        max = Math.max(max, velocity);
                        sum += velocity;
                    }

                    const dimName = ['x', 'y', 'z', 'w'][dim] || `dim${dim}`;
                    velStats.push({
                        dim: `v${dimName}`,
                        min: min.toFixed(3),
                        max: max.toFixed(3),
                        avg: (sum / positions.length).toFixed(3)
                    });
                } catch (error) {
                    logger.warn(`Error computing velocity for dim ${dim}`, error);
                }
            }
        }

        logger.verbose(`Frame ${this.frame}: Particle statistics`, {
            bounds: `[${this.bbox.min[0].toFixed(3)}, ${this.bbox.min[1].toFixed(3)}] to [${this.bbox.max[0].toFixed(3)}, ${this.bbox.max[1].toFixed(3)}]`,
            position: posStats,
            velocity: velStats.length > 0 ? velStats : 'N/A'
        });
    }

    /**
     * Sample a single particle's velocity magnitude
     */
    sampleParticleVelocity() {
        const gl = this.gl;

        // Read back texture data for each dimension
        const dimensionData = [];
        for (let dim = 0; dim < this.dimensions; dim++) {
            dimensionData.push(this.textureManager.readTexture(dim));
        }

        const componentsPerValue = this.strategy.getComponentsPerValue();
        const ArrayType = this.strategy.getArrayType();

        // Sample a random particle
        const particleIdx = Math.floor(Math.random() * this.particleSystem.getActualParticleCount());
        const texelIdx = particleIdx * componentsPerValue;

        // Get position for all dimensions
        const position = [];
        for (let dim = 0; dim < this.dimensions; dim++) {
            const data = dimensionData[dim];
            const buffer = new ArrayType(componentsPerValue);
            for (let c = 0; c < componentsPerValue; c++) {
                buffer[c] = data[texelIdx + c];
            }

            const min = dim === 0 ? this.bbox.min[0] : (dim === 1 ? this.bbox.min[1] : -10.0);
            const max = dim === 0 ? this.bbox.max[0] : (dim === 1 ? this.bbox.max[1] : 10.0);
            const worldValue = this.strategy.decodeValue(buffer, min, max);
            position.push(worldValue);
        }

        // Compute velocity using the velocity evaluators
        if (!this.velocityEvaluators || this.velocityEvaluators.length === 0) {
            return 0;
        }

        try {
            const velocity = [];
            for (let dim = 0; dim < this.dimensions; dim++) {
                const vel = this.velocityEvaluators[dim](...position);
                velocity.push(vel);
            }

            // Compute magnitude
            const magnitudeSquared = velocity.reduce((sum, v) => sum + v * v, 0);
            const magnitude = Math.sqrt(magnitudeSquared);

            // Check for invalid values
            if (!isFinite(magnitude)) {
                if (!this.velocityNaNWarningLogged) {
                    logger.warn('Invalid velocity magnitude detected', {
                        position,
                        velocity,
                        magnitude
                    });
                    this.velocityNaNWarningLogged = true;
                }
                return 0;
            }

            return magnitude;
        } catch (error) {
            if (!this.velocityErrorLogged) {
                logger.error('Error computing velocity', error);
                this.velocityErrorLogged = true;
            }
            return 0;
        }
    }

    /**
     * Sample particle data for debugging
     */
    sampleParticleData() {
        const sampleCount = 5;
        const resolution = this.particleSystem.getResolution();
        const samples = [];

        // Read back texture data for each dimension
        const dimensionData = [];
        for (let dim = 0; dim < this.dimensions; dim++) {
            dimensionData.push(this.textureManager.readTexture(dim));
        }

        // Age is now stored in alpha channel of dimension 0 texture
        // We'll read it directly from dimensionData[0]

        const componentsPerValue = this.strategy.getComponentsPerValue();
        const ArrayType = this.strategy.getArrayType();

        // Decode a few random particles
        for (let i = 0; i < sampleCount; i++) {
            const particleIdx = Math.floor(Math.random() * this.particleSystem.getActualParticleCount());
            const texelIdx = particleIdx * componentsPerValue;

            const position = [];
            for (let dim = 0; dim < this.dimensions; dim++) {
                const data = dimensionData[dim];

                // Extract buffer for this value
                const buffer = new ArrayType(componentsPerValue);
                for (let c = 0; c < componentsPerValue; c++) {
                    buffer[c] = data[texelIdx + c];
                }

                // Determine min/max for this dimension
                const min = dim === 0 ? this.bbox.min[0] : (dim === 1 ? this.bbox.min[1] : -10.0);
                const max = dim === 0 ? this.bbox.max[0] : (dim === 1 ? this.bbox.max[1] : 10.0);

                // Decode using strategy
                const worldValue = this.strategy.decodeValue(buffer, min, max);

                position.push(worldValue.toFixed(3));
            }

            // Decode age value from alpha channel of dimension 0
            // For RGBA textures, alpha is the 4th component (index 3)
            const dim0Data = dimensionData[0];
            const ageValue = componentsPerValue === 4 ? dim0Data[texelIdx + 3] : 1.0;

            samples.push({
                particle: particleIdx,
                position: position.join(', '),
                age: ageValue.toFixed(2)
            });
        }

        logger.verbose(`Frame ${this.frame}: Sampled ${sampleCount} particles (with age)`, {
            bounds: `[${this.bbox.min[0].toFixed(3)}, ${this.bbox.min[1].toFixed(3)}] to [${this.bbox.max[0].toFixed(3)}, ${this.bbox.max[1].toFixed(3)}]`,
            samples: samples
        });
    }

    /**
     * Decode float from RGBA (matches shader decode)
     * Returns normalized value in [0, 1] range
     */
    decodeFloatRGBA(r, g, b, a) {
        // Fixed-point decoding to [0, 1]
        const FIXED_POINT_SCALE = 4294967295.0; // 2^32 - 1

        // Reconstruct 32-bit integer from bytes (big-endian)
        const intValue = (r << 24) | (g << 16) | (b << 8) | a;
        const uintValue = intValue >>> 0; // convert to unsigned

        // Map from [0, 2^32-1] back to [0, 1]
        return uintValue / FIXED_POINT_SCALE;
    }

    /**
     * Start animation loop
     */
    start() {
        this.isRunning = true;
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();
        this.fps = 0;

        const loop = () => {
            if (!this.isRunning) return;

            // Update FPS counter
            this.frameCount++;
            const now = performance.now();
            const elapsed = now - this.lastFpsUpdate;

            if (elapsed >= 500) { // Update FPS every 500ms
                this.fps = Math.round((this.frameCount * 1000) / elapsed);
                this.frameCount = 0;
                this.lastFpsUpdate = now;
            }

            this.render();
            requestAnimationFrame(loop);
        };
        loop();
    }

    /**
     * Stop animation
     */
    stop() {
        this.isRunning = false;
    }

    /**
     * Clear the screen (remove all particle trails and reinitialize particles)
     */
    clearScreen() {
        // Clear all framebuffers to black
        this.framebufferManager.clearAll(0, 0, 0, 1);

        // Reinitialize all particles to random positions
        this.particleSystem.initializeParticles();
        this.textureManager.initializeData(this.particleSystem.getAllData());

        logger.verbose('Screen cleared and particles reinitialized');
    }

    /**
     * Resize canvas
     */
    resize(width, height) {
        const gl = this.gl;

        // Validate dimensions
        if (!width || !height || width <= 0 || height <= 0) {
            logger.warn(`Invalid resize dimensions: ${width}x${height}, skipping resize`);
            return;
        }

        this.canvas.width = width;
        this.canvas.height = height;

        // Recalculate render resolution
        // Ensure we always have valid dimensions (minimum 1x1)
        this.renderWidth = Math.max(1, Math.floor(width * this.supersampleFactor));
        this.renderHeight = Math.max(1, Math.floor(height * this.supersampleFactor));

        logger.info('Resizing renderer', {
            canvasSize: `${width}x${height}`,
            renderSize: `${this.renderWidth}x${this.renderHeight}`,
            supersampleFactor: this.supersampleFactor
        });

        this.framebufferManager.resize(this.renderWidth, this.renderHeight);
        this.bloomManager.resize(this.renderWidth, this.renderHeight);
        this.bilateralManager.resize(this.renderWidth, this.renderHeight);
        this.smaaManager.resize(this.renderWidth, this.renderHeight);

        // Resize LDR framebuffer
        gl.bindTexture(gl.TEXTURE_2D, this.ldrTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.renderWidth, this.renderHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindTexture(gl.TEXTURE_2D, null);

        // Resize final framebuffer
        gl.bindTexture(gl.TEXTURE_2D, this.finalTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.renderWidth, this.renderHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindTexture(gl.TEXTURE_2D, null);

        this.gl.viewport(0, 0, width, height);
        this.clearScreen(); // Clear on resize
    }

    /**
     * Update configuration
     */
    updateConfig(config) {
        logger.info('Updating configuration', config);
        let needsRecompile = false;

        if (config.dimensions !== undefined && config.dimensions !== this.dimensions) {
            logger.info(`Changing dimensions: ${this.dimensions} → ${config.dimensions}`);
            this.dimensions = config.dimensions;
            needsRecompile = true;

            // Update particle system
            this.particleSystem.setDimensions(this.dimensions);
            this.textureManager.dispose();
            this.textureManager = new TextureManager(
                this.gl,
                this.dimensions,
                this.particleSystem.getResolution(),
                this.strategy
            );
            this.textureManager.initializeData(this.particleSystem.getAllData());
        }

        if (config.expressions !== undefined) {
            logger.info('Updating vector field expressions', config.expressions);
            this.expressions = config.expressions;
            // Create velocity evaluators for computing statistics in JavaScript
            try {
                this.velocityEvaluators = createVelocityEvaluators(config.expressions);
                logger.verbose('Velocity evaluators created successfully');
            } catch (error) {
                logger.warn('Failed to create velocity evaluators', error);
                this.velocityEvaluators = null;
            }
            needsRecompile = true;
            logger.info('  needsRecompile flag set to true (expressions change)');
        }

        if (config.integratorType !== undefined && config.integratorType !== this.integratorType) {
            logger.info(`Changing integrator: ${this.integratorType} → ${config.integratorType}`);
            this.integratorType = config.integratorType;
            needsRecompile = true;
        }

        if (config.integratorParams !== undefined) {
            logger.verbose('Updating integrator parameters', config.integratorParams);
            this.integratorParams = { ...this.integratorParams, ...config.integratorParams };
            needsRecompile = true;
        }

        // BUG: Newton's method sometimes fails to compile correctly on initial page load,
        // possibly due to Nerdamer not being fully initialized or timing issues with
        // symbolic differentiation. Workaround is in controls-v2.js where we delay
        // Newton's method activation by 3 seconds on startup.
        if (config.solutionMethod !== undefined && config.solutionMethod !== this.solutionMethod) {
            logger.info(`Changing solution method: ${this.solutionMethod} → ${config.solutionMethod}`);
            this.solutionMethod = config.solutionMethod;
            needsRecompile = true;
            logger.info(`  needsRecompile flag set to true (solutionMethod change)`);
        }
        logger.info('Solution method update complete, continuing...');

        if (config.transformType !== undefined && config.transformType !== this.transformType) {
            logger.info(`Changing transform: ${this.transformType} → ${config.transformType}`);
            this.transformType = config.transformType;
            needsRecompile = true;
        }

        if (config.transformParams !== undefined) {
            logger.verbose('Updating transform parameters', config.transformParams);
            this.transformParams = config.transformParams;
            needsRecompile = true;
        }

        if (config.mapperType !== undefined && config.mapperType !== this.mapperType) {
            logger.info(`Changing mapper: ${this.mapperType} → ${config.mapperType}`);
            this.mapperType = config.mapperType;
            needsRecompile = true;
        }

        if (config.mapperParams !== undefined) {
            logger.verbose('Updating mapper parameters', config.mapperParams);
            this.mapperParams = config.mapperParams;
            needsRecompile = true;
        }

        if (config.colorMode !== undefined && config.colorMode !== this.colorMode) {
            logger.info(`Changing color mode: ${this.colorMode} → ${config.colorMode}`);
            this.colorMode = config.colorMode;
            needsRecompile = true;
        }

        if (config.colorExpression !== undefined && config.colorExpression !== this.colorExpression) {
            logger.info(`Changing color expression: ${this.colorExpression} → ${config.colorExpression}`);
            this.colorExpression = config.colorExpression;
            needsRecompile = true;
        }

        if (config.colorGradient !== undefined) {
            // Compare gradient arrays (deep comparison)
            const gradientChanged = JSON.stringify(config.colorGradient) !== JSON.stringify(this.colorGradient);
            if (gradientChanged) {
                logger.info('Changing color gradient');
                this.colorGradient = config.colorGradient;
                needsRecompile = true;
            }
        }

        if (config.useCustomGradient !== undefined && config.useCustomGradient !== this.useCustomGradient) {
            logger.info(`Changing custom gradient usage: ${this.useCustomGradient} → ${config.useCustomGradient}`);
            this.useCustomGradient = config.useCustomGradient;
            needsRecompile = true;
        }

        if (config.velocityScaleMode !== undefined && config.velocityScaleMode !== this.velocityScaleMode) {
            logger.info(`Changing velocity scale mode: ${this.velocityScaleMode} → ${config.velocityScaleMode}`);
            this.velocityScaleMode = config.velocityScaleMode;
            // No recompile needed - just changes which value we use
        }

        if (config.velocityLogScale !== undefined && config.velocityLogScale !== this.velocityLogScale) {
            logger.info(`Changing velocity log scale: ${this.velocityLogScale} → ${config.velocityLogScale}`);
            this.velocityLogScale = config.velocityLogScale;
            needsRecompile = true; // Needs recompile to change shader code
        }

        if (config.timestep !== undefined) {
            logger.verbose(`Timestep: ${this.timestep} → ${config.timestep}`);
            this.timestep = config.timestep;
        }
        if (config.fadeOpacity !== undefined) {
            logger.verbose(`Fade opacity: ${this.fadeOpacity} → ${config.fadeOpacity}`);
            this.fadeOpacity = config.fadeOpacity;
        }
        if (config.dropProbability !== undefined) {
            logger.verbose(`Drop probability: ${this.dropProbability} → ${config.dropProbability}`);
            this.dropProbability = config.dropProbability;
        }
        if (config.dropLowVelocity !== undefined) {
            logger.verbose(`Drop low velocity: ${this.dropLowVelocity} → ${config.dropLowVelocity}`);
            this.dropLowVelocity = config.dropLowVelocity;
        }

        // HDR rendering settings (no recompile needed)
        if (config.useHDR !== undefined && config.useHDR !== this.useHDR) {
            logger.info(`Changing HDR rendering: ${this.useHDR} → ${config.useHDR}`);
            this.useHDR = config.useHDR;

            // Recreate framebuffer manager with new HDR setting
            this.framebufferManager.dispose();
            this.framebufferManager = new FramebufferManager(
                this.gl,
                this.canvas.width,
                this.canvas.height,
                {
                    useHDR: this.useHDR,
                    usePingPong: true
                }
            );

            // Log new HDR status
            const hdrSupport = this.framebufferManager.getHDRSupport();
            logger.info('HDR rendering system reconfigured', {
                hdrEnabled: hdrSupport.enabled,
                hdrSupported: hdrSupport.supported,
                textureFormat: hdrSupport.format
            });

            if (this.useHDR && !hdrSupport.supported) {
                logger.warn('HDR requested but not supported. Falling back to LDR.');
            }

            this.clearScreen();
        }
        if (config.exposure !== undefined) {
            logger.verbose(`Exposure: ${this.exposure} → ${config.exposure}`);
            this.exposure = config.exposure;
            needsRecompile = true; // Exposure is baked into shader
        }
        if (config.gamma !== undefined) {
            logger.verbose(`Gamma: ${this.gamma} → ${config.gamma}`);
            this.gamma = config.gamma;
            needsRecompile = true; // Gamma is baked into shader
        }
        if (config.luminanceGamma !== undefined) {
            logger.verbose(`Luminance Gamma: ${this.luminanceGamma} → ${config.luminanceGamma}`);
            this.luminanceGamma = config.luminanceGamma;
            needsRecompile = true; // Luminance gamma is baked into shader
        }
        if (config.whitePoint !== undefined) {
            logger.verbose(`White point: ${this.whitePoint} → ${config.whitePoint}`);
            this.whitePoint = config.whitePoint;
            needsRecompile = true; // White point is baked into shader
            // White point is used as bloom threshold
            this.bloomManager.updateConfig({ threshold: config.whitePoint });
        }
        if (config.tonemapOperator !== undefined && config.tonemapOperator !== this.tonemapOperator) {
            logger.info(`Tone mapping operator: ${this.tonemapOperator} → ${config.tonemapOperator}`);
            this.tonemapOperator = config.tonemapOperator;
            needsRecompile = true;
        }
        if (config.particleIntensity !== undefined) {
            logger.verbose(`Particle intensity: ${this.particleIntensity} → ${config.particleIntensity}`);
            this.particleIntensity = config.particleIntensity;
        }
        if (config.colorSaturation !== undefined) {
            logger.verbose(`Color saturation: ${this.colorSaturation} → ${config.colorSaturation}`);
            this.colorSaturation = config.colorSaturation;
        }
        if (config.brightnessDesaturation !== undefined) {
            logger.verbose(`Brightness desaturation: ${this.brightnessDesaturation} → ${config.brightnessDesaturation}`);
            this.brightnessDesaturation = config.brightnessDesaturation;
        }
        if (config.brightnessSaturation !== undefined) {
            logger.verbose(`Brightness saturation: ${this.brightnessSaturation} → ${config.brightnessSaturation}`);
            this.brightnessSaturation = config.brightnessSaturation;
        }
        if (config.useDepthTest !== undefined) {
            logger.verbose(`Depth testing: ${this.useDepthTest} → ${config.useDepthTest}`);
            this.useDepthTest = config.useDepthTest;
        }
        if (config.bloomEnabled !== undefined) {
            logger.verbose(`Bloom enabled: ${this.bloomEnabled} → ${config.bloomEnabled}`);
            this.bloomEnabled = config.bloomEnabled;
            this.bloomManager.updateConfig({ enabled: config.bloomEnabled });
        }
        if (config.bloomIntensity !== undefined) {
            logger.verbose(`Bloom intensity: ${this.bloomIntensity} → ${config.bloomIntensity}`);
            this.bloomIntensity = config.bloomIntensity;
            this.bloomManager.updateConfig({ intensity: config.bloomIntensity });
        }
        if (config.bloomRadius !== undefined) {
            logger.verbose(`Bloom radius: ${this.bloomRadius} → ${config.bloomRadius}`);
            this.bloomRadius = config.bloomRadius;
            this.bloomManager.updateConfig({ radius: config.bloomRadius });
            // Radius change requires shader recompile
            needsRecompile = true;
        }
        if (config.bloomAlpha !== undefined) {
            logger.verbose(`Bloom alpha: ${this.bloomAlpha} → ${config.bloomAlpha}`);
            this.bloomAlpha = config.bloomAlpha;
        }
        if (config.smaaEnabled !== undefined) {
            logger.verbose(`SMAA enabled: ${this.smaaEnabled} → ${config.smaaEnabled}`);
            this.smaaEnabled = config.smaaEnabled;
            this.smaaManager.updateConfig({ enabled: config.smaaEnabled });
        }
        if (config.smaaIntensity !== undefined) {
            logger.verbose(`SMAA intensity: ${this.smaaIntensity} → ${config.smaaIntensity}`);
            this.smaaIntensity = config.smaaIntensity;
            this.smaaManager.updateConfig({ intensity: config.smaaIntensity });
        }
        if (config.smaaThreshold !== undefined) {
            logger.verbose(`SMAA threshold: ${this.smaaThreshold} → ${config.smaaThreshold}`);
            this.smaaThreshold = config.smaaThreshold;
            this.smaaManager.updateConfig({ threshold: config.smaaThreshold });
        }
        if (config.bilateralEnabled !== undefined) {
            logger.verbose(`Bilateral filter enabled: ${this.bilateralEnabled} → ${config.bilateralEnabled}`);
            this.bilateralEnabled = config.bilateralEnabled;
            this.bilateralManager.updateConfig({ enabled: config.bilateralEnabled });
        }
        if (config.bilateralSpatialSigma !== undefined) {
            logger.verbose(`Bilateral spatial sigma: ${this.bilateralSpatialSigma} → ${config.bilateralSpatialSigma}`);
            this.bilateralSpatialSigma = config.bilateralSpatialSigma;
            this.bilateralManager.updateConfig({ spatialSigma: config.bilateralSpatialSigma });
        }
        if (config.bilateralIntensitySigma !== undefined) {
            logger.verbose(`Bilateral intensity sigma: ${this.bilateralIntensitySigma} → ${config.bilateralIntensitySigma}`);
            this.bilateralIntensitySigma = config.bilateralIntensitySigma;
            this.bilateralManager.updateConfig({ intensitySigma: config.bilateralIntensitySigma });
        }
        if (config.supersampleFactor !== undefined && config.supersampleFactor !== this.supersampleFactor) {
            logger.info(`Supersampling factor: ${this.supersampleFactor} → ${config.supersampleFactor}`);

            // Validate supersample factor
            const validFactor = Math.max(0.5, Math.min(3.0, config.supersampleFactor));
            if (validFactor !== config.supersampleFactor) {
                logger.warn(`Invalid supersample factor ${config.supersampleFactor}, clamping to ${validFactor}`);
            }

            this.supersampleFactor = validFactor;
            logger.info(`Applying supersample factor: ${this.supersampleFactor}`);
            // Trigger resize to update all framebuffers
            this.resize(this.canvas.width, this.canvas.height);
        }

        if (config.particleCount !== undefined && config.particleCount !== this.particleSystem.particleCount) {
            this.particleSystem.setParticleCount(config.particleCount);
            this.textureManager.resize(this.particleSystem.getResolution());
            this.textureManager.initializeData(this.particleSystem.getAllData());

            // Recreate index buffer
            this.gl.deleteBuffer(this.indexBuffer);
            this.indexBuffer = this.createBuffer(this.particleSystem.getIndices());
        }

        if (config.bbox !== undefined) {
            this.bbox = config.bbox;
            this.particleSystem.setBBox(this.bbox);

            // Reinitialize particles if requested (e.g., on reset)
            if (config.reinitializeParticles) {
                this.particleSystem.initializeParticles();
                this.textureManager.initializeData(this.particleSystem.getAllData());
                logger.info('Particles reinitialized to new viewport bounds');
            }

            this.clearScreen(); // Clear trails when view changes
        }

        logger.info(`Checking needsRecompile flag: ${needsRecompile}`);

        if (needsRecompile) {
            logger.info('Recompiling shaders...');
            try {
                const error = this.compileShaders();
                if (error) {
                    logger.error('Recompilation failed', error);
                    throw new Error(error);
                }
                this.frame = 0; // Reset frame counter
                logger.info('Clearing screen after recompilation...');
                this.clearScreen(); // Clear old particles that were computed with old vector field
                logger.info('Configuration updated successfully, shaders recompiled');
            } catch (e) {
                logger.error('EXCEPTION during shader recompilation:', e);
                logger.error('Stack trace:', e.stack);
                throw e;
            }
        } else {
            logger.info('Configuration updated (no recompile needed)');
        }

        // Log current applied settings
        logger.info('Current settings applied', {
            dimensions: this.dimensions,
            expressions: this.expressions,
            integrator: this.integratorType,
            mapper: this.mapperType,
            timestep: this.timestep,
            particleCount: this.particleSystem.particleCount,
            fadeOpacity: this.fadeOpacity,
            dropProbability: this.dropProbability,
            bbox: `[${this.bbox.min[0].toFixed(3)}, ${this.bbox.min[1].toFixed(3)}] to [${this.bbox.max[0].toFixed(3)}, ${this.bbox.max[1].toFixed(3)}]`
        });
    }

    /**
     * Test encode/decode symmetry
     * Tests JavaScript encode→decode round-trip accuracy
     */
    testEncodeDecodeSymmetry() {
        const { encodeFloatRGBA, decodeFloatRGBA } = require('../utils/float-packing.js');

        // Test values covering the full [0, 1] range
        const testValues = [0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];

        // Also test many random values
        for (let i = 0; i < 100; i++) {
            testValues.push(Math.random());
        }

        let maxError = 0;
        let avgError = 0;
        const errors = [];
        const problematic = [];

        logger.info('Testing encode/decode symmetry...');

        for (const testVal of testValues) {
            // Encode
            const buffer = new Uint8Array(4);
            encodeFloatRGBA(testVal, buffer, 0);

            // Decode
            const decoded = decodeFloatRGBA(buffer[0], buffer[1], buffer[2], buffer[3]);

            // Calculate error
            const error = Math.abs(testVal - decoded);
            errors.push(error);
            avgError += error;
            maxError = Math.max(maxError, error);

            // Track problematic values (error > 1e-6)
            if (error > 1e-6) {
                problematic.push({
                    original: testVal,
                    encoded: `[${buffer[0]}, ${buffer[1]}, ${buffer[2]}, ${buffer[3]}]`,
                    decoded: decoded,
                    error: error
                });
            }
        }

        avgError /= testValues.length;

        logger.info('Encode/Decode symmetry test results:', {
            testCount: testValues.length,
            maxError: maxError.toExponential(3),
            avgError: avgError.toExponential(3),
            problematicCount: problematic.length,
            problematicSamples: problematic.slice(0, 5) // Show first 5
        });

        // Test with world coordinate round-trip
        logger.info('Testing world coordinate round-trip [-5, 5]...');
        const worldTests = [-5, -4, -2.5, 0, 2.5, 4, 5];
        const worldErrors = [];

        for (const worldVal of worldTests) {
            // Normalize
            const normalized = (worldVal - this.bbox.min[0]) / (this.bbox.max[0] - this.bbox.min[0]);

            // Encode
            const buffer = new Uint8Array(4);
            encodeFloatRGBA(normalized, buffer, 0);

            // Decode
            const decoded = decodeFloatRGBA(buffer[0], buffer[1], buffer[2], buffer[3]);

            // Denormalize
            const worldDecoded = this.bbox.min[0] + decoded * (this.bbox.max[0] - this.bbox.min[0]);

            const error = Math.abs(worldVal - worldDecoded);
            worldErrors.push({
                world: worldVal.toFixed(3),
                normalized: normalized.toFixed(6),
                decoded: worldDecoded.toFixed(6),
                error: error.toExponential(3)
            });
        }

        logger.info('World coordinate round-trip results:', { tests: worldErrors });

        return { maxError, avgError, problematic: problematic.length };
    }

    /**
     * Log statistics about the current HDR framebuffer
     * Reads the framebuffer pixels and computes min/max/avg values
     */
    logBufferStats() {
        const gl = this.gl;

        if (!this.framebufferManager) {
            logger.warn('No framebuffer manager available');
            return;
        }

        // Bind the current framebuffer for reading
        const currentIndex = this.framebufferManager.currentIndex;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebufferManager.framebuffers[currentIndex]);

        const width = this.canvas.width;
        const height = this.canvas.height;
        const pixelCount = width * height;

        // Allocate buffer for pixel data
        // Float framebuffers return Float32Array, RGBA8 returns Uint8Array
        const isHDR = this.framebufferManager.isHDR();
        const pixels = isHDR ?
            new Float32Array(pixelCount * 4) :
            new Uint8Array(pixelCount * 4);

        // Read pixels from framebuffer
        gl.readPixels(0, 0, width, height, gl.RGBA, isHDR ? gl.FLOAT : gl.UNSIGNED_BYTE, pixels);

        // Initialize statistics
        let minR = Infinity, minG = Infinity, minB = Infinity;
        let maxR = -Infinity, maxG = -Infinity, maxB = -Infinity;
        let sumR = 0, sumG = 0, sumB = 0;
        let maxBrightness = -Infinity;
        let pixelsAboveOne = 0;

        // Compute statistics
        for (let i = 0; i < pixelCount; i++) {
            const idx = i * 4;
            let r = pixels[idx];
            let g = pixels[idx + 1];
            let b = pixels[idx + 2];

            // If LDR, normalize to [0,1]
            if (!isHDR) {
                r /= 255;
                g /= 255;
                b /= 255;
            }

            minR = Math.min(minR, r);
            minG = Math.min(minG, g);
            minB = Math.min(minB, b);

            maxR = Math.max(maxR, r);
            maxG = Math.max(maxG, g);
            maxB = Math.max(maxB, b);

            sumR += r;
            sumG += g;
            sumB += b;

            const brightness = Math.max(r, g, b);
            maxBrightness = Math.max(maxBrightness, brightness);

            if (brightness > 1.0) {
                pixelsAboveOne++;
            }
        }

        const avgR = sumR / pixelCount;
        const avgG = sumG / pixelCount;
        const avgB = sumB / pixelCount;

        // Log results
        logger.info('=== HDR Buffer Statistics ===');
        logger.info(`Framebuffer: ${width}x${height} (${pixelCount.toLocaleString()} pixels)`);
        logger.info(`Format: ${isHDR ? 'HDR Float' : 'LDR RGBA8'}`);
        logger.info(`Red   - Min: ${minR.toFixed(6)}, Max: ${maxR.toFixed(6)}, Avg: ${avgR.toFixed(6)}`);
        logger.info(`Green - Min: ${minG.toFixed(6)}, Max: ${maxG.toFixed(6)}, Avg: ${avgG.toFixed(6)}`);
        logger.info(`Blue  - Min: ${minB.toFixed(6)}, Max: ${maxB.toFixed(6)}, Avg: ${avgB.toFixed(6)}`);
        logger.info(`Max Brightness (max of R/G/B): ${maxBrightness.toFixed(6)}`);
        logger.info(`Pixels above 1.0: ${pixelsAboveOne.toLocaleString()} (${(pixelsAboveOne / pixelCount * 100).toFixed(2)}%)`);

        // Restore previous framebuffer binding
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    /**
     * Log current shader source code to console
     */
    logShaders() {
        if (!this.shaderSource) {
            console.warn('No shader source available');
            return;
        }

        console.log('=== UPDATE VERTEX SHADER ===');
        console.log(this.shaderSource.updateVertex);
        console.log('=== END SHADER ===\n');

        console.log('=== UPDATE FRAGMENT SHADER ===');
        console.log(this.shaderSource.updateFragment);
        console.log('=== END SHADER ===\n');

        console.log('=== DRAW VERTEX SHADER ===');
        console.log(this.shaderSource.drawVertex);
        console.log('=== END SHADER ===\n');

        console.log('=== DRAW FRAGMENT SHADER ===');
        console.log(this.shaderSource.drawFragment);
        console.log('=== END SHADER ===');

        logger.info('Shaders logged to console');
    }

    /**
     * Log update shader (contains integrator and Jacobian)
     */
    logUpdateShader() {
        if (!this.shaderSource) {
            console.warn('No shader source available');
            return;
        }

        console.log('=== UPDATE FRAGMENT SHADER (Integrator + Jacobian) ===');
        console.log(this.shaderSource.updateFragment);
        console.log('=== END SHADER ===');

        logger.info('Update shader logged to browser console');
    }

    /**
     * Log draw shader (contains color computations)
     */
    logDrawShader() {
        if (!this.shaderSource) {
            console.warn('No shader source available');
            return;
        }

        console.log('=== DRAW FRAGMENT SHADER (Color Mode) ===');
        console.log(this.shaderSource.drawFragment);
        console.log('=== END SHADER ===');

        logger.info('Draw shader logged to browser console');
    }

    /**
     * Log screen shader (contains tone mapping)
     */
    logScreenShader() {
        if (!this.shaderSource || !this.shaderSource.screenFragment) {
            console.warn('No screen shader source available');
            return;
        }

        console.log('=== SCREEN FRAGMENT SHADER (Tone Mapping) ===');
        console.log(this.shaderSource.screenFragment);
        console.log('=== END SHADER ===');

        logger.info('Screen shader logged to browser console');
    }

    /**
     * Log diagnostic stats shaders (velocity and brightness)
     */
    logStatsShaders() {
        logger.info('=== DIAGNOSTIC STATS SHADERS ===');

        // Log velocity stats shader
        if (this.velocityStatsManager && this.velocityStatsManager.getShaderSource) {
            const velShader = this.velocityStatsManager.getShaderSource();
            if (velShader) {
                console.log('=== VELOCITY STATS FRAGMENT SHADER ===');
                console.log(velShader);
                console.log('=== END SHADER ===');
            } else {
                console.warn('Velocity stats shader not available');
            }
        } else {
            console.warn('VelocityStatsManager not initialized or no getShaderSource method');
        }

        // Log buffer stats shader (brightness histogram)
        if (this.bufferStatsManager && this.bufferStatsManager.getShaderSource) {
            const bufferShader = this.bufferStatsManager.getShaderSource();
            if (bufferShader) {
                console.log('=== BRIGHTNESS STATS FRAGMENT SHADER ===');
                console.log(bufferShader);
                console.log('=== END SHADER ===');
            } else {
                console.warn('Buffer stats shader not available');
            }
        } else {
            console.warn('BufferStatsManager not initialized or no getShaderSource method');
        }

        logger.info('Stats shaders logged to browser console');
    }
}
