/**
 * Base class for all Web Component controls
 * Provides reactive binding system with {{variable}} syntax
 */

/**
 * ControlElement - Base class for reactive Web Component controls
 *
 * Implements Control interface compatible with ControlManager:
 * - getValue()
 * - setValue(value)
 * - reset()
 * - handleButtonAction(action)
 * - saveToSettings(settings)
 * - restoreFromSettings(settings)
 * - attachListeners(callback)
 */
export class ControlElement extends HTMLElement {
    constructor() {
        super();

        // Control interface properties (match control-base.js)
        // Note: this.id is inherited from HTMLElement and auto-syncs with the id attribute
        this.defaultValue = null;
        this.settingsKey = null;
        this.onChange = null;

        // Transform support for linear scaling (e.g., slider 0-100 → value 0.0-1.0)
        this.transform = 1.0;

        // Binding system
        this._bindings = new Map(); // variable name -> Set of {element, type, attr}
        this._boundProperties = new Set(); // properties exposed via bind-* attributes

        // Internal state
        this._initialized = false;
        this._callback = null;
    }

    /**
     * Called when element is connected to DOM
     */
    connectedCallback() {
        if (this._initialized) return;

        // Set id if not present (HTMLElement.id is automatically synced with attribute)
        if (!this.id) {
            this.id = this.generateId();
        }
        this.settingsKey = this.getAttribute('settings-key') || this.id;

        // Initialize properties from attributes
        this.initializeProperties();

        // Discover which properties are exposed via bind-* attributes
        this.discoverBoundProperties();

        // Process innerHTML: replace {{placeholders}} and register bindings
        this.processTemplate();

        // Attach event listeners
        this.attachInternalListeners();

        this._initialized = true;
    }

    /**
     * Generate unique ID
     */
    generateId() {
        return `control-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Initialize properties from attributes (override in subclasses)
     */
    initializeProperties() {
        // Override in subclasses to read attributes and set properties
    }

    /**
     * Discover which properties are bound via bind-* attributes
     */
    discoverBoundProperties() {
        for (const attr of this.attributes) {
            if (attr.name.startsWith('bind-')) {
                const propName = attr.value; // e.g., bind-label="label" -> "label"
                this._boundProperties.add(propName);
            }
        }
    }

    /**
     * Process template: replace {{placeholders}} and register bind-* elements
     * Supports three modes:
     * 1. <template> child element
     * 2. External template via template="id" attribute
     * 3. Direct innerHTML
     */
    processTemplate() {
        let templateContent = null;

        // Check for external template reference
        const templateId = this.getAttribute('template');
        if (templateId) {
            const externalTemplate = document.getElementById(templateId);
            if (externalTemplate && externalTemplate.tagName === 'TEMPLATE') {
                templateContent = externalTemplate.content.cloneNode(true);
            }
        }

        // Check for inline <template> child
        if (!templateContent) {
            const inlineTemplate = this.querySelector(':scope > template');
            if (inlineTemplate) {
                templateContent = inlineTemplate.content.cloneNode(true);
            }
        }

        // If we have template content, use it; otherwise use innerHTML
        let workingRoot;
        if (templateContent) {
            // Clear existing content and use template
            this.innerHTML = '';
            this.appendChild(templateContent);
            workingRoot = this;
        } else {
            // Use existing innerHTML
            workingRoot = this;
        }

        // First pass: process attributes with {{variable}} syntax
        const walker = document.createTreeWalker(
            workingRoot,
            NodeFilter.SHOW_ELEMENT,
            null,
            false
        );

        const attributeBindings = []; // Store for processing after innerHTML update
        let node;

        while (node = walker.nextNode()) {
            if (node === this) continue;

            for (const attr of Array.from(node.attributes)) {
                const matches = attr.value.match(/\{\{(\w+)\}\}/g);
                if (matches) {
                    // Replace {{variable}} with actual value
                    let newValue = attr.value;
                    matches.forEach(match => {
                        const varName = match.slice(2, -2); // Remove {{ and }}
                        // Check if property exists (works with getters/setters)
                        if (varName in this && this[varName] !== undefined) {
                            const value = this[varName];
                            newValue = newValue.replace(match, value);

                            // Store binding info for later registration
                            attributeBindings.push({
                                element: node,
                                attrName: attr.name,
                                varName: varName
                            });
                        }
                    });
                    attr.value = newValue;
                }
            }
        }

        // Second pass: replace {{variable}} in text content
        let html = this.innerHTML;
        html = html.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
            // Check if property exists (works with getters/setters)
            if (varName in this && this[varName] !== undefined) {
                return this.formatValue(this[varName]);
            }
            return match; // Leave unchanged if property doesn't exist
        });

        // Update innerHTML with replaced placeholders
        this.innerHTML = html;

        // Register attribute bindings from first pass
        // We need to re-query elements since innerHTML was replaced
        for (const binding of attributeBindings) {
            // Find the element again (it was recreated by innerHTML assignment)
            // Use a more robust selector based on tag name and position
            this.registerAttributeBinding(binding.varName, binding.attrName);
        }

        // Find all elements with bind-* attributes and register them
        this.registerBindings(this);
    }

    /**
     * Register attribute bindings for all elements with a specific attribute
     */
    registerAttributeBinding(varName, attrName) {
        const elements = this.querySelectorAll(`[${attrName}]`);
        for (const element of elements) {
            // Check if this attribute's value references our variable
            // (it should, since we found it in the first pass)
            if (!this._bindings.has(varName)) {
                this._bindings.set(varName, new Set());
            }

            const bindings = this._bindings.get(varName);
            bindings.add({ element, type: 'attr', attr: attrName });
        }
    }

    /**
     * Recursively find and register all bind-* attributes in children
     */
    registerBindings(root) {
        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_ELEMENT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            // Skip the root element itself
            if (node === this) continue;

            for (const attr of node.attributes) {
                if (attr.name.startsWith('bind-')) {
                    this.registerBinding(node, attr.name, attr.value);
                }
            }
        }
    }

    /**
     * Register a single binding
     * @param {Element} element - The element to bind
     * @param {string} bindAttr - The bind attribute name (e.g., "bind-text", "bind-attr-value")
     * @param {string} varName - The variable name to bind to
     */
    registerBinding(element, bindAttr, varName) {
        if (!this._bindings.has(varName)) {
            this._bindings.set(varName, new Set());
        }

        const bindings = this._bindings.get(varName);

        if (bindAttr === 'bind-text') {
            bindings.add({ element, type: 'text', attr: null });
        } else if (bindAttr.startsWith('bind-attr-')) {
            const attrName = bindAttr.substring('bind-attr-'.length);
            bindings.add({ element, type: 'attr', attr: attrName });
        } else if (bindAttr === 'bind-value') {
            bindings.add({ element, type: 'value', attr: null });
        } else if (bindAttr.startsWith('bind-class-')) {
            const className = bindAttr.substring('bind-class-'.length);
            bindings.add({ element, type: 'class', attr: className });
        } else if (bindAttr === 'bind-show') {
            bindings.add({ element, type: 'show', attr: null });
        }
    }

    /**
     * Update all bindings for a given property
     */
    updateBindings(propName, value) {
        if (!this._bindings.has(propName)) return;

        const bindings = this._bindings.get(propName);
        for (const binding of bindings) {
            switch (binding.type) {
                case 'text':
                    binding.element.textContent = this.formatValue(value);
                    break;
                case 'attr':
                    binding.element.setAttribute(binding.attr, value);
                    break;
                case 'value':
                    binding.element.value = value;
                    break;
                case 'class':
                    binding.element.classList.toggle(binding.attr, !!value);
                    break;
                case 'show':
                    binding.element.style.display = value ? '' : 'none';
                    break;
            }
        }
    }

    /**
     * Format a value for display (can be overridden)
     */
    formatValue(value) {
        if (value == null) return '';
        return String(value);
    }

    /**
     * Attach internal event listeners (override in subclasses)
     */
    attachInternalListeners() {
        // Override in subclasses
    }

    /**
     * Get current value from control (override in subclasses)
     */
    getValue() {
        throw new Error('getValue() must be implemented by subclass');
    }

    /**
     * Set value in control (override in subclasses)
     */
    setValue(value) {
        throw new Error('setValue() must be implemented by subclass');
    }

    /**
     * Reset to default value
     */
    reset() {
        this.setValue(this.defaultValue);
    }

    /**
     * Handle button action (override in subclasses)
     */
    handleButtonAction(action) {
        return false;
    }

    /**
     * Attach listeners (called by ControlManager)
     */
    attachListeners(callback) {
        this._callback = callback;
    }

    /**
     * Save to settings
     */
    saveToSettings(settings) {
        settings[this.settingsKey] = this.getValue();
    }

    /**
     * Restore from settings
     */
    restoreFromSettings(settings) {
        if (settings && settings[this.settingsKey] != null) {
            this.setValue(settings[this.settingsKey]);
        }
    }

    /**
     * Trigger change callback
     */
    triggerChange() {
        const value = this.getValue();

        if (this.onChange) {
            this.onChange(value);
        }

        if (this._callback) {
            this._callback();
        }

        this.dispatchEvent(new CustomEvent('control-change', {
            detail: { value },
            bubbles: true
        }));
    }

    /**
     * Helpers for reading attributes
     */
    getNumberAttribute(name, defaultValue = 0) {
        const value = this.getAttribute(name);
        return value !== null ? parseFloat(value) : defaultValue;
    }

    getBooleanAttribute(name, defaultValue = false) {
        const value = this.getAttribute(name);
        if (value === null) return defaultValue;
        return value === '' || value === 'true' || value === name;
    }

    /**
     * Helper: Find input element
     * Looks for data-role="input" or specific type, or any input
     */
    findInput(type = null, role = 'input') {
        // Try data-role first
        let input = this.querySelector(`[data-role="${role}"]`);
        if (input) return input;

        // Try by type
        if (type) {
            input = this.querySelector(`input[type="${type}"]`);
            if (input) return input;
        }

        // Fallback to any input
        return this.querySelector('input');
    }

    /**
     * Helper: Register action buttons
     * Automatically finds and binds buttons with action attributes
     *
     * @param {Array<string>} actions - List of action names to register
     *
     * Example:
     * this.registerActionButtons(['decrease', 'increase', 'reset']);
     */
    registerActionButtons(actions) {
        for (const action of actions) {
            const buttons = this.querySelectorAll(`[${action}]`);
            for (const button of buttons) {
                button.addEventListener('click', () => {
                    this.handleButtonAction(action);
                });
            }
        }
    }

    /**
     * Helper: Create reactive property
     * Creates a getter/setter that automatically calls updateBindings()
     *
     * @param {string} name - Property name
     * @param {*} defaultValue - Initial value
     *
     * Example:
     * this.createReactiveProperty('value', 50);
     * // Creates this._value = 50 and this.value getter/setter
     */
    createReactiveProperty(name, defaultValue) {
        const privateName = `_${name}`;
        this[privateName] = defaultValue;

        Object.defineProperty(this, name, {
            get() {
                return this[privateName];
            },
            set(newValue) {
                this[privateName] = newValue;
                this.updateBindings(name, newValue);
            },
            enumerable: true,
            configurable: true
        });
    }

    /**
     * Helper: Create multiple reactive properties from config
     *
     * @param {Object} config - Object mapping property names to default values
     *
     * Example:
     * this.createReactiveProperties({
     *   label: 'Value',
     *   value: 50,
     *   min: 0,
     *   max: 100
     * });
     */
    createReactiveProperties(config) {
        for (const [name, defaultValue] of Object.entries(config)) {
            this.createReactiveProperty(name, defaultValue);
        }
    }

    /**
     * Helper: Add input listener with debouncing
     *
     * @param {HTMLElement} element - Element to listen to
     * @param {Function} callback - Callback function
     * @param {number} debounce - Debounce time in ms (0 = no debounce)
     */
    addInputListener(element, callback, debounce = 0) {
        if (!element) return;

        if (debounce > 0) {
            let timeout;
            element.addEventListener('input', () => {
                clearTimeout(timeout);
                timeout = setTimeout(callback, debounce);
            });
        } else {
            element.addEventListener('input', callback);
        }
    }

    /**
     * Helper: Find element by role
     * Uses data-role attribute or CSS selector fallback
     *
     * @param {string} role - Role name
     * @param {string} fallback - Fallback CSS selector
     *
     * Example:
     * this.findByRole('slider', 'input[type="range"]');
     */
    findByRole(role, fallback = null) {
        let element = this.querySelector(`[data-role="${role}"]`);
        if (!element && fallback) {
            element = this.querySelector(fallback);
        }
        return element;
    }

    /**
     * Helper: Find all elements by role
     *
     * @param {string} role - Role name
     *
     * Example:
     * this.findAllByRole('option'); // Returns all [data-role="option"]
     */
    findAllByRole(role) {
        return this.querySelectorAll(`[data-role="${role}"]`);
    }
}
