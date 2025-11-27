/**
 * AnimatableSliderMixin - Add animation bounds UI to sliders
 *
 * Provides multi-thumb slider UI for setting animation min/max bounds,
 * animation state management, and interpolation during animation playback.
 *
 * Note: Accordion resizing is handled automatically by AccordionAwareMixin.
 * This mixin just calls triggerAccordionResize() when showing/hiding UI.
 */

/**
 * AnimatableSliderMixin
 *
 * Adds animation capabilities to any slider control:
 * - Animation enable/disable button (🎬)
 * - Multi-thumb bounds slider (MIN/MAX handles)
 * - Current value indicator (orange line during playback)
 * - Animation state save/restore
 *
 * @param {Class} Base - Base class to extend (should be a slider with getValue/setValue)
 * @returns {Class} Extended class with animation capabilities
 */
export const AnimatableSliderMixin = (Base) => class extends Base {
    constructor() {
        super();

        // Animation state
        this.animationEnabled = false;
        this.animationMin = null; // Set in connectedCallback
        this.animationMax = null;
        this.currentAlpha = 0.0;
        this.isAnimating = false;
    }

    /**
     * Override connectedCallback to initialize animation bounds
     */
    connectedCallback() {
        super.connectedCallback();

        // Initialize animation bounds from attributes or defaults
        const animMinAttr = this.getAttribute('animation-min');
        const animMaxAttr = this.getAttribute('animation-max');

        if (animMinAttr !== null) {
            this.animationMin = parseFloat(animMinAttr);
        }
        if (animMaxAttr !== null) {
            this.animationMax = parseFloat(animMaxAttr);
        }

        // Default to full range if not specified
        if (this.animationMin === null) {
            this.animationMin = this.min || 0;
        }
        if (this.animationMax === null) {
            this.animationMax = this.max || 100;
        }
    }

    /**
     * Override attachInternalListeners to add animation UI
     */
    attachInternalListeners() {
        super.attachInternalListeners();

        // Add animation button after other controls
        this.addAnimationButton();

        // Add multi-thumb slider UI (initially hidden)
        this.addAnimationBoundsUI();

        // Attach drag handlers to thumbs
        this.attachThumbDragHandlers();
    }

    /**
     * Add animation enable/disable button
     */
    addAnimationButton() {
        const container = this.querySelector('.slider-control');
        if (!container) return;

        const animBtn = document.createElement('button');
        animBtn.id = `${this.id}-anim-btn`;
        animBtn.className = 'slider-btn anim-btn';
        animBtn.title = 'Enable animation (🎬)';
        animBtn.textContent = '🎬';
        animBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.setAnimationEnabled(!this.animationEnabled);
        });

        container.appendChild(animBtn);
    }

    /**
     * Add multi-thumb slider UI for animation bounds
     */
    addAnimationBoundsUI() {
        const container = this.querySelector('.slider-control');
        if (!container) return;

        const boundsHTML = `
            <div id="${this.id}-animation-bounds" class="animation-bounds-slider" style="display: none;">
                <div class="bounds-labels">
                    <span>Min: <span id="${this.id}-min-display">${this.formatValue(this.animationMin)}</span></span>
                    <span>Max: <span id="${this.id}-max-display">${this.formatValue(this.animationMax)}</span></span>
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

        container.insertAdjacentHTML('afterend', boundsHTML);
    }

    /**
     * Enable/disable animation for this control
     */
    setAnimationEnabled(enabled) {
        this.animationEnabled = enabled;
        this.updateAnimationUI();
    }

    /**
     * Update the UI to show/hide animation controls
     */
    updateAnimationUI() {
        const boundsContainer = document.getElementById(`${this.id}-animation-bounds`);
        const animBtn = document.getElementById(`${this.id}-anim-btn`);

        if (!boundsContainer || !animBtn) return;

        if (this.animationEnabled) {
            // Use jQuery slideDown for smooth animation
            if (typeof $ !== 'undefined') {
                $(boundsContainer).slideDown(200, () => {
                    // Trigger accordion resize (handled by AccordionAwareMixin)
                    if (this.triggerAccordionResize) {
                        this.triggerAccordionResize();
                    }
                });
            } else {
                boundsContainer.style.display = 'block';
                if (this.triggerAccordionResize) {
                    this.triggerAccordionResize();
                }
            }

            animBtn.classList.add('active');
            animBtn.title = 'Disable animation (🎬)';
            this.updateBoundsDisplay();
        } else {
            // Use jQuery slideUp for smooth animation
            if (typeof $ !== 'undefined') {
                $(boundsContainer).slideUp(200, () => {
                    // Trigger accordion resize (handled by AccordionAwareMixin)
                    if (this.triggerAccordionResize) {
                        this.triggerAccordionResize();
                    }
                });
            } else {
                boundsContainer.style.display = 'none';
                if (this.triggerAccordionResize) {
                    this.triggerAccordionResize();
                }
            }

            animBtn.classList.remove('active');
            animBtn.title = 'Enable animation (🎬)';
        }
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
     * Called during animation playback
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
        const indicator = document.getElementById(`${this.id}-current-indicator`);
        if (indicator) {
            indicator.style.left = `${alpha * 100}%`;
        }
    }

    /**
     * Update bounds display (handle positions and labels)
     */
    updateBoundsDisplay() {
        const minHandle = document.getElementById(`${this.id}-min-handle`);
        const maxHandle = document.getElementById(`${this.id}-max-handle`);
        const minDisplay = document.getElementById(`${this.id}-min-display`);
        const maxDisplay = document.getElementById(`${this.id}-max-display`);
        const range = document.getElementById(`${this.id}-range`);

        if (!minHandle || !maxHandle) return;

        // Get min/max as percentages of the full slider range
        const minPercent = this.valueToPercent(this.animationMin);
        const maxPercent = this.valueToPercent(this.animationMax);

        minHandle.style.left = `${minPercent}%`;
        maxHandle.style.left = `${maxPercent}%`;

        if (range) {
            range.style.left = `${minPercent}%`;
            range.style.width = `${maxPercent - minPercent}%`;
        }

        if (minDisplay) minDisplay.textContent = this.formatValue(this.animationMin);
        if (maxDisplay) maxDisplay.textContent = this.formatValue(this.animationMax);
    }

    /**
     * Convert value to percentage position on slider
     * Override if slider uses non-linear scaling
     */
    valueToPercent(value) {
        // Default linear scaling
        const minValue = this.min || 0;
        const maxValue = this.max || 100;
        return ((value - minValue) / (maxValue - minValue)) * 100;
    }

    /**
     * Convert percentage position to value
     * Override if slider uses non-linear scaling
     */
    percentToValue(percent) {
        // Default linear scaling
        const minValue = this.min || 0;
        const maxValue = this.max || 100;
        return minValue + (percent / 100) * (maxValue - minValue);
    }

    /**
     * Attach drag handlers to the min/max thumbs
     */
    attachThumbDragHandlers() {
        const minHandle = document.getElementById(`${this.id}-min-handle`);
        const maxHandle = document.getElementById(`${this.id}-max-handle`);

        if (!minHandle || !maxHandle) return;

        const track = minHandle.parentElement;

        [
            { handle: minHandle, bound: 'min' },
            { handle: maxHandle, bound: 'max' }
        ].forEach(({ handle, bound }) => {
            let isDragging = false;

            handle.addEventListener('mousedown', (e) => {
                isDragging = true;
                handle.classList.add('dragging');
                document.body.style.userSelect = 'none';
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;

                // Get mouse position relative to track
                const rect = track.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const trackWidth = rect.width;

                // Calculate percentage position (0-100)
                let newPercent = (mouseX / trackWidth) * 100;
                newPercent = Math.max(0, Math.min(100, newPercent));

                // Convert to value
                const value = this.percentToValue(newPercent);

                // Update bound (with constraints)
                if (bound === 'min') {
                    if (value <= this.animationMax) {
                        this.animationMin = value;
                    }
                } else {
                    if (value >= this.animationMin) {
                        this.animationMax = value;
                    }
                }

                this.updateBoundsDisplay();
            });

            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    handle.classList.remove('dragging');
                    document.body.style.userSelect = '';
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

        if (settings && settings.animations && settings.animations[this.settingsKey]) {
            const animData = settings.animations[this.settingsKey];
            this.animationEnabled = animData.enabled || false;
            this.animationMin = animData.min;
            this.animationMax = animData.max;

            // Update UI after DOM is ready
            requestAnimationFrame(() => {
                this.updateAnimationUI();
            });
        }
    }
};
