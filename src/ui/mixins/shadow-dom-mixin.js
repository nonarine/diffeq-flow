/**
 * ShadowDOMMixin - Adds shadow DOM support to ControlElement
 *
 * Provides shadow DOM creation and helper methods for querying shadow root.
 * Components using this mixin should:
 * 1. Call renderToShadow(htmlString) instead of setting innerHTML
 * 2. Use getShadowRoot() to access the shadow root
 * 3. Use shadowQuery() and shadowQueryAll() for element selection
 *
 * @param {Class} Base - Base class to extend
 * @returns {Class} Extended class with shadow DOM support
 */
export const ShadowDOMMixin = (Base) => class extends Base {
    constructor() {
        super();
        this._shadowRoot = null;
    }

    /**
     * Create shadow DOM (called automatically if needed)
     */
    ensureShadowRoot() {
        if (!this._shadowRoot) {
            this._shadowRoot = this.attachShadow({ mode: 'open' });
        }
        return this._shadowRoot;
    }

    /**
     * Get shadow root (creates if needed)
     */
    getShadowRoot() {
        return this.ensureShadowRoot();
    }

    /**
     * Render HTML to shadow DOM
     * @param {string} htmlString - HTML to render
     */
    renderToShadow(htmlString) {
        const shadow = this.ensureShadowRoot();
        shadow.innerHTML = htmlString;
    }

    /**
     * Query single element from shadow root
     * @param {string} selector - CSS selector
     * @returns {Element|null}
     */
    shadowQuery(selector) {
        return this._shadowRoot ? this._shadowRoot.querySelector(selector) : null;
    }

    /**
     * Query all elements from shadow root
     * @param {string} selector - CSS selector
     * @returns {NodeList}
     */
    shadowQueryAll(selector) {
        return this._shadowRoot ? this._shadowRoot.querySelectorAll(selector) : [];
    }

    /**
     * Override querySelector to use shadow root if available
     * This makes the component work transparently with shadow DOM
     */
    querySelector(selector) {
        if (this._shadowRoot) {
            return this._shadowRoot.querySelector(selector);
        }
        return super.querySelector(selector);
    }

    /**
     * Override querySelectorAll to use shadow root if available
     */
    querySelectorAll(selector) {
        if (this._shadowRoot) {
            return this._shadowRoot.querySelectorAll(selector);
        }
        return super.querySelectorAll(selector);
    }
};
