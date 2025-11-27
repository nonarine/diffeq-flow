/**
 * CompositeMixin - Adds multi-child control management
 *
 * Provides the ability to compose multiple sub-controls into a single control
 * with an object-based getValue/setValue interface.
 *
 * Overrides ControlMixin's abstract getValue/setValue/reset to delegate to children.
 *
 * Subclasses must implement initializeChildren() to register child controls.
 *
 * Example:
 * ```
 * class MyComposite extends composeMixins(HTMLElement, ControlMixin, CompositeMixin) {
 *     initializeChildren() {
 *         const input1 = this.querySelector('#input1');
 *         const input2 = this.querySelector('#input2');
 *
 *         this.registerChildControl('foo',
 *             () => input1.value,
 *             (v) => { input1.value = v; },
 *             () => { input1.value = 'default'; }
 *         );
 *
 *         this.registerChildControl('bar',
 *             () => input2.value,
 *             (v) => { input2.value = v; },
 *             () => { input2.value = 'default'; }
 *         );
 *     }
 * }
 *
 * // getValue() returns: { foo: '...', bar: '...' }
 * // setValue({ foo: 'x', bar: 'y' }) updates both
 * ```
 *
 * @param {Class} Base - Base class to extend
 * @returns {Class} Extended class with composite control support
 */
export const CompositeMixin = (Base) => class extends Base {
    constructor() {
        super();

        // Map of child control keys -> { getValue, setValue, reset }
        this._childControls = new Map();
    }

    /**
     * Register a child control
     * @param {string} key - Key for this child in the composite value object
     * @param {Function} getValue - Function to get child's current value
     * @param {Function} setValue - Function to set child's value
     * @param {Function} reset - Function to reset child to default
     */
    registerChildControl(key, getValue, setValue, reset) {
        this._childControls.set(key, { getValue, setValue, reset });
    }

    /**
     * Get current value (object with all child values)
     * Overrides ControlMixin's abstract getValue()
     */
    getValue() {
        const value = {};
        for (const [key, control] of this._childControls.entries()) {
            value[key] = control.getValue();
        }
        return value;
    }

    /**
     * Set value (accepts object with child values)
     * Overrides ControlMixin's abstract setValue()
     */
    setValue(value) {
        if (typeof value !== 'object' || value === null) return;

        for (const [key, control] of this._childControls.entries()) {
            if (value[key] !== undefined) {
                control.setValue(value[key]);
            }
        }
    }

    /**
     * Reset all children to default values
     * Overrides ControlMixin's reset()
     */
    reset() {
        for (const control of this._childControls.values()) {
            control.reset();
        }
    }

    /**
     * ABSTRACT: Initialize child controls (must be implemented by subclass)
     * Call registerChildControl() for each child here
     */
    initializeChildren() {
        throw new Error('Subclass must implement initializeChildren()');
    }
};
