/**
 * Gradient generation for color mapping
 * Converts an array of color stops to GLSL interpolation code
 */

/**
 * Generate GLSL code for a color gradient
 * @param {Array} stops - Array of {position: float [0,1], color: [r, g, b] in [0,1]}
 * @returns {string} GLSL function code
 */
export function generateGradientGLSL(stops) {
    // Sort stops by position
    const sortedStops = [...stops].sort((a, b) => a.position - b.position);

    // Ensure we have at least 2 stops
    if (sortedStops.length < 2) {
        throw new Error('Gradient must have at least 2 color stops');
    }

    // Ensure positions are in [0, 1]
    sortedStops.forEach(stop => {
        if (stop.position < 0 || stop.position > 1) {
            throw new Error(`Stop position must be in [0, 1], got ${stop.position}`);
        }
    });

    // Generate piecewise linear interpolation code
    let code = `vec3 evaluateGradient(float t) {
    t = clamp(t, 0.0, 1.0);
`;

    // Generate if-else chain for each segment
    for (let i = 0; i < sortedStops.length - 1; i++) {
        const stop1 = sortedStops[i];
        const stop2 = sortedStops[i + 1];

        const color1 = formatColor(stop1.color);
        const color2 = formatColor(stop2.color);
        const pos1 = stop1.position.toFixed(6);
        const pos2 = stop2.position.toFixed(6);

        if (i === 0) {
            code += `    if (t <= ${pos2}) {\n`;
        } else if (i === sortedStops.length - 2) {
            code += `    } else {\n`;
        } else {
            code += `    } else if (t <= ${pos2}) {\n`;
        }

        // Linear interpolation between stops
        code += `        float segmentT = (t - ${pos1}) / (${pos2} - ${pos1});\n`;
        code += `        return mix(${color1}, ${color2}, segmentT);\n`;
    }

    code += `    }\n`;
    code += `}\n`;

    return code;
}

/**
 * Format a color array as GLSL vec3
 */
function formatColor(color) {
    return `vec3(${color[0].toFixed(6)}, ${color[1].toFixed(6)}, ${color[2].toFixed(6)})`;
}

/**
 * Create velocity magnitude gradient (blue → cyan → green → yellow → red)
 */
export function getVelocityMagnitudeGradient() {
    return [
        { position: 0.00, color: [0.0, 0.0, 1.0] }, // Blue
        { position: 0.25, color: [0.0, 1.0, 1.0] }, // Cyan
        { position: 0.50, color: [0.0, 1.0, 0.0] }, // Green
        { position: 0.75, color: [1.0, 1.0, 0.0] }, // Yellow
        { position: 1.00, color: [1.0, 0.0, 0.0] }  // Red
    ];
}

/**
 * Create spectrum gradient (rainbow: red → orange → yellow → green → cyan → blue → violet)
 */
export function getSpectrumGradient() {
    return [
        { position: 0.00, color: [1.0, 0.0, 0.0] },   // Red
        { position: 0.17, color: [1.0, 0.5, 0.0] },   // Orange
        { position: 0.33, color: [1.0, 1.0, 0.0] },   // Yellow
        { position: 0.50, color: [0.0, 1.0, 0.0] },   // Green
        { position: 0.67, color: [0.0, 1.0, 1.0] },   // Cyan
        { position: 0.83, color: [0.0, 0.0, 1.0] },   // Blue
        { position: 1.00, color: [0.5, 0.0, 1.0] }    // Violet
    ];
}

/**
 * Create HSV color wheel (for angle-based coloring, wraps around)
 * Red → Yellow → Green → Cyan → Blue → Magenta → back to Red
 */
export function getHSVGradient() {
    return [
        { position: 0.00, color: [1.0, 0.0, 0.0] },   // Red (0°)
        { position: 0.17, color: [1.0, 1.0, 0.0] },   // Yellow (60°)
        { position: 0.33, color: [0.0, 1.0, 0.0] },   // Green (120°)
        { position: 0.50, color: [0.0, 1.0, 1.0] },   // Cyan (180°)
        { position: 0.67, color: [0.0, 0.0, 1.0] },   // Blue (240°)
        { position: 0.83, color: [1.0, 0.0, 1.0] },   // Magenta (300°)
        { position: 1.00, color: [1.0, 0.0, 0.0] }    // Red (360° = 0°, wraps)
    ];
}

/**
 * Create default gradient (HSV color wheel, works for both angles and magnitudes)
 */
export function getDefaultGradient() {
    return getHSVGradient();
}

/**
 * Convert hex color string to RGB array [0,1]
 */
export function hexToRgb(hex) {
    // Remove # if present
    hex = hex.replace('#', '');

    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    return [r, g, b];
}

/**
 * Convert RGB array [0,1] to hex color string
 */
export function rgbToHex(rgb) {
    const r = Math.round(rgb[0] * 255).toString(16).padStart(2, '0');
    const g = Math.round(rgb[1] * 255).toString(16).padStart(2, '0');
    const b = Math.round(rgb[2] * 255).toString(16).padStart(2, '0');

    return `#${r}${g}${b}`;
}
