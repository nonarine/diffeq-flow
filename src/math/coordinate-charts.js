/**
 * Coordinate Chart Generation
 *
 * Automatically detects singularities in coordinate transforms (primarily atan2)
 * and generates multiple coordinate charts to avoid numerical issues near singularities.
 *
 * Uses the "atlas" approach from differential geometry: cover the space with
 * multiple charts, each with singularities in different locations.
 */

/**
 * Detect atan2(A, B) patterns in an expression
 * @param {string} expression - Math expression to analyze
 * @returns {Array<{numerator, denominator, fullMatch}>} - Array of atan2 patterns found
 */
export function detectAtan2Patterns(expression) {
    const patterns = [];
    const regex = /atan2\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g;

    let match;
    while ((match = regex.exec(expression)) !== null) {
        patterns.push({
            fullMatch: match[0],
            numerator: match[1].trim(),
            denominator: match[2].trim()
        });
    }

    return patterns;
}

/**
 * Generate an alternative chart by swapping atan2 arguments
 * For atan2(y, x) → generate chart with π/2 - atan2(x, y)
 *
 * @param {Array<string>} forwardTransforms - Original coordinate transforms
 * @param {Object} atan2Info - {numerator, denominator, fullMatch}
 * @returns {Object} - {condition, forwardTransforms}
 */
export function generateAlternativeChart(forwardTransforms, atan2Info) {
    const {numerator, denominator, fullMatch} = atan2Info;

    // Swap arguments and adjust angle
    // θ = atan2(y, x) becomes θ = π/2 - atan2(x, y)
    const swappedAtan2 = `PI/2 - atan2(${denominator}, ${numerator})`;

    // Replace in all transforms
    const alternativeTransforms = forwardTransforms.map(expr =>
        expr.replace(fullMatch, swappedAtan2)
    );

    // Condition: use this chart when |denominator| <= |numerator|
    // (i.e., when the original chart would have small denominator)
    const condition = `abs(${denominator}) <= abs(${numerator})`;

    return {
        condition,
        forwardTransforms: alternativeTransforms
    };
}

/**
 * Generate multiple coordinate charts to handle singularities
 *
 * Strategy:
 * - For 2D/cylindrical with atan2(y, x): Generate 2 charts (x-dominant vs y-dominant)
 * - For spherical with multiple atan2s: Generate 4-6 charts as needed
 *
 * @param {Array<string>} forwardTransforms - Original coordinate transform expressions
 * @param {number} dimensions - Number of dimensions
 * @returns {Array<{condition, forwardTransforms}>} - Array of charts
 */
export function generateCharts(forwardTransforms, dimensions) {
    const charts = [];

    // Find all atan2 patterns across all transforms
    const allAtan2Patterns = [];
    forwardTransforms.forEach((expr, index) => {
        const patterns = detectAtan2Patterns(expr);
        patterns.forEach(pattern => {
            allAtan2Patterns.push({...pattern, transformIndex: index});
        });
    });

    // No atan2 found - single chart covers everything
    if (allAtan2Patterns.length === 0) {
        return [{
            condition: 'true',
            forwardTransforms
        }];
    }

    // Handle 2D/3D-cylindrical case (single atan2)
    if (dimensions === 2 || (dimensions === 3 && allAtan2Patterns.length === 1)) {
        const atan2Info = allAtan2Patterns[0];

        // Chart 1: Original (good when denominator is large)
        charts.push({
            condition: `abs(${atan2Info.denominator}) >= abs(${atan2Info.numerator})`,
            forwardTransforms: forwardTransforms
        });

        // Chart 2: Swapped (good when numerator is large)
        charts.push(generateAlternativeChart(forwardTransforms, atan2Info));

        return charts;
    }

    // Handle spherical case (multiple atan2s or complex patterns)
    if (dimensions === 3 && allAtan2Patterns.length >= 2) {
        // For standard spherical (r, θ, φ) with atan2 in azimuthal angle
        // We need to consider both polar angle regions AND azimuthal regions

        // Find the azimuthal atan2 (usually the last one, typically atan2(y, x))
        const azimuthalAtan2 = allAtan2Patterns[allAtan2Patterns.length - 1];

        // Simple strategy: Generate 2 charts based on azimuthal angle
        // More sophisticated approach would handle polar angle singularities too

        // Chart 1: Original
        charts.push({
            condition: `abs(${azimuthalAtan2.denominator}) >= abs(${azimuthalAtan2.numerator})`,
            forwardTransforms: forwardTransforms
        });

        // Chart 2: Swapped azimuthal
        charts.push(generateAlternativeChart(forwardTransforms, azimuthalAtan2));

        return charts;
    }

    // Fallback: single chart
    return [{
        condition: 'true',
        forwardTransforms
    }];
}

/**
 * Generate GLSL condition expression from JavaScript condition string
 * Converts variable names to GLSL pos.x, pos.y, pos.z format
 *
 * @param {string} condition - Condition like "abs(x) >= abs(y)"
 * @param {Array<string>} cartesianVars - Variable names ['x', 'y', 'z']
 * @returns {string} - GLSL condition like "abs(pos.x) >= abs(pos.y)"
 */
export function generateGLSLCondition(condition, cartesianVars) {
    if (condition === 'true') {
        return 'true';
    }

    let glslCondition = condition;

    // Replace each Cartesian variable with pos.x, pos.y, etc.
    cartesianVars.forEach((varName, index) => {
        const swizzle = ['x', 'y', 'z', 'w'][index];
        // Use word boundaries to avoid replacing 'x' in 'exp'
        const regex = new RegExp(`\\b${varName}\\b`, 'g');
        glslCondition = glslCondition.replace(regex, `pos.${swizzle}`);
    });

    // Convert PI to 3.14159265359
    glslCondition = glslCondition.replace(/\bPI\b/g, '3.14159265359');

    return glslCondition;
}
