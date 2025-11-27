/**
 * Panel Manager - Unified Panel Show/Hide Logic
 *
 * Eliminates 42+ duplicate show/hide operations across the codebase.
 * Provides centralized z-index management for panels on mobile devices.
 *
 * @module ui/utils/panel-manager
 */

import { ZIndex, lowerMenuBar, restoreMenuBar } from './z-index.js';
import { isMobile } from './mobile.js';

/**
 * Manages a single panel's visibility and z-index behavior
 *
 * @class PanelManager
 *
 * @example
 * const gradientPanel = new PanelManager('#gradient-panel', {
 *     zIndex: ZIndex.GRADIENT_PANEL,
 *     onShow: () => console.log('Panel shown'),
 *     onHide: () => console.log('Panel hidden')
 * });
 *
 * gradientPanel.show(); // Shows panel with correct z-index
 * gradientPanel.hide(); // Hides panel and restores menu bar
 */
export class PanelManager {
    /**
     * Create a new panel manager
     *
     * @param {string} panelSelector - jQuery selector for the panel element
     * @param {Object} options - Configuration options
     * @param {Function} [options.onShow] - Callback when panel is shown
     * @param {Function} [options.onHide] - Callback when panel is hidden
     * @param {number} [options.zIndex] - Z-index to use on mobile (default: ZIndex.MOBILE_PANEL)
     * @param {boolean} [options.manageMobileOnly=true] - Only manage z-index on mobile
     */
    constructor(panelSelector, options = {}) {
        this.panel = $(panelSelector);
        this.panelSelector = panelSelector;
        this.closeButton = this.panel.find('.floating-panel-close, .mobile-overlay-close');
        this.onShow = options.onShow;
        this.onHide = options.onHide;
        this.zIndex = options.zIndex || ZIndex.MOBILE_PANEL;
        this.manageMobileOnly = options.manageMobileOnly !== false;

        if (!this.panel.length) {
            console.warn(`PanelManager: Panel not found: ${panelSelector}`);
        }
    }

    /**
     * Show the panel
     * On mobile, automatically manages z-index and lowers menu bar
     */
    show() {
        if (!this.panel.length) return;

        this.panel.show();

        // On mobile, ensure proper z-index stacking
        if (!this.manageMobileOnly || isMobile()) {
            this.panel.css('z-index', this.zIndex);
            this.closeButton.css('z-index', ZIndex.CLOSE_BUTTON);
            lowerMenuBar();
        }

        // Call custom show callback
        if (this.onShow) {
            this.onShow();
        }
    }

    /**
     * Hide the panel
     * On mobile, restores menu bar z-index
     */
    hide() {
        if (!this.panel.length) return;

        this.panel.hide();

        // On mobile, restore menu bar
        if (!this.manageMobileOnly || isMobile()) {
            restoreMenuBar();
        }

        // Call custom hide callback
        if (this.onHide) {
            this.onHide();
        }
    }

    /**
     * Toggle panel visibility
     */
    toggle() {
        if (this.isVisible()) {
            this.hide();
        } else {
            this.show();
        }
    }

    /**
     * Check if panel is currently visible
     *
     * @returns {boolean} True if panel is visible
     */
    isVisible() {
        return this.panel.is(':visible');
    }

    /**
     * Set the z-index for this panel
     *
     * @param {number} zIndex - New z-index value
     */
    setZIndex(zIndex) {
        this.zIndex = zIndex;
        if (this.isVisible() && (!this.manageMobileOnly || isMobile())) {
            this.panel.css('z-index', zIndex);
        }
    }

    /**
     * Get the panel jQuery element
     *
     * @returns {jQuery} The panel element
     */
    getPanel() {
        return this.panel;
    }

    /**
     * Wire up the close button to hide the panel
     * Call this during initialization if needed
     */
    wireCloseButton() {
        this.closeButton.off('click.panelManager').on('click.panelManager', () => {
            this.hide();
        });
    }

    /**
     * Enable click-outside-to-close behavior
     *
     * @param {Array<string>} excludeSelectors - jQuery selectors for elements that shouldn't trigger close
     * @example
     * panelManager.enableClickOutside(['#open-button', '#mobile-menu-button']);
     */
    enableClickOutside(excludeSelectors = []) {
        this.clickOutsideExclusions = [this.panelSelector, ...excludeSelectors];

        // Remove any existing handler
        $(document).off('click.panelManager' + this.panelSelector);

        // Add new handler
        $(document).on('click.panelManager' + this.panelSelector, (e) => {
            // Check if click is inside panel or any excluded elements
            for (const selector of this.clickOutsideExclusions) {
                if ($(e.target).is(selector) || $(e.target).closest(selector).length > 0) {
                    return; // Don't close
                }
            }

            // Click is outside - close panel if visible
            if (this.isVisible()) {
                this.hide();
            }
        });

        // Prevent clicks inside panel from propagating
        this.panel.off('click.panelManagerStop').on('click.panelManagerStop', (e) => {
            e.stopPropagation();
        });
    }

    /**
     * Disable click-outside-to-close behavior
     */
    disableClickOutside() {
        $(document).off('click.panelManager' + this.panelSelector);
        this.panel.off('click.panelManagerStop');
        this.clickOutsideExclusions = null;
    }

    /**
     * Clean up event listeners
     * Call this when destroying the panel manager
     */
    destroy() {
        this.closeButton.off('click.panelManager');
        this.disableClickOutside();
    }
}

/**
 * Create and manage multiple panels as a group
 *
 * @class PanelGroup
 *
 * @example
 * const group = new PanelGroup({
 *     gradient: '#gradient-panel',
 *     rendering: '#rendering-panel'
 * });
 *
 * group.show('gradient'); // Shows gradient, hides others
 * group.hideAll(); // Hides all panels
 */
export class PanelGroup {
    /**
     * Create a panel group
     *
     * @param {Object<string, string|PanelManager>} panels - Map of panel names to selectors or PanelManagers
     * @param {Object} options - Configuration options
     * @param {boolean} [options.exclusive=true] - Only show one panel at a time
     */
    constructor(panels, options = {}) {
        this.panels = {};
        this.exclusive = options.exclusive !== false;
        this.currentPanel = null;

        // Initialize panel managers
        for (const [name, panelOrSelector] of Object.entries(panels)) {
            if (panelOrSelector instanceof PanelManager) {
                this.panels[name] = panelOrSelector;
            } else {
                this.panels[name] = new PanelManager(panelOrSelector, options);
            }
        }
    }

    /**
     * Show a panel by name
     *
     * @param {string} name - Panel name
     */
    show(name) {
        const panel = this.panels[name];
        if (!panel) {
            console.warn(`PanelGroup: Panel not found: ${name}`);
            return;
        }

        // If exclusive, hide current panel
        if (this.exclusive && this.currentPanel && this.currentPanel !== name) {
            this.hide(this.currentPanel);
        }

        panel.show();
        this.currentPanel = name;
    }

    /**
     * Hide a panel by name
     *
     * @param {string} name - Panel name
     */
    hide(name) {
        const panel = this.panels[name];
        if (!panel) {
            console.warn(`PanelGroup: Panel not found: ${name}`);
            return;
        }

        panel.hide();

        if (this.currentPanel === name) {
            this.currentPanel = null;
        }
    }

    /**
     * Toggle a panel by name
     *
     * @param {string} name - Panel name
     */
    toggle(name) {
        const panel = this.panels[name];
        if (!panel) {
            console.warn(`PanelGroup: Panel not found: ${name}`);
            return;
        }

        if (panel.isVisible()) {
            this.hide(name);
        } else {
            this.show(name);
        }
    }

    /**
     * Hide all panels in the group
     */
    hideAll() {
        for (const name of Object.keys(this.panels)) {
            this.hide(name);
        }
    }

    /**
     * Get the currently visible panel name
     *
     * @returns {string|null} Panel name or null if none visible
     */
    getCurrentPanel() {
        return this.currentPanel;
    }

    /**
     * Get a specific panel manager
     *
     * @param {string} name - Panel name
     * @returns {PanelManager|undefined} The panel manager
     */
    getPanel(name) {
        return this.panels[name];
    }
}
