/**
 * Control Visibility Management
 *
 * Handles show/hide logic for UI controls based on other control states.
 * Pure UI visibility functions with no state management.
 */

/**
 * Update white point visibility based on tonemap operator
 * @param {string} operator - The selected tonemap operator
 */
export function updateWhitePointVisibility(operator) {
    const operatorsWithWhitePoint = ['reinhard_extended', 'uncharted2', 'hable', 'luminance_extended'];
    const showWhitePoint = operatorsWithWhitePoint.includes(operator);
    $('#white-point-control').toggle(showWhitePoint);
}

/**
 * Update expression controls visibility based on color mode
 * @param {string} colorMode - The selected color mode
 */
export function updateExpressionControls(colorMode) {
    if (colorMode === 'expression') {
        $('#expression-controls').show();
    } else {
        $('#expression-controls').hide();
    }
}

/**
 * Update gradient button visibility based on color mode
 * @param {string} colorMode - The selected color mode
 */
export function updateGradientButtonVisibility(colorMode) {
    const supportsGradient = colorMode === 'expression' ||
                              colorMode === 'velocity_magnitude' ||
                              colorMode === 'velocity_angle' ||
                              colorMode === 'velocity_combined';

    if (supportsGradient) {
        $('#gradient-button-container').show();
    } else {
        $('#gradient-button-container').hide();
    }

    // Show/hide preset toggle based on mode
    if (colorMode === 'expression') {
        $('#gradient-preset-toggle').hide();
    } else {
        $('#gradient-preset-toggle').show();
    }
}

/**
 * Update velocity scaling controls visibility based on color mode
 * @param {string} colorMode - The selected color mode
 */
export function updateVelocityScalingVisibility(colorMode) {
    const usesVelocity = colorMode === 'velocity_magnitude' ||
                         colorMode === 'velocity_combined';

    if (usesVelocity) {
        $('#velocity-scaling-container').show();
        $('#velocity-log-container').show();
    } else {
        $('#velocity-scaling-container').hide();
        $('#velocity-log-container').hide();
    }
}
