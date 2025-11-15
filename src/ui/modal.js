/**
 * Modal window with tabbed interface
 *
 * Provides a full-screen overlay modal with tabs.
 * Single global modal instance - all tabs rendered in the same window.
 */

import { TabManager } from './tabs/tab-base.js';

export class Modal {
    constructor() {
        this.tabManager = new TabManager();
        this._modalElement = null;
        this._isVisible = false;
        this._onCloseCallback = null;
        this._wasPaused = false;
    }

    /**
     * Initialize the modal with DOM elements
     * Typically called after DOM is ready
     */
    initialize() {
        this._modalElement = document.getElementById('modal-overlay');
        if (!this._modalElement) {
            console.error('Modal overlay element not found');
            return;
        }

        const tabBar = document.getElementById('modal-tab-bar');
        const content = document.getElementById('modal-content');

        if (!tabBar || !content) {
            console.error('Modal tab bar or content element not found');
            return;
        }

        // Initialize tab manager UI
        this.tabManager.initializeUI(tabBar, content);

        // Setup close button
        const closeButton = document.getElementById('modal-close');
        if (closeButton) {
            closeButton.addEventListener('click', () => this.hide());
        }

        // Close on overlay click (not content click)
        this._modalElement.addEventListener('click', (e) => {
            if (e.target === this._modalElement) {
                this.hide();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this._isVisible) {
                this.hide();
            }
        });
    }

    /**
     * Register a tab with the modal
     * @param {Tab} tab - Tab instance to register
     */
    registerTab(tab) {
        this.tabManager.register(tab);
    }

    /**
     * Show the modal and optionally activate a specific tab
     * @param {string} [tabId] - Optional tab ID to activate on show
     * @param {string} [section] - Optional section ID within the tab (e.g., 'integrators')
     */
    show(tabId = null, section = null) {
        if (!this._modalElement) {
            console.error('Modal not initialized');
            return;
        }

        // If no tab specified, activate first tab
        if (!tabId) {
            const tabs = this.tabManager.getAllTabs();
            if (tabs.length > 0) {
                tabId = tabs[0].id;
            }
        }

        // Activate the tab
        if (tabId) {
            this.tabManager.activate(tabId);

            // If a section is specified, navigate to it
            if (section) {
                const tab = this.tabManager.getAllTabs().find(t => t.id === tabId);
                if (tab && typeof tab.openToSection === 'function') {
                    // If tab is already rendered, open to section immediately
                    if (tab.isRendered) {
                        tab.openToSection(section);
                    } else {
                        // Otherwise, set it as pending for when tab activates
                        if (typeof tab.setPendingSection === 'function') {
                            tab.setPendingSection(section);
                        }
                    }
                }
            }
        }

        // Show modal
        this._modalElement.style.display = 'flex';
        this._isVisible = true;

        // Prevent body scrolling while modal is open
        document.body.style.overflow = 'hidden';

        // Pause rendering
        if (window.renderer && window.renderer.isRunning) {
            window.renderer.stop();
            this._wasPaused = false; // Renderer was running, we paused it
        } else {
            this._wasPaused = true; // Renderer was already paused
        }
    }

    /**
     * Hide the modal
     */
    hide() {
        if (!this._modalElement) return;

        this._modalElement.style.display = 'none';
        this._isVisible = false;

        // Re-enable body scrolling
        document.body.style.overflow = '';

        // Resume rendering if it was running before we paused it
        if (window.renderer && !this._wasPaused) {
            window.renderer.start();
        }

        // Call close callback if set
        if (this._onCloseCallback) {
            this._onCloseCallback();
        }
    }

    /**
     * Check if modal is currently visible
     * @returns {boolean}
     */
    isVisible() {
        return this._isVisible;
    }

    /**
     * Set callback to be called when modal is closed
     * @param {Function} callback
     */
    onClose(callback) {
        this._onCloseCallback = callback;
    }

    /**
     * Get the active tab
     * @returns {Tab|null}
     */
    getActiveTab() {
        return this.tabManager.getActiveTab();
    }
}

// Global modal instance
let globalModal = null;

/**
 * Get or create the global modal instance
 * @returns {Modal}
 */
export function getModal() {
    if (!globalModal) {
        globalModal = new Modal();
    }
    return globalModal;
}

/**
 * Initialize the global modal
 * Should be called after DOM is ready
 */
export function initializeModal() {
    const modal = getModal();
    modal.initialize();
    return modal;
}
