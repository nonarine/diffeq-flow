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
vec3 getColor(${vecType} pos, ${vecType} velocity, ${vecType} field_velocity, ${vecType} velocity_proj) {
    return vec3(1.0, 1.0, 1.0);
}
`
        },
        velocity_magnitude: {
            name: 'Velocity Magnitude',
            usesMaxVelocity: true,
            usesGradient: true
        },
        velocity_angle: {
            name: 'Velocity Angle',
            usesGradient: true
        },
        velocity_combined: {
            name: 'Velocity Angle + Magnitude',
            usesMaxVelocity: true,
            usesGradient: true
        },
        field_magnitude: {
            name: 'Field Magnitude',
            usesMaxVelocity: true,
            usesGradient: true
        },
        field_angle: {
            name: 'Field Angle',
            usesGradient: true
        },
        field_combined: {
            name: 'Field Angle + Magnitude',
            usesMaxVelocity: true,
            usesGradient: true
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
// Inputs: pos (position vector), velocity (full N-D velocity), velocity_proj (projected 2D velocity)
// Output: RGB color vec3
vec3 getColor(${vecType} pos, ${vecType} velocity, ${vecType} field_velocity, ${vecType} velocity_proj) {
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
        varDecls.push(`float ${velocityVars[i]} = velocity.${swizzles[i]};`); // Use full N-D velocity
    }

    return `
${gradientGLSL}

vec3 getColor(${vecType} pos, ${vecType} velocity, ${vecType} field_velocity, ${vecType} velocity_proj) {
    // Unpack position and FULL velocity components for user expression
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
    // Use full N-dimensional velocity magnitude
    float speed = length(velocity);
    float normalized;
    if (u_velocity_log_scale > 0.5) {
        // Logarithmic scaling: log(1 + speed) / log(1 + max_velocity)
        normalized = clamp(log(1.0 + speed) / log(1.0 + max(u_max_velocity, 0.1)), 0.0, 1.0);
    } else {
        // Linear scaling
        normalized = clamp(speed / max(u_max_velocity, 0.1), 0.0, 1.0);
    }
    return evaluateGradient(normalized);`;
            break;

        case 'velocity_angle':
            valueExpression = `
    // Use projected 2D velocity angle
    float angle = atan(velocity_proj.y, velocity_proj.x);
    float hue = (angle + 3.14159265) / (2.0 * 3.14159265);
    return evaluateGradient(hue);`;
            break;

        case 'velocity_combined':
            valueExpression = `
    // Full velocity for magnitude, projected velocity for angle
    float speed = length(velocity);
    float angle = atan(velocity_proj.y, velocity_proj.x);
    float hue = (angle + 3.14159265) / (2.0 * 3.14159265);
    float saturation;
    if (u_velocity_log_scale > 0.5) {
        // Logarithmic scaling: log(1 + speed) / log(1 + max_velocity)
        saturation = clamp(log(1.0 + speed) / log(1.0 + max(u_max_velocity, 0.1)), 0.0, 1.0);
    } else {
        // Linear scaling
        saturation = clamp(speed / max(u_max_velocity, 0.1), 0.0, 1.0);
    }

    // Get color from gradient based on angle
    vec3 fullColor = evaluateGradient(hue);

    // Desaturate based on speed (slow → grey, fast → full color)
    const vec3 grey = vec3(0.5, 0.5, 0.5);
    return mix(grey, fullColor, saturation);`;
            break;

        case 'field_magnitude':
            valueExpression = `
    // Use field velocity magnitude
    float speed = length(field_velocity);
    float normalized;
    if (u_velocity_log_scale > 0.5) {
        normalized = clamp(log(1.0 + speed) / log(1.0 + max(u_max_velocity, 0.1)), 0.0, 1.0);
    } else {
        normalized = clamp(speed / max(u_max_velocity, 0.1), 0.0, 1.0);
    }
    return evaluateGradient(normalized);`;
            break;

        case 'field_angle':
            valueExpression = `
    // Use field velocity angle in 2D
    vec2 field_2d = vec2(field_velocity.x, field_velocity.y);
    float angle = atan(field_2d.y, field_2d.x);
    float hue = (angle + 3.14159265) / (2.0 * 3.14159265);
    return evaluateGradient(hue);`;
            break;

        case 'field_combined':
            valueExpression = `
    // Field velocity for both magnitude and angle
    float speed = length(field_velocity);
    vec2 field_2d = vec2(field_velocity.x, field_velocity.y);
    float angle = atan(field_2d.y, field_2d.x);
    float hue = (angle + 3.14159265) / (2.0 * 3.14159265);
    float saturation;
    if (u_velocity_log_scale > 0.5) {
        saturation = clamp(log(1.0 + speed) / log(1.0 + max(u_max_velocity, 0.1)), 0.0, 1.0);
    } else {
        saturation = clamp(speed / max(u_max_velocity, 0.1), 0.0, 1.0);
    }

    vec3 fullColor = evaluateGradient(hue);
    const vec3 grey = vec3(0.5, 0.5, 0.5);
    return mix(grey, fullColor, saturation);`;
            break;

        default:
            throw new Error(`Cannot create gradient version of color mode: ${modeName}`);
    }

    return `
${gradientGLSL}

vec3 getColor(${vecType} pos, ${vecType} velocity, ${vecType} field_velocity, ${vecType} velocity_proj) {
    ${valueExpression}
}
`;
}
