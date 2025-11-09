/**
 * Shared utility functions for UI controls
 * Formatting, scale inference, increment calculation, etc.
 */

/**
 * Create a scientific notation formatter
 * @param {number} precision - Number of decimal places in scientific notation
 * @param {number} threshold - Threshold for switching to scientific notation (default: 10)
 * @returns {function(number): string}
 */
export function createScientificFormatter(precision = 2, threshold = 10) {
    return (v) => {
        const absV = Math.abs(v);
        if (absV >= threshold || (absV < 1.0 / threshold && absV !== 0)) {
            return v.toExponential(precision);
        } else {
            return v.toFixed(precision + 1);
        }
    };
}

/**
 * Create a decimal formatter
 * @param {number} precision - Number of decimal places
 * @returns {function(number): string}
 */
export function createDecimalFormatter(precision = 2) {
    return (v) => v.toFixed(precision);
}

/**
 * Create an integer formatter
 * @returns {function(number): string}
 */
export function createIntegerFormatter() {
    return (v) => v.toFixed(0);
}

/**
 * Infer scale type from parameter range
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {number} step - Step size
 * @returns {'linear' | 'log' | 'adaptive'}
 */
export function inferScaleType(min, max, step) {
    // If min is positive and range spans multiple orders of magnitude, use adaptive/log
    if (min > 0 && max / min > 1000) {
        return 'adaptive';
    }
    return 'linear';
}

/**
 * Calculate adaptive increment based on current value
 * For wide-range parameters, increment should scale with magnitude
 *
 * @param {number} currentValue - Current value
 * @param {number} baseStep - Base step size (minimum increment)
 * @param {boolean} isLarge - Whether this is a large increment (10x)
 * @returns {number} Calculated increment
 */
export function calculateAdaptiveIncrement(currentValue, baseStep, isLarge = false) {
    const absValue = Math.abs(currentValue);

    // For very small values, use baseStep
    let increment = absValue < baseStep
        ? baseStep
        : Math.pow(10, Math.floor(Math.log10(absValue)) - 1);

    // Ensure we never go below baseStep
    increment = Math.max(baseStep, increment);

    // For large increments, multiply by 10
    if (isLarge) {
        increment *= 10;
    }

    return increment;
}

/**
 * Calculate logarithmic increment
 * For log-scale sliders, increment in slider space
 *
 * @param {boolean} isLarge - Whether this is a large increment (10x)
 * @returns {number} Slider space increment
 */
export function calculateLogIncrement(isLarge = false) {
    return isLarge ? 10 : 1;
}

/**
 * Calculate linear increment
 * @param {number} step - Step size
 * @param {boolean} isLarge - Whether this is a large increment (10x)
 * @returns {number} Calculated increment
 */
export function calculateLinearIncrement(step, isLarge = false) {
    return isLarge ? step * 10 : step;
}

/**
 * Create a formatter from parameter definition
 * @param {object} paramDef - Parameter definition
 * @returns {function(number): string}
 */
export function createFormatterFromDef(paramDef) {
    // If custom formatter provided, use it
    if (typeof paramDef.displayFormat === 'function') {
        return paramDef.displayFormat;
    }

    const precision = paramDef.displayPrecision ?? 2;

    // Parse string format types
    switch (paramDef.displayFormat) {
        case 'scientific':
            return createScientificFormatter(precision, paramDef.scientificThreshold ?? 10);
        case 'integer':
            return createIntegerFormatter();
        case 'decimal':
        default:
            return createDecimalFormatter(precision);
    }
}
