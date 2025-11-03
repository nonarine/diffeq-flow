/**
 * Color mode definitions for particle rendering
 */

export function getColorMode(name, dimensions) {
    const vecType = `vec${dimensions}`;

    const modes = {
        white: {
            name: 'Solid White',
            code: `
// Simple solid white particles
vec3 getColor(${vecType} pos, ${vecType} velocity) {
    return vec3(1.0, 1.0, 1.0);
}
`
        },
        velocity_magnitude: {
            name: 'Velocity Magnitude',
            usesMaxVelocity: true,
            code: `
// Color based on speed (velocity magnitude)
// Dynamically scaled against fastest particle
vec3 getColor(${vecType} pos, ${vecType} velocity) {
    float speed = length(velocity);

    // Normalize speed to [0, 1] range using max velocity
    // Add small epsilon to avoid division by zero
    float normalized = clamp(speed / max(u_max_velocity, 0.1), 0.0, 1.0);

    // Create color gradient: blue (slow) -> cyan -> green -> yellow -> red (fast)
    vec3 color;
    if (normalized < 0.25) {
        // Blue to cyan
        color = mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), normalized * 4.0);
    } else if (normalized < 0.5) {
        // Cyan to green
        color = mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 1.0, 0.0), (normalized - 0.25) * 4.0);
    } else if (normalized < 0.75) {
        // Green to yellow
        color = mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 1.0, 0.0), (normalized - 0.5) * 4.0);
    } else {
        // Yellow to red
        color = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), (normalized - 0.75) * 4.0);
    }

    return color;
}
`
        },
        velocity_angle: {
            name: 'Velocity Angle',
            code: `
// Color based on velocity direction
vec3 getColor(${vecType} pos, ${vecType} velocity) {
    // Use angle of velocity in x-y plane
    float angle = atan(velocity.y, velocity.x);

    // Convert angle [-π, π] to hue [0, 1]
    float hue = (angle + 3.14159265) / (2.0 * 3.14159265);

    // HSV to RGB conversion (saturation = 1, value = 1)
    float h = hue * 6.0;
    float x = 1.0 - abs(mod(h, 2.0) - 1.0);

    vec3 color;
    if (h < 1.0) color = vec3(1.0, x, 0.0);
    else if (h < 2.0) color = vec3(x, 1.0, 0.0);
    else if (h < 3.0) color = vec3(0.0, 1.0, x);
    else if (h < 4.0) color = vec3(0.0, x, 1.0);
    else if (h < 5.0) color = vec3(x, 0.0, 1.0);
    else color = vec3(1.0, 0.0, x);

    return color;
}
`
        },
        velocity_combined: {
            name: 'Velocity Angle + Magnitude',
            usesMaxVelocity: true,
            code: `
// Color by angle, saturation by magnitude
vec3 getColor(${vecType} pos, ${vecType} velocity) {
    float speed = length(velocity);

    // Use angle of velocity in x-y plane for hue
    float angle = atan(velocity.y, velocity.x);
    float hue = (angle + 3.14159265) / (2.0 * 3.14159265);

    // Normalize speed to [0, 1] for saturation
    float saturation = clamp(speed / max(u_max_velocity, 0.1), 0.0, 1.0);

    // HSV to RGB conversion with variable saturation (value = 1)
    float h = hue * 6.0;
    float c = saturation; // Chroma
    float x = c * (1.0 - abs(mod(h, 2.0) - 1.0));

    vec3 rgb;
    if (h < 1.0) rgb = vec3(c, x, 0.0);
    else if (h < 2.0) rgb = vec3(x, c, 0.0);
    else if (h < 3.0) rgb = vec3(0.0, c, x);
    else if (h < 4.0) rgb = vec3(0.0, x, c);
    else if (h < 5.0) rgb = vec3(x, 0.0, c);
    else rgb = vec3(c, 0.0, x);

    // Mix with neutral grey to desaturate (slow particles → grey, fast → vibrant)
    const vec3 grey = vec3(0.5, 0.5, 0.5);
    vec3 color = rgb + grey * (1.0 - saturation);

    return color;
}
`
        },
        expression: {
            name: 'Expression',
            usesMaxVelocity: false,
            requiresExpression: true,
            // Code will be generated dynamically based on user's expression
            code: null
        },
        custom: {
            name: 'Custom (Advanced)',
            code: `
// Custom color function
// Inputs: pos (position vector), velocity (velocity vector)
// Output: RGB color vec3
vec3 getColor(${vecType} pos, ${vecType} velocity) {
    return vec3(1.0, 1.0, 1.0);
}
`
        }
    };

    const mode = modes[name];
    if (!mode) {
        throw new Error(`Unknown color mode: ${name}`);
    }

    return mode;
}

/**
 * Generate expression-based color mode code
 * @param {number} dimensions - Number of dimensions
 * @param {string} expressionGLSL - Compiled user expression GLSL code
 * @param {string} gradientGLSL - Generated gradient function code
 * @returns {string} GLSL color function code
 */
export function generateExpressionColorMode(dimensions, expressionGLSL, gradientGLSL) {
    const vecType = `vec${dimensions}`;

    // Generate variable declarations for position and velocity components
    const varDecls = [];
    const swizzles = ['x', 'y', 'z', 'w', 'u', 'v'];
    const velocityVars = ['dx', 'dy', 'dz', 'dw', 'du', 'dv'];

    for (let i = 0; i < dimensions; i++) {
        varDecls.push(`float ${swizzles[i]} = pos.${swizzles[i]};`);
        varDecls.push(`float ${velocityVars[i]} = velocity.${swizzles[i]};`);
    }

    return `
${gradientGLSL}

vec3 getColor(${vecType} pos, ${vecType} velocity) {
    // Unpack position and velocity components for user expression
    ${varDecls.join('\n    ')}

    // Evaluate user expression
    float value = ${expressionGLSL};

    // Map through gradient
    return evaluateGradient(value);
}
`;
}

/**
 * Generate gradient-based version of a preset color mode
 * @param {string} modeName - Name of the color mode
 * @param {number} dimensions - Number of dimensions
 * @param {string} gradientGLSL - Generated gradient function code
 * @returns {string} GLSL color function code
 */
export function generateGradientColorMode(modeName, dimensions, gradientGLSL) {
    const vecType = `vec${dimensions}`;

    let valueExpression;

    switch (modeName) {
        case 'velocity_magnitude':
            valueExpression = `
    float speed = length(velocity);
    float normalized = clamp(speed / max(u_max_velocity, 0.1), 0.0, 1.0);
    return evaluateGradient(normalized);`;
            break;

        case 'velocity_angle':
            valueExpression = `
    float angle = atan(velocity.y, velocity.x);
    float hue = (angle + 3.14159265) / (2.0 * 3.14159265);
    return evaluateGradient(hue);`;
            break;

        case 'velocity_combined':
            valueExpression = `
    float speed = length(velocity);
    float angle = atan(velocity.y, velocity.x);
    float hue = (angle + 3.14159265) / (2.0 * 3.14159265);
    float saturation = clamp(speed / max(u_max_velocity, 0.1), 0.0, 1.0);

    // Get color from gradient based on angle
    vec3 fullColor = evaluateGradient(hue);

    // Desaturate based on speed (slow → grey, fast → full color)
    const vec3 grey = vec3(0.5, 0.5, 0.5);
    return mix(grey, fullColor, saturation);`;
            break;

        default:
            throw new Error(`Cannot create gradient version of color mode: ${modeName}`);
    }

    return `
${gradientGLSL}

vec3 getColor(${vecType} pos, ${vecType} velocity) {
    ${valueExpression}
}
`;
}
