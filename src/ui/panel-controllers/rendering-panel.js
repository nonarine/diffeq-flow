/**
 * Rendering Panel Controller
 *
 * Manages the rendering settings floating panel including:
 * - Panel visibility and lifecycle
 * - White point visibility updates based on tonemap operator
 * - Button event handlers (open, close)
 * - Click-outside-to-close behavior
 * - Mobile panel manager integration
 *
 * Extracted from controls-v2.js as part of Phase 2 refactoring.
 */

import { PanelManager } from '../utils/panel-manager.js';
import { ZIndex } from '../utils/z-index.js';
import { updateWhitePointVisibility } from '../visibility-manager.js';

/**
 * Initialize rendering panel controller
 * @param {ControlManager} manager - The control manager instance
 * @returns {{showRenderingPanel: Function, hideRenderingPanel: Function}}
 */
export function initRenderingPanel(manager) {
    // Create panel manager for rendering panel (Phase 1 refactoring)
    const renderingPanelManager = new PanelManager('#rendering-panel', {
        zIndex: ZIndex.RENDERING_PANEL,
        onShow: () => {
            // Update white point visibility when panel is shown
            updateWhitePointVisibility(manager.get('tonemap-operator').getValue());
        }
    });

    function showRenderingPanel() {
        renderingPanelManager.show();
    }

    function hideRenderingPanel() {
        renderingPanelManager.hide();
    }

    // Open rendering settings button handler
    $('#open-rendering-settings').on('click', function() {
        showRenderingPanel();
    });

    // Close button handler (supports mobile panel manager)
    $('#rendering-panel .floating-panel-close').on('click', function() {
        // If opened via mobile menu, use mobile panel manager
        if (window.mobilePanelManager && window.mobilePanelManager.getCurrentPanel() === 'rendering') {
            window.mobilePanelManager.hidePanel('rendering');
        } else {
            // Otherwise use regular hide function
            hideRenderingPanel();
        }
    });

    // Close rendering panel when clicking outside
    $(document).on('click', function(e) {
        const panel = $('#rendering-panel');
        const renderingButton = $('#open-rendering-settings');
        const mobileRenderingButton = $('#mobile-menu-rendering');

        if ($(e.target).is(renderingButton) ||
            $(e.target).is(mobileRenderingButton) ||
            $(e.target).closest('#mobile-menu-rendering').length > 0 ||
            $(e.target).closest('#rendering-panel').length > 0) {
            // Don't close rendering panel
            return;
        }

        if (panel.is(':visible')) {
            hideRenderingPanel();
        }
    });

    // Prevent clicks inside rendering panel from closing it
    $('#rendering-panel').on('click', function(e) {
        e.stopPropagation();
    });

    return {
        showRenderingPanel,
        hideRenderingPanel,
        renderingPanelManager  // Export the PanelManager instance for mobile integration
    };
}
