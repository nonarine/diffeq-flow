/**
 * Shader templates and compilation utilities
 */

import { getGLSLFunctionDeclarations } from '../math/parser.js';

/**
 * Compile a shader
 */
export function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Shader compilation error: ${info}\n\nSource:\n${addLineNumbers(source)}`);
    }

    return shader;
}

/**
 * Link a shader program
 */
export function linkProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`Program linking error: ${info}`);
    }

    return program;
}

/**
 * Create a complete shader program
 */
export function createProgram(gl, vertexSource, fragmentSource) {
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = linkProgram(gl, vertexShader, fragmentShader);

    // Clean up shaders (they're now in the program)
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    return program;
}

/**
 * Add line numbers to source for error reporting
 */
function addLineNumbers(source) {
    return source.split('\n').map((line, i) => `${i + 1}: ${line}`).join('\n');
}

/**
 * Generate position update vertex shader
 */
export function generateUpdateVertexShader() {
    return `
precision highp float;

attribute vec2 a_pos;

void main() {
    gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0);
}
`;
}

/**
 * Generate position update fragment shader
 * @param {number} dimensions - Number of dimensions
 * @param {string[]} velocityExpressions - GLSL expressions for velocity (one per dimension)
 * @param {string} integratorCode - Integration method code
 * @param {CoordinateStrategy} strategy - Coordinate storage strategy
 * @param {object} transformCode - Transform GLSL code {forward, inverse, jacobian}
 * @param {object} coordinateSystemCode - Coordinate system GLSL code {forwardTransform, velocityTransform}
 */
export function generateUpdateFragmentShader(dimensions, velocityExpressions, integratorCode, strategy, transformCode = null, coordinateSystemCode = null) {
    // Generate uniforms for position textures
    const positionUniforms = Array.from({ length: dimensions }, (_, i) =>
        `uniform sampler2D u_pos_${i};`
    ).join('\n');

    // Note: Age is stored in alpha channel of u_pos_0 texture

    // Generate vector constructor from texture reads
    const vecType = `vec${dimensions}`;
    const readPositions = Array.from({ length: dimensions }, (_, i) =>
        `decodeFloat(texture2D(u_pos_${i}, v_texcoord))`
    ).join(', ');

    // Generate velocity function
    const swizzles = ['x', 'y', 'z', 'w'];
    const velocityComponents = velocityExpressions.map((expr, i) =>
        `    result.${swizzles[i]} = ${expr};`
    ).join('\n');

    // Add coordinate system functions if provided
    const hasCoordinateSystem = coordinateSystemCode && coordinateSystemCode.forwardTransform;
    const coordinateSystemFunctions = hasCoordinateSystem ? `
// Coordinate system transformation functions
${coordinateSystemCode.forwardTransform}
${coordinateSystemCode.velocityTransform}
` : '';

    // Add transform functions if provided
    const hasTransform = transformCode && transformCode.forward;
    const transformFunctions = hasTransform ? `
// Domain transformation functions
${transformCode.helpers || ''}
${transformCode.forward}
${transformCode.inverse}
${transformCode.jacobian}
` : '';

    // Modify velocity function to include coordinate system and/or domain transform
    // Priority: Coordinate system wraps the velocity definition, domain transform wraps integration
    const velocityFunction = hasCoordinateSystem ? `
// User-defined velocity field in native coordinates (${coordinateSystemCode.name || 'custom'})
${vecType} get_velocity_native(${vecType} pos_native) {
    ${vecType} result;
${velocityComponents}
    return result;
}

// Velocity field in Cartesian coordinates (for integration)
${vecType} get_velocity(${vecType} pos_cartesian) {
    // Transform position to native coordinates
    ${vecType} pos_native = transformToNative(pos_cartesian);

    // Evaluate velocity in native coordinates
    ${vecType} vel_native = get_velocity_native(pos_native);

    // Transform velocity back to Cartesian using Jacobian
    return transformVelocityToCartesian(vel_native, pos_cartesian);
}
` : hasTransform ? `
// Original velocity field in world coordinates
${vecType} get_velocity_original(${vecType} pos) {
    ${vecType} result;
    float x = pos.x;
    ${dimensions > 1 ? 'float y = pos.y;' : ''}
    ${dimensions > 2 ? 'float z = pos.z;' : ''}
    ${dimensions > 3 ? 'float w = pos.w;' : ''}

${velocityComponents}

    return result;
}

// Transformed velocity field: dy/dt = J_T(x) * f(x)
// where y = T(x)
${vecType} get_velocity(${vecType} pos_transformed) {
    // Transform back to world coordinates
    ${vecType} pos = transform_inverse(pos_transformed);

    // Evaluate original velocity field
    ${vecType} vel_original = get_velocity_original(pos);

    // Apply Jacobian: component-wise multiplication
    ${vecType} jacobian = transform_jacobian(pos);
    return vel_original * jacobian;
}
` : `
// User-defined velocity field (no transform)
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

    // Get custom function declarations
    const customFunctions = getGLSLFunctionDeclarations();

    return `
precision highp float;

${strategy.getGLSLConstants()}
${strategy.getGLSLDecodeFunction()}
${strategy.getGLSLEncodeFunction()}
${strategy.getGLSLNormalizeFunction()}
${strategy.getGLSLDenormalizeFunction()}

${customFunctions}

${positionUniforms}

uniform vec2 u_min;
uniform vec2 u_max;
uniform float u_h;
uniform float u_rand_seed;
uniform float u_drop_rate;
uniform int u_out_coordinate;
uniform float u_particles_res;
uniform float u_max_velocity;
uniform float u_drop_low_velocity;
uniform float u_velocity_threshold;
uniform float u_alpha;
${hasTransform ? 'uniform vec4 u_transform_params;' : ''}

${coordinateSystemFunctions}

${transformFunctions}

${velocityFunction}

${integratorCode}

// High-quality hash-based random number generator
// Returns value in [0, 1] with good distribution
float rand(vec2 co) {
    // Hash the input
    vec2 p = co + vec2(u_rand_seed, u_rand_seed * 1.61803398875);
    // Use a better hash function
    p = fract(p * vec2(443.897, 441.423));
    p += dot(p.yx, p.xy + vec2(19.19, 17.17));
    return fract(p.x * p.y);
}

// Secondary independent random function
float rand2(vec2 co) {
    vec2 p = co + vec2(u_rand_seed * 2.71828, u_rand_seed * 3.14159);
    p = fract(p * vec2(269.5, 271.3));
    p += dot(p.yx, p.xy + vec2(23.23, 29.29));
    return fract(p.x * p.y);
}

void main() {
    vec2 texcoord = gl_FragCoord.xy / u_particles_res;

    // Read current age from alpha channel of u_pos_0
    float current_age = texture2D(u_pos_0, texcoord).a;

    // Read current position from textures
    // Positions are stored as normalized [0,1] values, denormalize to world coords
    ${vecType} pos;
    ${Array.from({ length: dimensions }, (_, i) => {
        const coord = ['x', 'y', 'z', 'w'][i];
        if (i === 0) {
            return `pos.${coord} = denormalizeFromViewport(decodeFloat(texture2D(u_pos_${i}, texcoord)), u_min.x, u_max.x);`;
        } else if (i === 1) {
            return `pos.${coord} = denormalizeFromViewport(decodeFloat(texture2D(u_pos_${i}, texcoord)), u_min.y, u_max.y);`;
        } else {
            // Higher dimensions use fixed range [-10, 10]
            return `pos.${coord} = denormalizeFromViewport(decodeFloat(texture2D(u_pos_${i}, texcoord)), -10.0, 10.0);`;
        }
    }).join('\n    ')}

    // Integrate to get new position
    ${vecType} new_pos;
    ${hasTransform ? `
    // Transform to y-space, integrate, then transform back to x-space
    ${vecType} pos_transformed = transform_forward(pos);
    ${vecType} new_pos_transformed = integrate(pos_transformed, u_h);
    new_pos = transform_inverse(new_pos_transformed);
    ` : `
    // Direct integration (no transform)
    new_pos = integrate(pos, u_h);
    `}

    // Calculate velocity at new position for low-velocity dropping
    ${vecType} velocity = ${hasTransform ? 'get_velocity_original(new_pos)' : 'get_velocity(new_pos)'};
    float speed = length(velocity);

    // Check if particle is outside viewport bounds with small margin
    // Use 20% margin to allow particles to flow slightly off-screen before respawning
    float width = u_max.x - u_min.x;
    float height = u_max.y - u_min.y;
    bool outside = new_pos.x < (u_min.x - width * 0.2) || new_pos.x > (u_max.x + width * 0.2) ||
                   new_pos.y < (u_min.y - height * 0.2) || new_pos.y > (u_max.y + height * 0.2);

    // Check if particle is too slow (if drop_low_velocity is enabled)
    bool too_slow = u_drop_low_velocity > 0.5 && speed < (u_max_velocity * u_velocity_threshold);

    // Random drop: reset particle to random position with small probability
    // Also reset if particle exits the viewport or is too slow
    float drop_chance = rand(texcoord);
    bool should_respawn = drop_chance < u_drop_rate || outside || too_slow;
    if (should_respawn) {
        // Spawn particles 2% OUTSIDE viewport for natural flow-in effect (negative margin)
        // Use texcoord + rand_seed for truly independent random values per particle per frame
        const float margin = -0.02;
        ${dimensions === 2 ? `new_pos.x = u_min.x + width * margin + rand(texcoord * 1.234 + vec2(u_rand_seed)) * width * (1.0 - 2.0 * margin);
        new_pos.y = u_min.y + height * margin + rand2(texcoord * 5.678 + vec2(u_rand_seed * 2.345)) * height * (1.0 - 2.0 * margin);` :
        Array.from({ length: dimensions }, (_, i) => {
            const coords = ['x', 'y', 'z', 'w'];
            if (i === 0) return `new_pos.x = u_min.x + width * margin + rand(texcoord * 1.234 + vec2(u_rand_seed)) * width * (1.0 - 2.0 * margin);`;
            if (i === 1) return `new_pos.y = u_min.y + height * margin + rand2(texcoord * 5.678 + vec2(u_rand_seed * 2.345)) * height * (1.0 - 2.0 * margin);`;
            // For higher dimensions, use varied seeds for better distribution
            return `new_pos.${coords[i]} = -10.4 + rand(texcoord * ${i + 1}.37 + vec2(u_rand_seed * ${i + 3}.5)) * 20.8;`;
        }).join('\n        ')}
    }

    // Calculate new age (based on all spawn conditions)
    float new_age;
    if (should_respawn) {
        new_age = 0.0; // Reset age for newly spawned particles
    } else {
        new_age = min(current_age + 0.5, 1.0); // Increment age, cap at 1.0
    }

    // Output the selected coordinate
    // Normalize world coords back to [0, 1] before encoding
    ${Array.from({ length: dimensions }, (_, i) => {
        const coord = ['x', 'y', 'z', 'w'][i];
        let normalizeExpr;
        if (i === 0) {
            normalizeExpr = `normalizeToViewport(new_pos.${coord}, u_min.x, u_max.x)`;
        } else if (i === 1) {
            normalizeExpr = `normalizeToViewport(new_pos.${coord}, u_min.y, u_max.y)`;
        } else {
            normalizeExpr = `normalizeToViewport(new_pos.${coord}, -10.0, 10.0)`;
        }

        if (i === 0) {
            return `if (u_out_coordinate == ${i}) {
        gl_FragColor = encodeFloat(${normalizeExpr});
        gl_FragColor.a = new_age; // Store age in alpha channel
    }`;
        } else if (i === dimensions - 1) {
            return ` else {
        gl_FragColor = encodeFloat(${normalizeExpr});
    }`;
        } else {
            return ` else if (u_out_coordinate == ${i}) {
        gl_FragColor = encodeFloat(${normalizeExpr});
    }`;
        }
    }).join('')}
}
`;
}

/**
 * Generate particle rendering vertex shader
 */
export function generateDrawVertexShader(dimensions, mapperCode, velocityExpressions, strategy, lineMode = false, coordinateSystemCode = null) {
    const positionUniforms = Array.from({ length: dimensions }, (_, i) =>
        `uniform sampler2D u_pos_${i};`
    ).join('\n');

    // Add previous position uniforms for line mode
    const prevPositionUniforms = lineMode ? Array.from({ length: dimensions }, (_, i) =>
        `uniform sampler2D u_prev_pos_${i};`
    ).join('\n') : '';

    const vecType = `vec${dimensions}`;

    // Generate velocity function
    const swizzles = ['x', 'y', 'z', 'w'];
    const velocityComponents = velocityExpressions.map((expr, i) =>
        `    result.${swizzles[i]} = ${expr};`
    ).join('\n');

    // Add coordinate system functions if provided
    const hasCoordinateSystem = coordinateSystemCode && coordinateSystemCode.forwardTransform;
    const coordinateSystemFunctions = hasCoordinateSystem ? `
// Coordinate system transformation functions
${coordinateSystemCode.forwardTransform}
${coordinateSystemCode.velocityTransform}
` : '';

    // Velocity function with coordinate system support
    const velocityFunction = hasCoordinateSystem ? `
// User-defined velocity field in native coordinates
${vecType} get_velocity_native(${vecType} pos_native) {
    ${vecType} result;
${velocityComponents}
    return result;
}

// Velocity field in Cartesian coordinates
${vecType} get_velocity(${vecType} pos_cartesian) {
    ${vecType} pos_native = transformToNative(pos_cartesian);
    ${vecType} vel_native = get_velocity_native(pos_native);
    return transformVelocityToCartesian(vel_native, pos_cartesian);
}
` : `
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

    // Get custom function declarations
    const customFunctions = getGLSLFunctionDeclarations();

    return `
precision highp float;

${strategy.getGLSLConstants()}
${strategy.getGLSLDecodeFunction()}
${strategy.getGLSLDenormalizeFunction()}

${customFunctions}

attribute float a_index;
${lineMode ? 'attribute float a_vertex_id; // 0 = prev, 1 = current' : ''}

${positionUniforms}
${prevPositionUniforms}

uniform float u_particles_res;
uniform vec2 u_min;
uniform vec2 u_max;
uniform float u_alpha;
uniform float u_particle_size;
uniform vec2 u_viewport_size;  // Actual render resolution (renderWidth, renderHeight)
uniform vec2 u_canvas_size;    // Canvas resolution (canvas.width, canvas.height)

varying vec${dimensions} v_pos;
varying vec${dimensions} v_velocity;          // Full N-dimensional velocity (for expression mode)
varying vec${dimensions} v_velocity_projected; // Projected 2D velocity (for angle-based color modes)

${mapperCode}

${coordinateSystemFunctions}

${velocityFunction}

void main() {
    ${lineMode ? `
    // Line mode: index buffer has [0,0,1,1,2,2,3,3,...], vertex ID buffer has [0,1,0,1,0,1,...]
    // a_vertex_id = 0 means previous position, 1 means current position
    float particle_index = a_index;
    bool is_current = a_vertex_id > 0.5;
    ` : `
    // Point mode: one vertex per particle
    float particle_index = a_index;
    `}

    // Calculate texture coordinate from particle index
    // Add 0.5 to sample from texel centers
    vec2 texcoord = vec2(
        (mod(particle_index, u_particles_res) + 0.5) / u_particles_res,
        (floor(particle_index / u_particles_res) + 0.5) / u_particles_res
    );

    // Read age from alpha channel of u_pos_0
    float age = texture2D(u_pos_0, texcoord).a;

    // Read position from textures and denormalize to world coordinates
    ${vecType} pos;
    ${lineMode ? `
    if (is_current) {
        // Current position
        ${Array.from({ length: dimensions }, (_, i) => {
            const coord = ['x', 'y', 'z', 'w'][i];
            if (i === 0) {
                return `pos.${coord} = denormalizeFromViewport(decodeFloat(texture2D(u_pos_${i}, texcoord)), u_min.x, u_max.x);`;
            } else if (i === 1) {
                return `pos.${coord} = denormalizeFromViewport(decodeFloat(texture2D(u_pos_${i}, texcoord)), u_min.y, u_max.y);`;
            } else {
                return `pos.${coord} = denormalizeFromViewport(decodeFloat(texture2D(u_pos_${i}, texcoord)), -10.0, 10.0);`;
            }
        }).join('\n        ')}
    } else {
        // Previous position
        ${Array.from({ length: dimensions }, (_, i) => {
            const coord = ['x', 'y', 'z', 'w'][i];
            if (i === 0) {
                return `pos.${coord} = denormalizeFromViewport(decodeFloat(texture2D(u_prev_pos_${i}, texcoord)), u_min.x, u_max.x);`;
            } else if (i === 1) {
                return `pos.${coord} = denormalizeFromViewport(decodeFloat(texture2D(u_prev_pos_${i}, texcoord)), u_min.y, u_max.y);`;
            } else {
                return `pos.${coord} = denormalizeFromViewport(decodeFloat(texture2D(u_prev_pos_${i}, texcoord)), -10.0, 10.0);`;
            }
        }).join('\n        ')}
    }
    ` : `
    ${Array.from({ length: dimensions }, (_, i) => {
        const coord = ['x', 'y', 'z', 'w'][i];
        if (i === 0) {
            return `pos.${coord} = denormalizeFromViewport(decodeFloat(texture2D(u_pos_${i}, texcoord)), u_min.x, u_max.x);`;
        } else if (i === 1) {
            return `pos.${coord} = denormalizeFromViewport(decodeFloat(texture2D(u_pos_${i}, texcoord)), u_min.y, u_max.y);`;
        } else {
            return `pos.${coord} = denormalizeFromViewport(decodeFloat(texture2D(u_pos_${i}, texcoord)), -10.0, 10.0);`;
        }
    }).join('\n    ')}
    `}

    // Calculate velocity for coloring
    ${vecType} velocity = get_velocity(pos);

    // Pass N-dimensional position and full velocity to fragment shader
    v_pos = pos;
    v_velocity = velocity; // Full N-dimensional velocity for expression mode

    // Skip newly spawned particles (age < 1) by moving them off-screen
    if (age < 1.0) {
        gl_Position = vec4(10.0, 10.0, 10.0, 1.0); // Far outside clip space
        gl_PointSize = 0.0;
        v_velocity_projected = velocity; // Won't be used since particle is off-screen
    } else {
        // Project position to 3D (with depth)
        vec3 pos_3d = project_to_3d(pos);

        // Project velocity to 2D (using same mapper)
        // For linear projections, this is correct for tangent vectors
        vec2 velocity_2d = project_to_2d(velocity);

        // Create 2D velocity vector (pad to match dimensions for varying)
        ${vecType} velocity_projected;
        velocity_projected.x = velocity_2d.x;
        velocity_projected.y = velocity_2d.y;
        ${dimensions > 2 ? 'velocity_projected.z = 0.0;' : ''}
        ${dimensions > 3 ? 'velocity_projected.w = 0.0;' : ''}

        // Pass projected 2D velocity to fragment shader (for angle-based color modes)
        v_velocity_projected = velocity_projected;

        // Map to screen space
        vec2 normalized = (pos_3d.xy - u_min) / (u_max - u_min);

        // Use depth value (normalized to [-1, 1] range)
        // For now, assume depth is in similar range to x/y coordinates
        float depth_normalized = (pos_3d.z - (u_min.x + u_min.y) * 0.5) / ((u_max.x - u_min.x + u_max.y - u_min.y) * 0.5);
        depth_normalized = clamp(depth_normalized, -1.0, 1.0);

        gl_Position = vec4(normalized * 2.0 - 1.0, depth_normalized, 1.0);

        // Scale particle size by render scale to maintain consistent visual size
        // Calculate render scale as viewport size / canvas size
        float render_scale = u_viewport_size.x / u_canvas_size.x;
        gl_PointSize = u_particle_size * render_scale;
    }
}
`;
}

/**
 * Generate particle rendering fragment shader
 */
export function generateDrawFragmentShader(dimensions, colorCode, usesMaxVelocity) {
    // Get custom function declarations
    const customFunctions = getGLSLFunctionDeclarations();

    return `
precision highp float;

${customFunctions}

varying vec${dimensions} v_pos;
varying vec${dimensions} v_velocity;          // Full N-dimensional velocity (for expression mode)
varying vec${dimensions} v_velocity_projected; // Projected 2D velocity (for angle-based color modes)

${usesMaxVelocity ? 'uniform float u_max_velocity;\nuniform float u_velocity_log_scale;' : ''}
uniform float u_particle_intensity;
uniform float u_color_saturation;
uniform float u_alpha;
uniform vec2 u_viewport_size;  // Actual render resolution
uniform vec2 u_canvas_size;    // Canvas resolution

${colorCode}

void main() {
    // Get color based on position and velocity
    vec3 color = getColor(v_pos, v_velocity, v_velocity_projected);

    // Apply saturation adjustment (for attractor visualization)
    // 0.0 = grayscale, 1.0 = full saturation
    if (u_color_saturation < 1.0) {
        float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
        vec3 grayscale = vec3(luminance);
        color = mix(grayscale, color, u_color_saturation);
    }

    // Scale by intensity for HDR (allows colors > 1.0)
    color *= u_particle_intensity;

    // Calculate render scale factor
    float render_scale = u_viewport_size.x / u_canvas_size.x;

    // Compensate alpha for particle size scaling to maintain constant brightness
    // Particle area scales with render_scale², so divide alpha by render_scale²
    // This ensures that larger particles contribute the same total brightness
    float area_compensation = 1.0 / (render_scale * render_scale);
    float adjusted_alpha = 0.35 * area_compensation;

    // Alpha blending allows proper fade to black
    gl_FragColor = vec4(color, adjusted_alpha);
}
`;
}

/**
 * Generate screen fade/composite vertex shader
 */
export function generateScreenVertexShader() {
    return `
precision highp float;

attribute vec2 a_pos;
varying vec2 v_texcoord;

void main() {
    v_texcoord = a_pos;
    gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0);
}
`;
}

/**
 * Generate screen fade fragment shader
 */
export function generateScreenFadeFragmentShader() {
    return `
precision highp float;

uniform sampler2D u_screen;
uniform float u_fade;

varying vec2 v_texcoord;

void main() {
    vec4 color = texture2D(u_screen, v_texcoord);
    vec3 faded = color.rgb * u_fade;

    // Snap to black if very dark (prevents floating point precision issues)
    // This ensures trails fade completely to black
    float brightness = max(max(faded.r, faded.g), faded.b);
    if (brightness < 0.003) {
        faded = vec3(0.0);
    }

    gl_FragColor = vec4(faded, 1.0);
}
`;
}

/**
 * Generate screen copy fragment shader
 */
export function generateScreenCopyFragmentShader() {
    return `
precision highp float;

uniform sampler2D u_screen;

varying vec2 v_texcoord;

void main() {
    gl_FragColor = texture2D(u_screen, v_texcoord);
}
`;
}

/**
 * Generate tone mapping fragment shader
 * @param {string} tonemapCode - GLSL code for tone mapping operator (from tonemapping.js)
 */
export function generateTonemapFragmentShader(tonemapCode = '') {
    // Default to simple exposure + gamma if no operator provided
    if (!tonemapCode) {
        tonemapCode = `
vec3 tonemap(vec3 color) {
    return color * u_exposure;
}

vec3 applyGamma(vec3 color) {
    return pow(color, vec3(1.0 / u_gamma));
}
`;
    }

    return `
precision highp float;

uniform sampler2D u_screen;
uniform sampler2D u_bloom;
uniform float u_bloom_intensity;
uniform float u_bloom_alpha;
uniform bool u_bloom_enabled;
uniform float u_exposure;
uniform float u_gamma;
uniform float u_whitePoint;
uniform float u_brightness_desat;
uniform float u_brightness_sat;
uniform float u_hdr_max_brightness;
uniform float u_hdr_avg_brightness;

varying vec2 v_texcoord;

${tonemapCode}

void main() {
    // Read HDR color from framebuffer
    vec3 hdrColor = texture2D(u_screen, v_texcoord).rgb;

    // Blend bloom if enabled (before tone mapping)
    if (u_bloom_enabled) {
        vec3 bloomColor = texture2D(u_bloom, v_texcoord).rgb * u_bloom_intensity;
        // Alpha blend: mix base color with bloom using alpha
        hdrColor = mix(hdrColor, hdrColor + bloomColor, u_bloom_alpha);
    }

    // Calculate HDR brightness once for both effects (Rec. 709 luminance)
    float hdrBrightness = dot(hdrColor, vec3(0.2126, 0.7152, 0.0722));
    vec3 hdrGray = vec3(hdrBrightness);

    // Get adaptive thresholds based on actual HDR buffer statistics
    float avgBrightness = max(u_hdr_avg_brightness, 0.1); // Avoid division by zero
    float maxBrightness = max(u_hdr_max_brightness, 1.0);

    // Work in log space to handle the massive dynamic range (0.1 to 100,000+)
    float logAvg = log2(avgBrightness + 1.0);
    float logMax = log2(maxBrightness + 1.0);
    float logBrightness = log2(hdrBrightness + 1.0);

    // Apply brightness-based DESATURATION (desaturates BRIGHT regions)
    // Prevents oversaturation and RGB clipping in dense accumulations
    if (u_brightness_desat > 0.0) {
        // Target brighter-than-average regions (where particles accumulate)
        // Start desaturating at 2x average, full desat at 100x average
        // This hits the actual bright accumulations, not just the max peaks
        float brightStart = avgBrightness * 2.0;
        float brightEnd = avgBrightness * 100.0;
        float logBrightStart = log2(brightStart + 1.0);
        float logBrightEnd = log2(brightEnd + 1.0);
        float desatFactor = smoothstep(logBrightStart, logBrightEnd, logBrightness) * u_brightness_desat;

        // Blend toward grayscale
        hdrColor = mix(hdrColor, hdrGray, desatFactor);
    }

    // Apply brightness-based SATURATION BUILDUP (desaturates DIM regions)
    // Creates effect where sparse particles are washed out, dense accumulations pop with color
    if (u_brightness_sat > 0.0) {
        // Slider controls the threshold: higher values = more aggressive desaturation
        // - At 0.3: pixels below ~1000x average are desaturated
        // - At 0.5: pixels below ~4000x average are desaturated
        // - At 1.0: pixels below ~137,000 (max) are desaturated (very aggressive)
        float threshold = avgBrightness * pow(10.0, u_brightness_sat * 3.0); // 1x to 1000x average
        float logThreshold = log2(threshold + 1.0);

        // Narrow transition for sharp cutoff
        float logTransitionStart = log2(avgBrightness * 0.1 + 1.0); // 10% of average
        float satFactor = smoothstep(logTransitionStart, logThreshold, logBrightness);

        // Apply the effect: low brightness gets desaturated AND dimmed
        float desatAmount = (1.0 - satFactor) * u_brightness_sat;
        hdrColor = mix(hdrColor, hdrGray, desatAmount);

        // Also reduce brightness in desaturated regions
        // This makes sparse trails even more subtle (both dim and colorless)
        hdrColor *= (1.0 - desatAmount * 0.5); // Reduce brightness by up to 50%
    }

    // Apply gamma correction in HDR space (before tone mapping)
    // This prevents clipping and gives the tone mapper more headroom
    vec3 gammaCorrected = applyGamma(hdrColor);

    // Apply luminance gamma in HDR space (hue-preserving brightness adjustment)
    vec3 hdrGammaCorrected = applyLuminanceGamma(gammaCorrected);

    // Apply tone mapping operator to compress HDR values into LDR range
    vec3 ldrColor = tonemap(hdrGammaCorrected);

    gl_FragColor = vec4(ldrColor, 1.0);
}
`;
}

/**
 * Generate bloom bright pass fragment shader
 * Extracts pixels above threshold for bloom layer
 */
export function generateBloomBrightPassShader() {
    return `
precision highp float;

uniform sampler2D u_screen;
uniform float u_threshold;

varying vec2 v_texcoord;

void main() {
    vec3 color = texture2D(u_screen, v_texcoord).rgb;

    // Calculate luminance
    float brightness = dot(color, vec3(0.2126, 0.7152, 0.0722));

    // Extract bright regions above threshold
    // Use smooth step for soft transition
    float contribution = smoothstep(u_threshold * 0.8, u_threshold * 1.2, brightness);

    // Output bright pixels only
    gl_FragColor = vec4(color * contribution, 1.0);
}
`;
}

/**
 * Generate bloom blur fragment shader
 * Two-pass separable Gaussian blur with bilinear optimization
 * @param {boolean} horizontal - True for horizontal pass, false for vertical
 * @param {number} radius - Blur radius (1.0 = standard, higher = wider blur)
 */
export function generateBloomBlurShader(horizontal = true, radius = 1.0) {
    const direction = horizontal ? 'vec2(1.0, 0.0)' : 'vec2(0.0, 1.0)';

    return `
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_texel_size;
uniform float u_radius;

varying vec2 v_texcoord;

void main() {
    vec2 direction = ${direction};
    vec3 result = vec3(0.0);

    // Bilinear-optimized 13-tap Gaussian blur
    // Uses hardware linear filtering to sample between pixels for smoother results
    // This reduces the blocky appearance by effectively sampling at sub-pixel positions

    vec2 off1 = vec2(1.3846153846) * direction * u_texel_size * u_radius;
    vec2 off2 = vec2(3.2307692308) * direction * u_texel_size * u_radius;
    vec2 off3 = vec2(5.0769230769) * direction * u_texel_size * u_radius;

    result += texture2D(u_texture, v_texcoord).rgb * 0.2270270270;
    result += texture2D(u_texture, v_texcoord + off1).rgb * 0.3162162162;
    result += texture2D(u_texture, v_texcoord - off1).rgb * 0.3162162162;
    result += texture2D(u_texture, v_texcoord + off2).rgb * 0.0702702703;
    result += texture2D(u_texture, v_texcoord - off2).rgb * 0.0702702703;
    result += texture2D(u_texture, v_texcoord + off3).rgb * 0.0162162162;
    result += texture2D(u_texture, v_texcoord - off3).rgb * 0.0162162162;

    gl_FragColor = vec4(result, 1.0);
}
`;
}

/**
 * Generate bloom combine fragment shader
 * Combines base HDR with bloom layer
 */
export function generateBloomCombineShader() {
    return `
precision highp float;

uniform sampler2D u_base;
uniform sampler2D u_bloom;
uniform float u_bloom_intensity;

varying vec2 v_texcoord;

void main() {
    vec3 baseColor = texture2D(u_base, v_texcoord).rgb;
    vec3 bloomColor = texture2D(u_bloom, v_texcoord).rgb;

    // Add bloom to base with intensity control
    vec3 result = baseColor + bloomColor * u_bloom_intensity;

    gl_FragColor = vec4(result, 1.0);
}
`;
}
