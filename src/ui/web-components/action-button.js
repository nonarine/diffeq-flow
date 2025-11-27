/**
 * Action Button Web Component
 *
 * Button with state management for enabled/disabled and loading states.
 * Used for Create Animation, Download, Export buttons.
 *
 * Usage:
 * <action-button
 *   id="animation-create-btn"
 *   label="Create Animation"
 *   icon="▶">
 * </action-button>
 */

export class ActionButton extends HTMLElement {
    constructor() {
        super();

        this._label = 'Action';
        this._icon = '';
        this._enabled = true;
        this._loading = false;
        this._button = null;
    }

    connectedCallback() {
        // Read attributes
        this._label = this.getAttribute('label') || 'Action';
        this._icon = this.getAttribute('icon') || '';

        // Create button element
        this._button = document.createElement('button');
        this._button.className = 'action-btn';
        this._updateButtonText();

        // Forward click events
        this._button.addEventListener('click', (e) => {
            if (this._enabled && !this._loading) {
                this.dispatchEvent(new CustomEvent('action', { bubbles: true }));
            }
        });

        // Append to this element
        this.appendChild(this._button);
    }

    /**
     * Update button text from label and icon
     * @private
     */
    _updateButtonText() {
        if (!this._button) return;

        const text = this._icon ? `${this._icon} ${this._label}` : this._label;
        this._button.textContent = text;
    }

    /**
     * Set button label
     * @param {string} label - Button label
     */
    setLabel(label) {
        this._label = label;
        this._updateButtonText();
    }

    /**
     * Set button icon
     * @param {string} icon - Button icon (emoji or character)
     */
    setIcon(icon) {
        this._icon = icon;
        this._updateButtonText();
    }

    /**
     * Enable or disable button
     * @param {boolean} enabled - Whether button is enabled
     */
    setEnabled(enabled) {
        this._enabled = enabled;
        if (this._button) {
            this._button.disabled = !enabled;
        }
    }

    /**
     * Set loading state
     * @param {boolean} loading - Whether button is in loading state
     * @param {string} loadingLabel - Optional label to show while loading
     */
    setLoading(loading, loadingLabel = null) {
        this._loading = loading;

        if (this._button) {
            this._button.disabled = loading;

            if (loading && loadingLabel) {
                const originalLabel = this._label;
                this._label = loadingLabel;
                this._updateButtonText();
                this._originalLabel = originalLabel;
            } else if (!loading && this._originalLabel) {
                this._label = this._originalLabel;
                this._updateButtonText();
                delete this._originalLabel;
            }
        }
    }

    /**
     * Set button style/color
     * @param {string} background - Background color
     */
    setStyle(background) {
        if (this._button) {
            this._button.style.background = background;
        }
    }

    /**
     * Check if button is enabled
     * @returns {boolean} Whether button is enabled
     */
    isEnabled() {
        return this._enabled && !this._loading;
    }

    /**
     * Check if button is loading
     * @returns {boolean} Whether button is in loading state
     */
    isLoading() {
        return this._loading;
    }
}

// Register custom element
customElements.define('action-button', ActionButton);
