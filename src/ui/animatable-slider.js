/**
 * Animatable Slider Control
 * A slider with animation bounds that can be set graphically using multiple handles
 */

import { SliderControl } from './control-base.js';

/**
 * AnimatableSliderControl
 * Extends SliderControl with multi-thumb slider for setting animation bounds
 */
export class AnimatableSliderControl extends SliderControl {
    constructor(id, defaultValue, options = {}) {
        super(id, defaultValue, options);

        // Animation state
        this.animationEnabled = false;
        this.animationMin = options.animationMin !== undefined ? options.animationMin : this.transform(this.min);
        this.animationMax = options.animationMax !== undefined ? options.animationMax : this.transform(this.max);
        this.currentAlpha = 0.0;

        // Track if we're currently animating
        this.isAnimating = false;
    }

    /**
     * Enable/disable animation for this control
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
     * Update the current value indicator position
     */
    updateCurrentIndicator(alpha) {
        const indicator = $(`#${this.id}-current-indicator`);
        if (indicator.length) {
            // Position as percentage
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
            // Convert values to slider positions (0-100)
            const minSliderValue = this.inverseTransform(this.animationMin);
            const maxSliderValue = this.inverseTransform(this.animationMax);

            const minPercent = ((minSliderValue - this.min) / (this.max - this.min)) * 100;
            const maxPercent = ((maxSliderValue - this.min) / (this.max - this.min)) * 100;

            minHandle.css('left', `${minPercent}%`);
            maxHandle.css('left', `${maxPercent}%`);

            // Update range bar between handles
            range.css({
                'left': `${minPercent}%`,
                'width': `${maxPercent - minPercent}%`
            });

            // Update display values
            if (minDisplay.length) minDisplay.text(this.displayFormat(this.animationMin));
            if (maxDisplay.length) maxDisplay.text(this.displayFormat(this.animationMax));
        }
    }

    /**
     * Update the UI to show/hide animation controls
     */
    updateAnimationUI() {
        const boundsContainer = $(`#${this.id}-animation-bounds`);
        const animBtn = $(`#${this.id}-anim-btn`);

        if (this.animationEnabled) {
            boundsContainer.slideDown(200);
            animBtn.addClass('active');
            animBtn.attr('title', 'Disable animation (🎬)');
            this.updateBoundsDisplay();
        } else {
            boundsContainer.slideUp(200);
            animBtn.removeClass('active');
            animBtn.attr('title', 'Enable animation (🎬)');
        }
    }

    /**
     * Override attach listeners to add animation controls
     */
    attachListeners(callback) {
        // Call parent to attach basic slider listeners
        super.attachListeners(callback);

        const element = $(`#${this.id}`);
        const container = element.closest('.slider-control');

        // Add animation button after the reset button
        const animBtn = $('<button>')
            .attr('id', `${this.id}-anim-btn`)
            .addClass('slider-btn anim-btn')
            .attr('title', 'Enable animation (🎬)')
            .html('🎬')
            .on('click', (e) => {
                e.stopPropagation();
                this.setAnimationEnabled(!this.animationEnabled);
            });

        container.append(animBtn);

        // Add multi-thumb slider container (initially hidden)
        const boundsHTML = `
            <div id="${this.id}-animation-bounds" class="animation-bounds-slider" style="display: none;">
                <div class="bounds-labels">
                    <span>Min: <span id="${this.id}-min-display">${this.displayFormat(this.animationMin)}</span></span>
                    <span>Max: <span id="${this.id}-max-display">${this.displayFormat(this.animationMax)}</span></span>
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
        container.after(boundsHTML);

        // Attach drag handlers to thumbs
        this.attachThumbDragHandlers();
    }

    /**
     * Attach drag handlers to the min/max thumbs
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
                $('body').css('user-select', 'none');
                e.preventDefault();
            });

            $(document).on('mousemove', (e) => {
                if (!isDragging) return;

                const trackWidth = track.width();
                const deltaX = e.pageX - startX;
                const deltaPercent = (deltaX / trackWidth) * 100;
                let newPercent = startLeft + deltaPercent;

                // Clamp to 0-100
                newPercent = Math.max(0, Math.min(100, newPercent));

                // Convert percent to slider value
                const sliderValue = this.min + (newPercent / 100) * (this.max - this.min);
                const actualValue = this.transform(sliderValue);

                // Update the bound
                if (bound === 'min') {
                    // Don't let min exceed max
                    if (actualValue <= this.animationMax) {
                        this.animationMin = actualValue;
                    }
                } else {
                    // Don't let max go below min
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
     * Save animation state to settings
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
     * Restore animation state from settings
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

    /**
     * Get all animatable controls that are enabled
     */
    static getAllAnimatableControls(controlManager) {
        const animatable = [];
        controlManager.controls.forEach((control) => {
            if (control instanceof AnimatableSliderControl && control.animationEnabled) {
                animatable.push(control);
            }
        });
        return animatable;
    }
}
