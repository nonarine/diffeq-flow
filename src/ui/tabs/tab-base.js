/**
 * Base class for modal tabs
 *
 * Tabs are lazily loaded - their content is only rendered when activated.
 * Subclasses should override render() and optionally onActivate()/onDeactivate().
 */
export class Tab {
    /**
     * @param {string} id - Unique identifier for this tab
     * @param {string} title - Display title for the tab button
     */
    constructor(id, title) {
        this.id = id;
        this.title = title;
        this._isRendered = false;
        this._isActive = false;
        this._contentElement = null;
    }

    /**
     * Get whether this tab has been rendered yet
     * @returns {boolean}
     */
    get isRendered() {
        return this._isRendered;
    }

    /**
     * Get whether this tab is currently active
     * @returns {boolean}
     */
    get isActive() {
        return this._isActive;
    }

    /**
     * Render the tab content. Called once when tab is first activated.
     * Subclasses MUST override this method.
     * @param {HTMLElement} container - Container element to render into
     * @returns {HTMLElement} The rendered content element
     */
    render(container) {
        throw new Error('Tab subclass must implement render() method');
    }

    /**
     * Called when tab becomes active.
     * Override to perform actions when tab is shown.
     */
    onActivate() {
        // Override in subclass if needed
    }

    /**
     * Called when tab becomes inactive.
     * Override to perform cleanup when tab is hidden.
     */
    onDeactivate() {
        // Override in subclass if needed
    }

    /**
     * Internal method to activate this tab
     * @param {HTMLElement} container - Container to render into
     * @internal
     */
    _activate(container) {
        if (!this._isRendered) {
            this._contentElement = this.render(container);
            this._isRendered = true;
        }

        if (this._contentElement) {
            this._contentElement.style.display = 'block';
        }

        this._isActive = true;
        this.onActivate();
    }

    /**
     * Internal method to deactivate this tab
     * @internal
     */
    _deactivate() {
        if (this._contentElement) {
            this._contentElement.style.display = 'none';
        }

        this._isActive = false;
        this.onDeactivate();
    }

    /**
     * Destroy this tab and clean up resources
     */
    destroy() {
        if (this._contentElement && this._contentElement.parentNode) {
            this._contentElement.parentNode.removeChild(this._contentElement);
        }
        this._contentElement = null;
        this._isRendered = false;
        this._isActive = false;
    }
}

/**
 * Manages tabs within a modal window
 */
export class TabManager {
    constructor() {
        this._tabs = new Map();
        this._activeTab = null;
        this._tabBarElement = null;
        this._contentElement = null;
    }

    /**
     * Register a new tab
     * @param {Tab} tab - Tab instance to register
     */
    register(tab) {
        if (!(tab instanceof Tab)) {
            throw new Error('Tab must be an instance of Tab class');
        }

        if (this._tabs.has(tab.id)) {
            throw new Error(`Tab with id '${tab.id}' already registered`);
        }

        this._tabs.set(tab.id, tab);

        // If tab bar exists, add button for this tab
        if (this._tabBarElement) {
            this._addTabButton(tab);
        }
    }

    /**
     * Unregister a tab
     * @param {string} tabId - ID of tab to unregister
     */
    unregister(tabId) {
        const tab = this._tabs.get(tabId);
        if (!tab) return;

        if (tab === this._activeTab) {
            this._activeTab = null;
        }

        tab.destroy();
        this._tabs.delete(tabId);

        // Remove button if tab bar exists
        if (this._tabBarElement) {
            const button = this._tabBarElement.querySelector(`[data-tab-id="${tabId}"]`);
            if (button) {
                button.remove();
            }
        }
    }

    /**
     * Activate a tab by ID
     * @param {string} tabId - ID of tab to activate
     * @returns {boolean} True if tab was activated, false if not found
     */
    activate(tabId) {
        const tab = this._tabs.get(tabId);
        if (!tab) {
            console.warn(`Tab '${tabId}' not found`);
            return false;
        }

        // Deactivate current tab
        if (this._activeTab && this._activeTab !== tab) {
            this._activeTab._deactivate();
            this._updateTabButton(this._activeTab.id, false);
        }

        // Activate new tab
        this._activeTab = tab;
        tab._activate(this._contentElement);
        this._updateTabButton(tabId, true);

        return true;
    }

    /**
     * Get the currently active tab
     * @returns {Tab|null}
     */
    getActiveTab() {
        return this._activeTab;
    }

    /**
     * Get all registered tabs
     * @returns {Tab[]}
     */
    getAllTabs() {
        return Array.from(this._tabs.values());
    }

    /**
     * Initialize UI elements (tab bar and content container)
     * @param {HTMLElement} tabBarElement - Element to render tab buttons into
     * @param {HTMLElement} contentElement - Element to render tab content into
     */
    initializeUI(tabBarElement, contentElement) {
        this._tabBarElement = tabBarElement;
        this._contentElement = contentElement;

        // Render buttons for all registered tabs
        for (const tab of this._tabs.values()) {
            this._addTabButton(tab);
        }
    }

    /**
     * Add a button for a tab to the tab bar
     * @private
     */
    _addTabButton(tab) {
        if (!this._tabBarElement) return;

        const button = document.createElement('button');
        button.className = 'modal-tab-button';
        button.textContent = tab.title;
        button.dataset.tabId = tab.id;

        button.addEventListener('click', () => {
            this.activate(tab.id);
        });

        this._tabBarElement.appendChild(button);
    }

    /**
     * Update tab button active state
     * @private
     */
    _updateTabButton(tabId, isActive) {
        if (!this._tabBarElement) return;

        const button = this._tabBarElement.querySelector(`[data-tab-id="${tabId}"]`);
        if (button) {
            if (isActive) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        }
    }

    /**
     * Destroy all tabs and clean up
     */
    destroy() {
        for (const tab of this._tabs.values()) {
            tab.destroy();
        }
        this._tabs.clear();
        this._activeTab = null;
        this._tabBarElement = null;
        this._contentElement = null;
    }
}
