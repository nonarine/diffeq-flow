/**
 * Percent Slider Web Component
 */

import { LinearSlider } from './slider.js';

/**
 * PercentSlider - Shows 0-100 in UI, stores 0.0-1.0 in settings
 *
 * Extends LinearSlider with transform="100" by default
 *
 * Usage:
 * <percent-slider
 *   id="color-saturation"
 *   label="Saturation"
 *   default="1.0"
 *   min="0"
 *   max="100"
 *   step="1"
 *   display-format="2">
 *   <label>
 *     <span>{{label}}</span>: <span bind-text="value">{{value}}</span>
 *   </label>
 *   <input type="range" min="{{min}}" max="{{max}}" step="{{step}}" value="{{value}}">
 * </percent-slider>
 */
export class PercentSlider extends LinearSlider {
    constructor() {
        super();
        // Always use transform of 100 (slider 0-100 → value 0.0-1.0)
        this.transform = 100;
    }

    initializeProperties() {
        // Call parent initialization
        super.initializeProperties();

        // Override transform to always be 100
        this.transform = 100;
    }
}
