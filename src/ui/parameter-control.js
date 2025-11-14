/**
 * Generic parameter control that reads metadata from parameter definitions
 * Eliminates duplication between transform definitions and UI code
 */

import { Control } from './control-base.js';
import {
    createFormatterFromDef,
    inferScaleType,
    calculateAdaptiveIncrement,
    calculateLogIncrement,
    calculateLinearIncrement
} from './control-utilities.js';
import { resizeAccordion } from './accordion-utils.js';

/**
 * ParameterControl - Generic control for any parameter with metadata
 *
 * Reads parameter definition (from transforms, integrators, mappers, etc.)
 * and creates appropriate UI controls automatically.
 *
 * Parameter definition schema:
 * {
 *   name: string,              // Parameter name (used as key in settings)
 *   label: string,             // Display label
 *   type: string,              // 'slider' | 'text' | 'checkbox' (future)
 *   min: number,               // Minimum value
 *   max: number,               // Maximum value
 *   step: number,              // Step size
 *   default: number,           // Default value
 *   info: string,              // Optional help text
 *   scale: string,             // Optional: 'linear' | 'log' | 'adaptive' (auto-inferred if not provided)
 *   displayFormat: string|fn,  // Optional: 'scientific' | 'decimal' | 'integer' | custom function
 *   displayPrecision: number,  // Optional: decimal places (default: 2)
 *   scientificThreshold: number // Optional: threshold for scientific notation (default: 10)
 * }
 */
export class ParameterControl extends Control {
    constructor(id, parameterDef, defaultValue, options = {}) {
        super(id, defaultValue, options);

        // Store parameter definition
        this.parameterDef = parameterDef;

        // Infer or use explicit scale type
        this.scale = parameterDef.scale || inferScaleType(
            parameterDef.min,
            parameterDef.max,
            parameterDef.step
        );

        // Create formatter from parameter definition
        this.formatter = createFormatterFromDef(parameterDef);

        // Store display element reference (will be set in attachListeners)
        this.displayElement = null;
    }

    /**
     * Calculate increment for button actions
     * @param {number} currentValue - Current parameter value
     * @param {boolean} isLarge - Whether this is a large increment
     * @returns {number} Increment value
     */
    calculateIncrement(currentValue, isLarge = false) {
        switch (this.scale) {
            case 'adaptive':
                return calculateAdaptiveIncrement(
                    currentValue,
                    this.parameterDef.step,
                    isLarge
                );

            case 'log':
                // For log scale, increment in slider space
                return calculateLogIncrement(isLarge);

            case 'linear':
            default:
                return calculateLinearIncrement(
                    this.parameterDef.step,
                    isLarge
                );
        }
    }

    /**
     * Handle button actions (increment/decrement/reset)
     * @param {string} action - 'increase', 'decrease', 'increase-large', 'decrease-large', 'reset'
     * @returns {boolean} True if action was handled
     */
    handleButtonAction(action) {
        const element = $(`#${this.id}`);
        if (!element.length) return false;

        const currentValue = this.getValue();
        const min = this.parameterDef.min;
        const max = this.parameterDef.max;

        let newValue = currentValue;

        if (action === 'reset') {
            newValue = this.defaultValue;
        } else {
            const increment = this.calculateIncrement(
                currentValue,
                action.includes('large')
            );

            if (action.startsWith('increase')) {
                newValue = Math.min(max, currentValue + increment);
            } else if (action.startsWith('decrease')) {
                newValue = Math.max(min, currentValue - increment);
            } else {
                return false;
            }
        }

        if (newValue !== currentValue) {
            this.setValue(newValue);
            element.trigger('input');
            return true;
        }

        return false;
    }

    /**
     * Render the control HTML
     * @returns {string} HTML string
     */
    render() {
        const displayId = `${this.id}-display`;
        const currentValue = this.defaultValue;

        return `
            <div class="control-group">
                <label>
                    ${this.parameterDef.label}:
                    <span class="range-value" id="${displayId}">
                        ${this.formatter(currentValue)}
                    </span>
                </label>
                <div class="slider-control">
                    <button class="slider-btn" data-slider="${this.id}" data-action="decrease-large">--</button>
                    <button class="slider-btn" data-slider="${this.id}" data-action="decrease">-</button>
                    <input type="range" id="${this.id}">
                    <button class="slider-btn" data-slider="${this.id}" data-action="increase">+</button>
                    <button class="slider-btn" data-slider="${this.id}" data-action="increase-large">++</button>
                </div>
                ${this.parameterDef.info ? `<div class="info">${this.parameterDef.info}</div>` : ''}
            </div>
        `;
    }

    /**
     * Attach to DOM and set up listeners
     * @param {function} callback - Callback to trigger when value changes
     */
    attachListeners(callback) {
        const element = $(`#${this.id}`);
        this.element = element;
        this.displayElement = $(`#${this.id}-display`);

        if (!element.length) {
            console.error(`ParameterControl: Element #${this.id} not found in DOM`);
            return;
        }

        // Set slider attributes
        element.attr('min', this.parameterDef.min);
        element.attr('max', this.parameterDef.max);
        element.attr('step', this.parameterDef.step);
        element.val(this.defaultValue);

        // Update display
        this.updateDisplay(this.defaultValue);

        // Listen for changes
        element.on('input', () => {
            const value = this.getValue();
            this.updateDisplay(value);
            if (this.onChange) this.onChange(value);
            if (callback) callback();
        });
    }

    /**
     * Update display element with formatted value
     * @param {number} value - Value to display
     */
    updateDisplay(value) {
        if (this.displayElement && this.displayElement.length) {
            this.displayElement.text(this.formatter(value));
        }
    }

    /**
     * Get current value from DOM
     * @returns {number}
     */
    getValue() {
        if (!this.element || !this.element.length) {
            return this.defaultValue;
        }
        return parseFloat(this.element.val());
    }

    /**
     * Set value in DOM
     * @param {number} value - Value to set
     */
    setValue(value) {
        if (this.element && this.element.length) {
            this.element.val(value);
            this.updateDisplay(value);
        }
    }

    /**
     * Reset to default value
     */
    reset() {
        this.setValue(this.defaultValue);
    }
}

/**
 * AnimatableParameterControl
 * Extends ParameterControl with animation bounds
 */
export class AnimatableParameterControl extends ParameterControl {
    constructor(id, parameterDef, defaultValue, options = {}) {
        super(id, parameterDef, defaultValue, options);

        // Animation state
        this.animationEnabled = false;
        // Default to 25% and 75% of the range if not specified
        const range = parameterDef.max - parameterDef.min;
        this.animationMin = options.animationMin ?? (parameterDef.min + range * 0.25);
        this.animationMax = options.animationMax ?? (parameterDef.min + range * 0.75);
        this.currentAlpha = 0.0;
        this.isAnimating = false;
    }

    /**
     * Enable/disable animation
     */
    setAnimationEnabled(enabled) {
        this.animationEnabled = enabled;
        this.updateAnimationUI();
    }

    /**
     * Set animation bounds
     */
    setAnimationBounds(min, max) {
        this.animationMin = Math.min(min, max);
        this.animationMax = Math.max(min, max);
        this.updateBoundsDisplay();
    }

    /**
     * Update value based on current alpha (0.0 to 1.0)
     */
    updateFromAlpha(alpha) {
        if (!this.animationEnabled) return;

        this.currentAlpha = alpha;
        const value = this.animationMin + alpha * (this.animationMax - this.animationMin);

        this.isAnimating = true;
        this.setValue(value);
        this.updateCurrentIndicator(alpha);
        this.isAnimating = false;
    }

    /**
     * Update current indicator position
     */
    updateCurrentIndicator(alpha) {
        const indicator = $(`#${this.id}-current-indicator`);
        if (indicator.length) {
            indicator.css('left', `${alpha * 100}%`);
        }
    }

    /**
     * Update bounds display
     */
    updateBoundsDisplay() {
        const minHandle = $(`#${this.id}-min-handle`);
        const maxHandle = $(`#${this.id}-max-handle`);
        const minDisplay = $(`#${this.id}-min-display`);
        const maxDisplay = $(`#${this.id}-max-display`);
        const range = $(`#${this.id}-range`);

        if (minHandle.length && maxHandle.length) {
            const min = this.parameterDef.min;
            const max = this.parameterDef.max;

            const minPercent = ((this.animationMin - min) / (max - min)) * 100;
            const maxPercent = ((this.animationMax - min) / (max - min)) * 100;

            minHandle.css('left', `${minPercent}%`);
            maxHandle.css('left', `${maxPercent}%`);

            range.css({
                'left': `${minPercent}%`,
                'width': `${maxPercent - minPercent}%`
            });

            if (minDisplay.length) minDisplay.text(this.formatter(this.animationMin));
            if (maxDisplay.length) maxDisplay.text(this.formatter(this.animationMax));
        }
    }

    /**
     * Update animation UI visibility
     */
    updateAnimationUI() {
        const boundsContainer = $(`#${this.id}-animation-bounds`);
        const animBtn = $(`#${this.id}-anim-btn`);

        if (this.animationEnabled) {
            boundsContainer.slideDown(200);
            animBtn.addClass('active');
            animBtn.attr('title', 'Disable animation (🎬)');
            this.updateBoundsDisplay();

            // Update accordion height immediately and after animation
            setTimeout(() => {
                this.updateAccordionHeight();
            }, 0);
            setTimeout(() => {
                this.updateAccordionHeight();
            }, 250);
        } else {
            boundsContainer.slideUp(200);
            animBtn.removeClass('active');
            animBtn.attr('title', 'Enable animation (🎬)');

            // Update accordion height after animation
            setTimeout(() => {
                this.updateAccordionHeight();
            }, 250);
        }
    }

    /**
     * Update accordion section height to fit content
     */
    updateAccordionHeight() {
        resizeAccordion('#transform-controls', 0);
    }

    /**
     * Override render to add animation button
     */
    render() {
        const displayId = `${this.id}-display`;
        const currentValue = this.defaultValue;

        return `
            <div class="control-group">
                <label>
                    ${this.parameterDef.label}:
                    <span class="range-value" id="${displayId}">
                        ${this.formatter(currentValue)}
                    </span>
                </label>
                <div class="slider-control">
                    <button class="slider-btn" data-slider="${this.id}" data-action="decrease-large">--</button>
                    <button class="slider-btn" data-slider="${this.id}" data-action="decrease">-</button>
                    <input type="range" id="${this.id}">
                    <button class="slider-btn" data-slider="${this.id}" data-action="increase">+</button>
                    <button class="slider-btn" data-slider="${this.id}" data-action="increase-large">++</button>
                    <button class="slider-btn anim-btn" id="${this.id}-anim-btn" title="Enable animation (🎬)">🎬</button>
                </div>
                ${this.parameterDef.info ? `<div class="info">${this.parameterDef.info}</div>` : ''}
            </div>
        `;
    }

    /**
     * Override attachListeners to add animation controls
     */
    attachListeners(callback) {
        // Call parent to set up basic slider
        super.attachListeners(callback);

        // Use setTimeout to ensure DOM is fully ready for dynamically created content
        setTimeout(() => {
            const element = $(`#${this.id}`);
            if (!element.length) {
                return;
            }

            const animBtn = $(`#${this.id}-anim-btn`);
            if (!animBtn.length) {
                return;
            }

            // Add animation button handler
            animBtn.on('click', (e) => {
                e.stopPropagation();
                this.setAnimationEnabled(!this.animationEnabled);
            });

            // Add multi-thumb slider HTML after the control group
            const boundsHTML = `
                <div id="${this.id}-animation-bounds" class="animation-bounds-slider" style="display: none;">
                    <div class="bounds-labels">
                        <span>Min: <span id="${this.id}-min-display">${this.formatter(this.animationMin)}</span></span>
                        <span>Max: <span id="${this.id}-max-display">${this.formatter(this.animationMax)}</span></span>
                    </div>
                    <div class="multi-thumb-slider">
                        <div class="slider-track"></div>
                        <div id="${this.id}-range" class="slider-range"></div>
                        <div id="${this.id}-current-indicator" class="slider-current-indicator"></div>
                        <div id="${this.id}-min-handle" class="slider-thumb min-thumb" data-bound="min">
                            <span class="thumb-label">MIN</span>
                        </div>
                        <div id="${this.id}-max-handle" class="slider-thumb max-thumb" data-bound="max">
                            <span class="thumb-label">MAX</span>
                        </div>
                    </div>
                </div>
            `;

            const controlGroup = element.closest('.control-group');
            if (controlGroup.length) {
                controlGroup.after(boundsHTML);
                // Attach drag handlers after inserting HTML
                this.attachThumbDragHandlers();
            } else {
                console.warn(`AnimatableParameterControl: Could not find .control-group parent for #${this.id}`);
            }
        }, 0);
    }

    /**
     * Attach drag handlers to thumbs
     */
    attachThumbDragHandlers() {
        const minHandle = $(`#${this.id}-min-handle`);
        const maxHandle = $(`#${this.id}-max-handle`);
        const track = minHandle.parent();

        const handlers = [
            { handle: minHandle, bound: 'min' },
            { handle: maxHandle, bound: 'max' }
        ];

        handlers.forEach(({ handle, bound }) => {
            let isDragging = false;
            let startX = 0;
            let startLeft = 0;

            handle.on('mousedown', (e) => {
                isDragging = true;
                startX = e.pageX;
                startLeft = parseFloat(handle.css('left')) || 0;

                handle.addClass('dragging');
                // Bring this handle to front
                minHandle.css('z-index', '10');
                maxHandle.css('z-index', '10');
                handle.css('z-index', '11');
                $('body').css('user-select', 'none');
                e.preventDefault();
            });

            $(document).on('mousemove', (e) => {
                if (!isDragging) return;

                // Get track dimensions and position
                const trackOffset = track.offset();
                const trackWidth = track.width();

                // Calculate mouse position relative to track
                const relativeX = e.pageX - trackOffset.left;

                // Convert to percentage
                let newPercent = (relativeX / trackWidth) * 100;

                // Clamp to 0-100
                newPercent = Math.max(0, Math.min(100, newPercent));

                // Convert percent to actual value
                const min = this.parameterDef.min;
                const max = this.parameterDef.max;
                const actualValue = min + (newPercent / 100) * (max - min);

                // Update the bound
                if (bound === 'min') {
                    if (actualValue <= this.animationMax) {
                        this.animationMin = actualValue;
                    }
                } else {
                    if (actualValue >= this.animationMin) {
                        this.animationMax = actualValue;
                    }
                }

                this.updateBoundsDisplay();
            });

            $(document).on('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    handle.removeClass('dragging');
                    $('body').css('user-select', '');
                }
            });
        });
    }

    /**
     * Save to settings
     */
    saveToSettings(settings) {
        super.saveToSettings(settings);

        if (this.animationEnabled) {
            if (!settings.animations) settings.animations = {};
            settings.animations[this.settingsKey] = {
                enabled: true,
                min: this.animationMin,
                max: this.animationMax
            };
        }
    }

    /**
     * Restore from settings
     */
    restoreFromSettings(settings) {
        super.restoreFromSettings(settings);

        if (settings.animations && settings.animations[this.settingsKey]) {
            const animData = settings.animations[this.settingsKey];
            this.animationEnabled = animData.enabled || false;
            this.animationMin = animData.min;
            this.animationMax = animData.max;

            this.updateAnimationUI();
        }
    }
}
