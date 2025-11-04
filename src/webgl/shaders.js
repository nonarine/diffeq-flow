/**
 * Shader templates and compilation utilities
 */

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
 */
export function generateUpdateFragmentShader(dimensions, velocityExpressions, integratorCode, strategy) {
    // Generate uniforms for position textures
    const positionUniforms = Array.from({ length: dimensions }, (_, i) =>
        `uniform sampler2D u_pos_${i};`
    ).join('\n');

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

    return `
precision highp float;

${strategy.getGLSLConstants()}
${strategy.getGLSLDecodeFunction()}
${strategy.getGLSLEncodeFunction()}
${strategy.getGLSLNormalizeFunction()}
${strategy.getGLSLDenormalizeFunction()}

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

    // Integrate to get new position (in world coordinates)
    ${vecType} new_pos = integrate(pos, u_h);

    // Calculate velocity at new position for low-velocity dropping
    ${vecType} velocity = get_velocity(new_pos);
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
    if (drop_chance < u_drop_rate || outside || too_slow) {
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
export function generateDrawVertexShader(dimensions, mapperCode, velocityExpressions, strategy) {
    const positionUniforms = Array.from({ length: dimensions }, (_, i) =>
        `uniform sampler2D u_pos_${i};`
    ).join('\n');

    const vecType = `vec${dimensions}`;

    // Generate velocity function
    const swizzles = ['x', 'y', 'z', 'w'];
    const velocityComponents = velocityExpressions.map((expr, i) =>
        `    result.${swizzles[i]} = ${expr};`
    ).join('\n');

    return `
precision highp float;

${strategy.getGLSLConstants()}
${strategy.getGLSLDecodeFunction()}
${strategy.getGLSLDenormalizeFunction()}

attribute float a_index;

${positionUniforms}

uniform float u_particles_res;
uniform vec2 u_min;
uniform vec2 u_max;

varying vec${dimensions} v_pos;
varying vec${dimensions} v_velocity;

${mapperCode}

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

void main() {
    // Calculate texture coordinate from particle index
    // Add 0.5 to sample from texel centers
    vec2 texcoord = vec2(
        (mod(a_index, u_particles_res) + 0.5) / u_particles_res,
        (floor(a_index / u_particles_res) + 0.5) / u_particles_res
    );

    // Read position from textures and denormalize to world coordinates
    ${vecType} pos;
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

    // Calculate velocity for coloring
    ${vecType} velocity = get_velocity(pos);

    // Pass to fragment shader
    v_pos = pos;
    v_velocity = velocity;

    // Project to 3D (with depth)
    vec3 pos_3d = project_to_3d(pos);

    // Map to screen space
    vec2 normalized = (pos_3d.xy - u_min) / (u_max - u_min);

    // Use depth value (normalized to [-1, 1] range)
    // For now, assume depth is in similar range to x/y coordinates
    float depth_normalized = (pos_3d.z - (u_min.x + u_min.y) * 0.5) / ((u_max.x - u_min.x + u_max.y - u_min.y) * 0.5);
    depth_normalized = clamp(depth_normalized, -1.0, 1.0);

    gl_Position = vec4(normalized * 2.0 - 1.0, depth_normalized, 1.0);
    gl_PointSize = 1.0;
}
`;
}

/**
 * Generate particle rendering fragment shader
 */
export function generateDrawFragmentShader(dimensions, colorCode, usesMaxVelocity) {
    return `
precision highp float;

varying vec${dimensions} v_pos;
varying vec${dimensions} v_velocity;

${usesMaxVelocity ? 'uniform float u_max_velocity;' : ''}
uniform float u_particle_intensity;
uniform float u_color_saturation;

${colorCode}

void main() {
    // Get color based on position and velocity
    vec3 color = getColor(v_pos, v_velocity);

    // Apply saturation adjustment (for attractor visualization)
    // 0.0 = grayscale, 1.0 = full saturation
    if (u_color_saturation < 1.0) {
        float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
        vec3 grayscale = vec3(luminance);
        color = mix(grayscale, color, u_color_saturation);
    }

    // Scale by intensity for HDR (allows colors > 1.0)
    color *= u_particle_intensity;

    // Alpha blending allows proper fade to black
    gl_FragColor = vec4(color, 0.35);
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

    // Apply tone mapping operator
    vec3 tonemapped = tonemap(hdrColor);

    // Apply brightness-based desaturation (before gamma)
    // Desaturates bright regions to prevent RGB channel clipping
    if (u_brightness_desat > 0.0) {
        // Calculate brightness (Rec. 709 luminance)
        float brightness = dot(tonemapped, vec3(0.2126, 0.7152, 0.0722));

        // Smooth transition: start desaturating at 0.3 brightness, full at 0.75
        // This catches bright regions early before they hit RGB max
        float desatFactor = smoothstep(0.3, 0.75, brightness) * u_brightness_desat;

        // Blend toward grayscale based on brightness
        vec3 gray = vec3(brightness);
        tonemapped = mix(tonemapped, gray, desatFactor);
    }

    // Apply gamma correction
    vec3 ldrColor = applyGamma(tonemapped);

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
