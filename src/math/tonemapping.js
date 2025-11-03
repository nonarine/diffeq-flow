/**
 * Tone Mapping Operators
 * Compresses HDR [0, ∞) color values into displayable LDR [0, 1] range
 */

/**
 * Get tone mapping operator by name
 * @param {string} name - Operator name
 * @returns {Object} Operator definition with name, description, code generator
 */
export function getToneMapper(name) {
    const operators = {
        linear: {
            name: 'Linear (No Tone Mapping)',
            description: 'Direct exposure and gamma, no compression. Values > 1 will clip.',
            usesWhitePoint: false,
            defaultExposure: 1.0
        },
        reinhard: {
            name: 'Reinhard',
            description: 'Simple, preserves hues. Formula: color / (1 + color)',
            usesWhitePoint: false,
            defaultExposure: 1.0
        },
        reinhard_extended: {
            name: 'Reinhard Extended',
            description: 'Reinhard with adjustable white point for highlight control',
            usesWhitePoint: true,
            defaultExposure: 1.0,
            defaultWhitePoint: 2.0
        },
        filmic: {
            name: 'Filmic (ACES Approximation)',
            description: 'Film-like S-curve, industry standard look',
            usesWhitePoint: false,
            defaultExposure: 1.0
        },
        uncharted2: {
            name: 'Uncharted 2',
            description: 'Popular in games, punchy highlights and saturated colors',
            usesWhitePoint: true,
            defaultExposure: 2.0,
            defaultWhitePoint: 11.2
        },
        aces: {
            name: 'ACES (Academy Color)',
            description: 'Academy standard, natural film-like response',
            usesWhitePoint: false,
            defaultExposure: 1.0
        },
        hable: {
            name: 'Hable (Uncharted 2 Filmic)',
            description: 'John Hable\'s filmic curve, excellent highlight rolloff',
            usesWhitePoint: true,
            defaultExposure: 2.0,
            defaultWhitePoint: 11.2
        },
        luminance_reinhard: {
            name: 'Luminance Reinhard (Hue Preserving)',
            description: 'Tone maps brightness only, preserves color hue/saturation perfectly. Ideal for attractors.',
            usesWhitePoint: false,
            defaultExposure: 1.0
        },
        luminance_extended: {
            name: 'Luminance Extended (Hue Preserving)',
            description: 'Extended Reinhard on luminance only. Best for colorful attractor density visualization.',
            usesWhitePoint: true,
            defaultExposure: 1.0,
            defaultWhitePoint: 5.0
        }
    };

    return operators[name] || operators.linear;
}

/**
 * Generate GLSL code for tone mapping operator
 * @param {string} operatorName - Name of the operator
 * @param {Object} params - Parameters (exposure, gamma, whitePoint, etc.)
 * @returns {string} GLSL shader code
 */
export function generateTonemapGLSL(operatorName, params = {}) {
    const operator = getToneMapper(operatorName);

    // Default parameters
    const exposure = params.exposure !== undefined ? params.exposure : operator.defaultExposure;
    const gamma = params.gamma !== undefined ? params.gamma : 2.2;
    const whitePoint = params.whitePoint !== undefined ? params.whitePoint : (operator.defaultWhitePoint || 1.0);

    let code = `
// Tone mapping operator: ${operator.name}
// ${operator.description}

`;

    // Generate operator-specific functions
    switch (operatorName) {
        case 'linear':
            code += `
vec3 tonemap(vec3 color) {
    // Simple exposure, no compression
    return color * ${exposure.toFixed(6)};
}
`;
            break;

        case 'reinhard':
            code += `
vec3 tonemap(vec3 color) {
    // Reinhard tone mapping: color / (1 + color)
    color *= ${exposure.toFixed(6)};
    return color / (vec3(1.0) + color);
}
`;
            break;

        case 'reinhard_extended':
            code += `
vec3 tonemap(vec3 color) {
    // Reinhard with white point
    color *= ${exposure.toFixed(6)};
    float whitePoint = ${whitePoint.toFixed(6)};
    vec3 numerator = color * (vec3(1.0) + (color / (whitePoint * whitePoint)));
    return numerator / (vec3(1.0) + color);
}
`;
            break;

        case 'filmic':
        case 'aces':
            code += `
// ACES approximation (simplified)
vec3 tonemap(vec3 color) {
    color *= ${exposure.toFixed(6)};

    // ACES fitted curve
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;

    return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
}
`;
            break;

        case 'uncharted2':
        case 'hable':
            code += `
// Uncharted 2 filmic tone mapping by John Hable
vec3 uncharted2Curve(vec3 x) {
    const float A = 0.15; // Shoulder strength
    const float B = 0.50; // Linear strength
    const float C = 0.10; // Linear angle
    const float D = 0.20; // Toe strength
    const float E = 0.02; // Toe numerator
    const float F = 0.30; // Toe denominator
    return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
}

vec3 tonemap(vec3 color) {
    color *= ${exposure.toFixed(6)};

    // Apply curve
    vec3 curr = uncharted2Curve(color);

    // White point scaling
    float whitePoint = ${whitePoint.toFixed(6)};
    vec3 whiteScale = vec3(1.0) / uncharted2Curve(vec3(whitePoint));

    return curr * whiteScale;
}
`;
            break;

        case 'luminance_reinhard':
            code += `
// Luminance-based Reinhard (hue-preserving)
// Tone maps brightness only, keeps color ratios intact
vec3 tonemap(vec3 color) {
    color *= ${exposure.toFixed(6)};

    // Calculate luminance (Rec. 709)
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));

    // Avoid division by zero
    if (luma < 0.0001) return vec3(0.0);

    // Apply Reinhard to luminance only
    float toneMappedLuma = luma / (1.0 + luma);

    // Scale color to match tone-mapped luminance
    // This preserves hue and saturation perfectly
    return color * (toneMappedLuma / luma);
}
`;
            break;

        case 'luminance_extended':
            code += `
// Luminance-based Extended Reinhard (hue-preserving)
// Best for attractor visualization with dense bright regions
vec3 tonemap(vec3 color) {
    color *= ${exposure.toFixed(6)};

    // Calculate luminance (Rec. 709)
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));

    // Avoid division by zero
    if (luma < 0.0001) return vec3(0.0);

    // Extended Reinhard with white point on luminance only
    float whitePoint = ${whitePoint.toFixed(6)};
    float numerator = luma * (1.0 + (luma / (whitePoint * whitePoint)));
    float toneMappedLuma = numerator / (1.0 + luma);

    // Scale color to match tone-mapped luminance
    // This preserves hue and saturation perfectly
    return color * (toneMappedLuma / luma);
}
`;
            break;

        default:
            // Fallback to linear
            code += `
vec3 tonemap(vec3 color) {
    return color * ${exposure.toFixed(6)};
}
`;
    }

    // Add gamma correction
    code += `
vec3 applyGamma(vec3 color) {
    return pow(color, vec3(1.0 / ${gamma.toFixed(6)}));
}
`;

    return code;
}

/**
 * Get list of all available operators
 * @returns {Array} Array of {key, name, description} objects
 */
export function getAvailableOperators() {
    return [
        { key: 'linear', name: 'Linear (No Tone Mapping)', description: 'Direct mapping, clips at 1.0' },
        { key: 'reinhard', name: 'Reinhard', description: 'Simple, preserves hues' },
        { key: 'reinhard_extended', name: 'Reinhard Extended', description: 'With white point control' },
        { key: 'luminance_reinhard', name: 'Luminance Reinhard', description: 'Hue-preserving, ideal for attractors' },
        { key: 'luminance_extended', name: 'Luminance Extended', description: 'Best for colorful attractor visualization' },
        { key: 'filmic', name: 'Filmic (ACES)', description: 'Film-like, industry standard' },
        { key: 'uncharted2', name: 'Uncharted 2', description: 'Game-style, punchy' },
        { key: 'aces', name: 'ACES', description: 'Academy standard' },
        { key: 'hable', name: 'Hable Filmic', description: 'Excellent highlights' }
    ];
}

/**
 * Calculate luminance from RGB color
 * Used for exposure adjustment
 * @param {Array} rgb - [r, g, b] in [0, 1]
 * @returns {number} Luminance value
 */
export function luminance(rgb) {
    // Rec. 709 luma coefficients
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
