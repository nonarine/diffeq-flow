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

    // Enable click-outside-to-close behavior
    renderingPanelManager.enableClickOutside([
        '#open-rendering-settings',
        '#mobile-menu-rendering'
    ]);

    return {
        showRenderingPanel,
        hideRenderingPanel,
        renderingPanelManager  // Export the PanelManager instance for mobile integration
    };
}
