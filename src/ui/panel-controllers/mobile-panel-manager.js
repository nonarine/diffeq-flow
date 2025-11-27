/**
 * Mobile Panel Manager
 *
 * Manages mobile overlay panels and their interactions:
 * - Controls panel (main UI controls)
 * - Rendering panel (floating panel via PanelManager)
 * - Mobile menu buttons and close buttons
 * - Z-index management for proper layering
 * - Integration with rendering panel manager
 * - Mobile controls component synchronization
 */

import { logger } from '../../utils/debug-logger.js';
import { ZIndex } from '../utils/z-index.js';

/**
 * Initialize mobile panel manager
 * @param {PanelManager} renderingPanelManager - The rendering panel manager instance
 * @returns {Object} Mobile panel manager API
 */
export function initMobilePanelManager(renderingPanelManager) {
    const panels = {
        'controls': $('#controls'),
        'rendering': $('#rendering-panel')
    };

    let currentPanel = null;

    /**
     * Show a mobile panel
     * @param {string} panelName - Name of panel to show ('controls' or 'rendering')
     */
    function showPanel(panelName) {
        // Hide any currently open panel
        if (currentPanel) {
            hidePanel(currentPanel);
        }

        const panel = panels[panelName];
        if (!panel) {
            logger.warn(`Mobile panel not found: ${panelName}`);
            return;
        }

        // For floating panels (rendering), use panel manager
        // For main panels (controls), add mobile overlay class
        if (panelName === 'rendering') {
            // Use the rendering panel manager (Phase 1 refactoring)
            renderingPanelManager.show();
        } else {
            panel.addClass('mobile-overlay active');
            panel.find('.mobile-overlay-close').show();
            // Force z-index for mobile (ensure above menu bar)
            panel.css('z-index', ZIndex.MOBILE_PANEL);
            panel.find('.mobile-overlay-close').css('z-index', ZIndex.CLOSE_BUTTON);
            $('#menu-bar').css('z-index', ZIndex.MENU_BAR_LOWERED);
        }

        // Mark menu button as active
        $(`#mobile-menu-${panelName}`).addClass('active');

        currentPanel = panelName;
    }

    /**
     * Hide a mobile panel
     * @param {string} panelName - Name of panel to hide
     */
    function hidePanel(panelName) {
        const panel = panels[panelName];
        if (!panel) return;

        // For floating panels, use panel manager
        // For main panels, remove mobile overlay class
        if (panelName === 'rendering') {
            // Use the rendering panel manager (Phase 1 refactoring)
            renderingPanelManager.hide();
        } else {
            panel.removeClass('mobile-overlay active');
            panel.find('.mobile-overlay-close').hide();
            // Restore menu bar z-index on mobile
            $('#menu-bar').css('z-index', ZIndex.MENU_BAR);
        }

        // Remove active state from menu button
        $(`#mobile-menu-${panelName}`).removeClass('active');

        if (currentPanel === panelName) {
            currentPanel = null;
        }
    }

    /**
     * Hide all mobile panels
     */
    function hideAllPanels() {
        Object.keys(panels).forEach(hidePanel);
    }

    // Wire up mobile menu buttons
    $('#mobile-menu-controls').on('click', function() {
        if (currentPanel === 'controls') {
            hidePanel('controls');
        } else {
            showPanel('controls');
        }
    });

    $('#mobile-menu-rendering').on('click', function() {
        if (currentPanel === 'rendering') {
            hidePanel('rendering');
        } else {
            showPanel('rendering');
        }
    });

    // Wire up close buttons in panels
    $('.mobile-overlay-close').on('click', function() {
        const panel = $(this).closest('[id]');
        const panelId = panel.attr('id');

        // Map panel IDs to panel names
        const panelMap = {
            'controls': 'controls'
        };

        const panelName = panelMap[panelId];
        if (panelName) {
            hidePanel(panelName);
        }
    });

    // Export for external access
    return {
        showPanel,
        hidePanel,
        hideAllPanels,
        getCurrentPanel: () => currentPanel
    };
}

/**
 * Setup mobile controls component synchronization
 * Syncs the mobile controls component with main controls (timestep, frame limit)
 *
 * @param {ControlManager} manager - The control manager instance
 * @param {Object} mobilePanelManager - The mobile panel manager (unused but kept for consistency)
 */
export function setupMobileControlsSync(manager, mobilePanelManager) {
    const mobileControls = document.getElementById('mobile-controls');

    if (!mobileControls) {
        logger.info('Mobile controls component not found, skipping sync setup');
        return;
    }

    /**
     * Sync mobile controls with main controls
     */
    function syncMobileControls() {
        const timestepControl = manager.get('timestep');
        if (timestepControl) {
            mobileControls.setTimestep(timestepControl.getValue());
        }
    }

    // Listen to main timestep changes
    $('#timestep').on('input change', syncMobileControls);

    // Update main controls when mobile controls change
    mobileControls.onTimestepChange = (value) => {
        const timestepControl = manager.get('timestep');
        if (timestepControl) {
            timestepControl.setValue(value);
            manager.debouncedApply();
        }
    };

    mobileControls.onFrameLimitEnabledChange = (enabled) => {
        const control = manager.get('frame-limit-enabled');
        if (control) {
            control.setValue(enabled);
            manager.debouncedApply();
        }
    };

    mobileControls.onFrameLimitChange = (limit) => {
        const control = manager.get('frame-limit');
        if (control) {
            control.setValue(limit);
            manager.debouncedApply();
        }
    };

    // Initialize mobile controls with current values (after all web components are ready)
    // Use a slight delay to ensure settings have been restored
    const webComponentRegistry = manager.webComponentRegistry;
    if (webComponentRegistry) {
        webComponentRegistry.whenAllReady().then(() => {
            setTimeout(() => {
                syncMobileControls();

                const frameLimitEnabledControl = manager.get('frame-limit-enabled');
                const frameLimitControl = manager.get('frame-limit');

                if (frameLimitEnabledControl) {
                    mobileControls.setFrameLimitEnabled(frameLimitEnabledControl.getValue());
                }
                if (frameLimitControl) {
                    mobileControls.setFrameLimit(frameLimitControl.getValue());
                }
            }, 100);
        });
    } else {
        logger.warn('Web component registry not found on manager, mobile controls sync may not work properly');
    }
}
