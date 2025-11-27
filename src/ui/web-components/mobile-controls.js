import { ControlElement } from './base.js';
import { CompositeMixin, ShadowDOMMixin, composeMixins } from '../mixins/index.js';

/**
 * Mobile Controls Component
 * Unified compact control panel for mobile view containing:
 * - FPS display
 * - Timestep slider with +/- buttons
 * - Frame limit toggle and slider
 *
 * Uses shadow DOM for style encapsulation (ShadowDOMMixin).
 * Composite control with children: timestep, frameLimitEnabled, frameLimit (CompositeMixin).
 */
export class MobileControls extends composeMixins(
    ControlElement,
    CompositeMixin,
    ShadowDOMMixin
) {
    constructor() {
        super();

        // Default values (mobile-specific)
        this._defaultValue = {
            timestep: 0.01,
            frameLimitEnabled: true,
            frameLimit: 200
        };

        // Timestep slider curve (makes low values easier to adjust)
        this._timestepCurve = 0.4;

        // State
        this._fps = '--';
        this._timestep = this._defaultValue.timestep;
        this._timestepLog = Math.log10(this._timestep);
        this._frameLimitEnabled = this._defaultValue.frameLimitEnabled;
        this._frameLimit = this._defaultValue.frameLimit;
    }

    static get observedAttributes() {
        return ['settings-key', 'default-timestep', 'default-frame-limit', 'default-frame-limit-enabled'];
    }

    initializeProperties() {
        // Read default values from attributes if provided
        if (this.hasAttribute('default-timestep')) {
            this._defaultValue.timestep = parseFloat(this.getAttribute('default-timestep'));
            this._timestep = this._defaultValue.timestep;
            this._timestepLog = Math.log10(this._timestep);
        }
        if (this.hasAttribute('default-frame-limit')) {
            this._defaultValue.frameLimit = parseInt(this.getAttribute('default-frame-limit'));
            this._frameLimit = this._defaultValue.frameLimit;
        }
        if (this.hasAttribute('default-frame-limit-enabled')) {
            this._defaultValue.frameLimitEnabled = this.getAttribute('default-frame-limit-enabled') === 'true';
            this._frameLimitEnabled = this._defaultValue.frameLimitEnabled;
        }
    }

    connectedCallback() {
        if (this._initialized) return;

        // Initialize control properties
        this.initializeControlProperties();
        this.initializeProperties();

        this.render();
        this.initializeChildren();
        this.attachInternalListeners();
        this.updateTheme();

        // Watch for theme changes
        this._themeObserver = new MutationObserver(() => this.updateTheme());
        this._themeObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['class']
        });

        this._initialized = true;
    }

    /**
     * Register child controls (required by CompositeControlElement)
     */
    initializeChildren() {
        // Register timestep control
        this.registerChildControl(
            'timestep',
            () => this._timestep,
            (v) => this.setTimestep(v),
            () => this.setTimestep(this._defaultValue.timestep)
        );

        // Register frameLimitEnabled control
        this.registerChildControl(
            'frameLimitEnabled',
            () => this._frameLimitEnabled,
            (v) => this.setFrameLimitEnabled(v),
            () => this.setFrameLimitEnabled(this._defaultValue.frameLimitEnabled)
        );

        // Register frameLimit control
        this.registerChildControl(
            'frameLimit',
            () => this._frameLimit,
            (v) => this.setFrameLimit(v),
            () => this.setFrameLimit(this._defaultValue.frameLimit)
        );
    }

    disconnectedCallback() {
        if (this._themeObserver) {
            this._themeObserver.disconnect();
        }
    }

    updateTheme() {
        if (document.body.classList.contains('light-theme')) {
            this.classList.add('light-theme');
        } else {
            this.classList.remove('light-theme');
        }
    }

    render() {
        // Render to shadow DOM for style encapsulation (provided by ShadowDOMMixin)
        this.renderToShadow(`
            <style>
                :host {
                    display: block;
                }

                .container {
                    background: rgba(30, 30, 30, 0.9);
                    border: 1px solid #444;
                    border-radius: 4px;
                    padding: 6px 8px;
                    font-size: 10px;
                    color: #4CAF50;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                }

                :host(.light-theme) .container {
                    background: rgba(255, 255, 255, 0.9);
                    border-color: #ccc;
                    color: #2E7D32;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
                }

                .fps-display {
                    text-align: right;
                    font-weight: bold;
                    margin-bottom: 3px;
                    font-size: 10px;
                }

                .controls-grid {
                    display: grid;
                    grid-template-columns: 1fr 1px 1fr;
                    gap: 6px;
                    align-items: start;
                }

                .divider {
                    width: 1px;
                    height: 100%;
                    background: #444;
                    justify-self: center;
                }

                :host(.light-theme) .divider {
                    background: #ccc;
                }

                /* Timestep section */
                .timestep-section {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    min-width: 0; /* Allow grid to shrink this properly */
                }

                .timestep-label {
                    font-size: 11px;
                    font-weight: bold;
                    text-align: center;
                    /* Inherits color from .container (#4CAF50 or #2E7D32) */
                }

                .timestep-controls {
                    display: flex;
                    align-items: center;
                    gap: 3px;
                }

                .btn {
                    padding: 0px 4px;
                    font-size: 11px;
                    min-width: 20px;
                    height: 20px;
                    line-height: 20px;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid #555;
                    border-radius: 2px;
                    color: #fff;
                    cursor: pointer;
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .btn:active {
                    background: rgba(255, 255, 255, 0.2);
                }

                :host(.light-theme) .btn {
                    background: rgba(0, 0, 0, 0.05);
                    border-color: #bbb;
                    color: #333;
                }

                :host(.light-theme) .btn:active {
                    background: rgba(0, 0, 0, 0.1);
                }

                .timestep-slider {
                    flex: 1;
                    min-width: 0;
                }

                /* Frame limit section */
                .frame-limit-section {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    min-width: 0; /* Allow grid to shrink this properly */
                }

                .frame-limit-header {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }

                .frame-limit-label {
                    color: #aaa;
                    font-size: 11px;
                    font-weight: 500;
                    display: flex;
                    align-items: center;
                    gap: 3px;
                    cursor: pointer;
                    user-select: none;
                }

                :host(.light-theme) .frame-limit-label {
                    color: #666;
                }

                .frame-limit-checkbox {
                    margin: 0;
                    cursor: pointer;
                }

                .frame-limit-value {
                    color: #4CAF50;
                    font-weight: bold;
                    font-size: 10px;
                    margin-left: auto;
                }

                :host(.light-theme) .frame-limit-value {
                    color: #2E7D32;
                }

                .frame-limit-slider {
                    width: 100%;
                }

                /* Slider styling */
                input[type="range"] {
                    -webkit-appearance: none;
                    appearance: none;
                    background: transparent;
                    cursor: pointer;
                }

                input[type="range"]::-webkit-slider-track {
                    background: #333;
                    height: 6px;
                    border-radius: 3px;
                }

                :host(.light-theme) input[type="range"]::-webkit-slider-track {
                    background: #ddd;
                }

                input[type="range"]::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 14px;
                    height: 14px;
                    border-radius: 50%;
                    background: #4CAF50;
                    cursor: pointer;
                    margin-top: -4px;
                }

                :host(.light-theme) input[type="range"]::-webkit-slider-thumb {
                    background: #2E7D32;
                }

                input[type="range"]::-moz-range-track {
                    background: #333;
                    height: 6px;
                    border-radius: 3px;
                }

                :host(.light-theme) input[type="range"]::-moz-range-track {
                    background: #ddd;
                }

                input[type="range"]::-moz-range-thumb {
                    width: 14px;
                    height: 14px;
                    border: none;
                    border-radius: 50%;
                    background: #4CAF50;
                    cursor: pointer;
                }

                :host(.light-theme) input[type="range"]::-moz-range-thumb {
                    background: #2E7D32;
                }
            </style>

            <div class="container">
                <div class="fps-display">FPS: ${this._fps}</div>

                <div class="controls-grid">
                <!-- Timestep section -->
                <div class="timestep-section">
                    <div class="timestep-label">Time Step: <span id="timestep-value">${this._timestep.toFixed(4)}</span></div>
                    <div class="timestep-controls">
                        <button class="btn" id="timestep-decrease">-</button>
                        <input type="range" class="timestep-slider" id="timestep-slider"
                               min="-3" max="0.4" step="0.01" value="${this.timestepLogToSlider(this._timestepLog)}">
                        <button class="btn" id="timestep-increase">+</button>
                    </div>
                </div>

                <!-- Divider -->
                <div class="divider"></div>

                <!-- Frame limit section -->
                <div class="frame-limit-section">
                    <div class="frame-limit-header">
                        <label class="frame-limit-label" for="frame-limit-checkbox">
                            <input type="checkbox" class="frame-limit-checkbox" id="frame-limit-checkbox" ${this._frameLimitEnabled ? 'checked' : ''}>
                            Stop at:
                        </label>
                        <span class="frame-limit-value" id="frame-limit-value">${this._frameLimit}</span>
                    </div>
                    <input type="range" class="frame-limit-slider" id="frame-limit-slider"
                           min="0" max="100" step="1" value="${this.frameToSlider(this._frameLimit)}">
                </div>
            </div>
            </div>
        `);
    }

    attachInternalListeners() {
        // Query elements (ShadowDOMMixin provides querySelector override)
        const timestepSlider = this.querySelector('#timestep-slider');
        const timestepValue = this.querySelector('#timestep-value');
        const decreaseBtn = this.querySelector('#timestep-decrease');
        const increaseBtn = this.querySelector('#timestep-increase');

        timestepSlider.addEventListener('input', () => {
            const rawSliderValue = parseFloat(timestepSlider.value);
            this._timestepLog = this.sliderToTimestepLog(rawSliderValue);
            this._timestep = Math.pow(10, this._timestepLog);
            timestepValue.textContent = this._timestep.toFixed(4);

            // Trigger ControlElement change callback
            this.triggerChange();

            // Also trigger component-specific callback for backward compatibility
            if (this.onTimestepChange) {
                this.onTimestepChange(this._timestep);
            }
        });

        decreaseBtn.addEventListener('click', () => {
            // Multiply by 0.98 (2% decrease) - linear adjustment
            const minTimestep = Math.pow(10, -3);
            this._timestep = Math.max(minTimestep, this._timestep * 0.98);
            this._timestepLog = Math.log10(this._timestep);
            timestepSlider.value = this.timestepLogToSlider(this._timestepLog);
            timestepValue.textContent = this._timestep.toFixed(4);

            this.triggerChange();
            if (this.onTimestepChange) {
                this.onTimestepChange(this._timestep);
            }
        });

        increaseBtn.addEventListener('click', () => {
            // Multiply by 1.02 (2% increase) - linear adjustment
            const maxTimestep = Math.pow(10, 0.4);
            this._timestep = Math.min(maxTimestep, this._timestep * 1.02);
            this._timestepLog = Math.log10(this._timestep);
            timestepSlider.value = this.timestepLogToSlider(this._timestepLog);
            timestepValue.textContent = this._timestep.toFixed(4);

            this.triggerChange();
            if (this.onTimestepChange) {
                this.onTimestepChange(this._timestep);
            }
        });

        // Frame limit controls
        const frameLimitCheckbox = this.querySelector('#frame-limit-checkbox');
        const frameLimitSlider = this.querySelector('#frame-limit-slider');
        const frameLimitValue = this.querySelector('#frame-limit-value');

        frameLimitCheckbox.addEventListener('change', () => {
            this._frameLimitEnabled = frameLimitCheckbox.checked;

            this.triggerChange();
            if (this.onFrameLimitEnabledChange) {
                this.onFrameLimitEnabledChange(this._frameLimitEnabled);
            }
        });

        frameLimitSlider.addEventListener('input', () => {
            const sliderValue = parseFloat(frameLimitSlider.value);
            this._frameLimit = this.sliderToFrame(sliderValue);
            frameLimitValue.textContent = this._frameLimit;

            this.triggerChange();
            if (this.onFrameLimitChange) {
                this.onFrameLimitChange(this._frameLimit);
            }
        });
    }

    // ====================================
    // Component-Specific Public Methods
    // (getValue/setValue/reset/attachListeners inherited from CompositeControlElement)
    // ====================================

    // Logarithmic scaling for frame limit (1 to 100000)
    frameToSlider(frame) {
        return (Math.log10(Math.max(1, frame)) / Math.log10(100000)) * 100;
    }

    sliderToFrame(sliderValue) {
        return Math.round(Math.pow(10, (sliderValue / 100) * Math.log10(100000)));
    }

    // Timestep slider with curve adjustment
    // Range: -3 to 0.4 (10^-3 to 10^0.4)
    sliderToTimestepLog(sliderValue) {
        const minLog = -3;
        const maxLog = 0.4;
        const range = maxLog - minLog;

        // Normalize to 0-1
        const normalized = (sliderValue - minLog) / range;

        // Apply curve (lower curve = easier to adjust small values)
        const curved = Math.pow(normalized, this._timestepCurve);

        // Map back to log range
        return minLog + curved * range;
    }

    timestepLogToSlider(logValue) {
        const minLog = -3;
        const maxLog = 0.4;
        const range = maxLog - minLog;

        // Normalize to 0-1
        const curved = (logValue - minLog) / range;

        // Apply inverse curve
        const normalized = Math.pow(curved, 1 / this._timestepCurve);

        // Map back to slider range
        return minLog + normalized * range;
    }

    // Public methods
    setFPS(fps) {
        this._fps = fps;
        if (!this.shadowRoot) return;
        const display = this.shadowRoot.querySelector('.fps-display');
        if (display) {
            display.textContent = `FPS: ${fps}`;
        }
    }

    setTimestep(timestep) {
        this._timestep = timestep;
        this._timestepLog = Math.log10(timestep);
        if (!this.shadowRoot) return;
        const slider = this.shadowRoot.querySelector('#timestep-slider');
        const value = this.shadowRoot.querySelector('#timestep-value');
        if (slider) slider.value = this.timestepLogToSlider(this._timestepLog);
        if (value) value.textContent = timestep.toFixed(4);
    }

    setFrameLimitEnabled(enabled) {
        this._frameLimitEnabled = enabled;
        if (!this.shadowRoot) return;
        const checkbox = this.shadowRoot.querySelector('#frame-limit-checkbox');
        if (checkbox) checkbox.checked = enabled;
    }

    setFrameLimit(limit) {
        this._frameLimit = limit;
        if (!this.shadowRoot) return;
        const slider = this.shadowRoot.querySelector('#frame-limit-slider');
        const value = this.shadowRoot.querySelector('#frame-limit-value');
        if (slider) slider.value = this.frameToSlider(limit);
        if (value) value.textContent = limit;
    }

    getTimestep() {
        return this._timestep;
    }

    getFrameLimitEnabled() {
        return this._frameLimitEnabled;
    }

    getFrameLimit() {
        return this._frameLimit;
    }
}

customElements.define('mobile-controls', MobileControls);
