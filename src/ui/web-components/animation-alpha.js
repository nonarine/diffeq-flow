/**
 * Animation Alpha Web Component
 *
 * Extends PercentSlider with auto-animate button for animation control.
 * Works with AnimationController to manage alpha-based parameter animation.
 *
 * Usage:
 * <animation-alpha
 *   id="animation-alpha"
 *   settings-key="animationAlpha"
 *   default="0.0">
 * </animation-alpha>
 */

import { PercentSlider } from './percent-slider.js';

export class AnimationAlpha extends PercentSlider {
    constructor() {
        super();

        // Animation controller (set by controls-v2.js)
        this._controller = null;
        this._animateButton = null;
        this._isAnimating = false;
    }

    /**
     * Set the animation controller
     * @param {AnimationController} controller - The animation controller instance
     */
    setController(controller) {
        this._controller = controller;

        // Listen to controller alpha changes to update slider during auto-animation
        if (this._controller) {
            this._controller.onAlphaChanged((alpha) => {
                // Update slider value without triggering change event
                this.value = alpha;
                if (this.sliderInput) {
                    this.sliderInput.value = alpha * this.transform;
                }
            });
        }
    }

    /**
     * Override connectedCallback to render auto-animate button
     */
    connectedCallback() {
        super.connectedCallback();

        // Render auto-animate button after slider
        this._renderAnimateButton();
    }

    /**
     * Render auto-animate button in the slider control
     * @private
     */
    _renderAnimateButton() {
        // Find the slider control div
        const sliderControl = this.querySelector('.slider-control');
        if (!sliderControl) {
            console.warn('AnimationAlpha: No .slider-control found in template');
            return;
        }

        // Create animate button
        this._animateButton = document.createElement('button');
        this._animateButton.className = 'slider-btn';
        this._animateButton.style.marginLeft = '8px';
        this._animateButton.style.background = '#4CAF50';
        this._animateButton.style.color = 'white';
        this._animateButton.title = 'Auto-animate';
        this._animateButton.textContent = '▶';

        // Add click handler
        this._animateButton.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent panel close
            this._handleAnimateClick();
        });

        // Append to slider control
        sliderControl.appendChild(this._animateButton);
    }

    /**
     * Handle auto-animate button click
     * @private
     */
    _handleAnimateClick() {
        if (!this._controller) {
            console.warn('AnimationAlpha: No controller set');
            return;
        }

        if (this._isAnimating) {
            // Stop animation
            this._controller.stop();
            this._isAnimating = false;

            // Update button appearance
            this._animateButton.textContent = '▶';
            this._animateButton.style.background = '#4CAF50';
            this._animateButton.title = 'Auto-animate';
        } else {
            // Start animation
            this._controller.start();
            this._isAnimating = true;

            // Update button appearance
            this._animateButton.textContent = '⏸';
            this._animateButton.style.background = '#FFA726';
            this._animateButton.title = 'Stop auto-animate';
        }
    }

    /**
     * Override _handleValueChange to update controller when slider changes manually
     * @private
     */
    _handleValueChange() {
        super._handleValueChange();

        // Update controller when value changes manually (not during animation)
        if (this._controller && !this._isAnimating) {
            this._controller.setAlpha(this.value);
        }
    }
}

// Register custom element
customElements.define('animation-alpha', AnimationAlpha);
