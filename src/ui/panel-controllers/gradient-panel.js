/**
 * Gradient Panel Controller
 *
 * Manages the gradient editor floating panel including:
 * - Panel visibility and lifecycle
 * - Gradient editor initialization and updates
 * - Button event handlers (open, reset)
 * - Click-outside-to-close behavior
 * - Gradient button visibility based on color mode
 *
 * Extracted from controls-v2.js as part of Phase 2 refactoring.
 */

import { PanelManager } from '../utils/panel-manager.js';
import { ZIndex } from '../utils/z-index.js';
import { initGradientEditor } from '../gradient-editor.js';
import { getDefaultGradient } from '../../math/gradients.js';

/**
 * Update gradient button visibility based on color mode
 * @param {string} colorMode - Current color mode
 */
function updateGradientButtonVisibility(colorMode) {
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
 * Initialize gradient panel controller
 * @param {ControlManager} manager - The control manager instance
 * @param {GradientControl} gradientControl - The gradient control instance
 * @returns {{showGradientPanel: Function, hideGradientPanel: Function, gradientEditor: Object|null}}
 */
export function initGradientPanel(manager, gradientControl) {
    let gradientEditor = null;

    // Create panel manager for gradient panel (Phase 1 refactoring)
    const gradientPanelManager = new PanelManager('#gradient-panel', {
        zIndex: ZIndex.GRADIENT_PANEL,
        onShow: () => {
            updateGradientButtonVisibility(manager.get('color-mode').getValue());

            // Initialize gradient editor if not already done
            if (!gradientEditor) {
                gradientEditor = initGradientEditor(
                    'main-gradient-editor',
                    gradientControl.getValue(),
                    (newGradient) => {
                        gradientControl.notifyChange(newGradient);
                    }
                );
                gradientControl.setGradientEditor(gradientEditor);
            } else {
                // Update gradient if it changed while editor was hidden
                gradientEditor.setGradient(gradientControl.getValue());
            }
        }
    });

    function showGradientPanel() {
        gradientPanelManager.show();
    }

    function hideGradientPanel() {
        gradientPanelManager.hide();
    }

    // Open gradient editor button
    $('#open-gradient-editor').on('click', function() {
        showGradientPanel();
    });

    // Reset gradient to default button
    $('#reset-gradient').on('click', function() {
        const defaultGradient = getDefaultGradient();
        if (gradientEditor) {
            gradientEditor.setGradient(defaultGradient);
            gradientControl.notifyChange(defaultGradient);
        }
    });

    // Close gradient panel when clicking outside
    $(document).on('click', function(e) {
        const panel = $('#gradient-panel');
        const openButton = $('#open-gradient-editor');

        if ($(e.target).is(openButton) ||
            $(e.target).closest('#gradient-panel').length > 0) {
            return;
        }

        if (panel.is(':visible')) {
            hideGradientPanel();
        }
    });

    // Prevent clicks inside gradient panel from closing it
    $('#gradient-panel').on('click', function(e) {
        e.stopPropagation();
    });

    return {
        showGradientPanel,
        hideGradientPanel,
        gradientEditor
    };
}
