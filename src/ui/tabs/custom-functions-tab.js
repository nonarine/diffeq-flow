/**
 * Custom Functions tab for the modal window
 *
 * Allows users to define custom mathematical functions that can be used
 * in vector field expressions, color expressions, and mapper functions.
 */

import { Tab } from './tab-base.js';

export class CustomFunctionsTab extends Tab {
    constructor(mathParser, debouncedApply) {
        super('custom-functions', 'Custom Functions');
        this.mathParser = mathParser;
        this.debouncedApply = debouncedApply;

        // UI elements (created in render())
        this.textarea = null;
        this.applyButton = null;
        this.errorDiv = null;
        this.successDiv = null;
    }

    /**
     * Render the tab content
     */
    render(container) {
        const content = document.createElement('div');
        content.id = 'custom-functions-tab-content';
        content.className = 'modal-tab-content';
        content.style.display = 'none';

        content.innerHTML = `
            <div class="info" style="margin-bottom: 16px;">
                Define custom functions using mathematical syntax. Functions can be used in vector field expressions, color expressions, and mapper functions.
            </div>

            <h4 style="margin: 0 0 12px 0; padding: 0; font-size: 14px; color: #4CAF50;">Syntax</h4>
            <div class="info" style="margin-bottom: 16px; font-family: monospace; background: #000; padding: 8px; border-radius: 4px; font-size: 11px;">
                functionName(arg1, arg2, ...) = expression<br>
                <br>
                <span style="color: #888;">Examples:</span><br>
                <span style="color: #4CAF50;">smoothstep(x, a, b) = ((x-a)/(b-a))^3 * (3 - 2*((x-a)/(b-a)))</span><br>
                <span style="color: #4CAF50;">lerp(a, b, t) = a * (1-t) + b * t</span><br>
                <span style="color: #4CAF50;">sqr(x) = x * x</span><br>
                <span style="color: #4CAF50;">cube(x) = x * x * x</span>
            </div>

            <h4 style="margin: 0 0 8px 0; padding: 0; font-size: 14px; color: #4CAF50;">Function Definitions</h4>
            <div class="control-group">
                <textarea id="custom-functions-textarea"
                    rows="12"
                    style="width: 100%; font-family: 'Courier New', monospace; font-size: 12px; background: #1a1a1a; color: #4CAF50; border: 1px solid #444; border-radius: 4px; padding: 10px; resize: vertical;"
                    placeholder="Enter custom function definitions (one per line)...&#10;&#10;Example:&#10;smoothstep(x, a, b) = ((x-a)/(b-a))^3 * (3 - 2*((x-a)/(b-a)))"></textarea>
                <div class="info">One function per line. Use standard math operators (+, -, *, /, ^) and built-in functions (sin, cos, exp, log, sqrt, abs, etc.)</div>
            </div>

            <div class="control-group" style="margin-top: 12px;">
                <button id="apply-custom-functions" style="width: 100%; padding: 8px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
                    Apply Functions
                </button>
            </div>

            <div id="custom-functions-error" style="display: none; margin-top: 12px; padding: 8px; background: rgba(244, 67, 54, 0.1); border: 1px solid #f44336; border-radius: 4px; color: #f44336; font-size: 11px;"></div>

            <div id="custom-functions-success" style="display: none; margin-top: 12px; padding: 8px; background: rgba(76, 175, 80, 0.1); border: 1px solid #4CAF50; border-radius: 4px; color: #4CAF50; font-size: 11px;"></div>
        `;

        container.appendChild(content);

        // Get references to UI elements
        this.textarea = content.querySelector('#custom-functions-textarea');
        this.applyButton = content.querySelector('#apply-custom-functions');
        this.errorDiv = content.querySelector('#custom-functions-error');
        this.successDiv = content.querySelector('#custom-functions-success');

        // Setup event listeners
        this.applyButton.addEventListener('click', () => this._applyFunctions());

        // Load saved functions from localStorage
        this._loadSavedFunctions();

        return content;
    }

    /**
     * Called when tab becomes active
     */
    onActivate() {
        // Attach unicode autocomplete if available
        if (window.unicodeAutocomplete) {
            window.unicodeAutocomplete.attachToAll('#custom-functions-textarea');
        }
    }

    /**
     * Apply the custom functions
     * @private
     */
    _applyFunctions() {
        const functionsText = this.textarea.value;
        this.errorDiv.style.display = 'none';
        this.successDiv.style.display = 'none';

        try {
            // Parse and validate custom functions
            this.mathParser.setCustomFunctions(functionsText);

            // Show success message
            const functionCount = functionsText.trim()
                ? functionsText.trim().split('\n').filter(line => line.trim() && !line.trim().startsWith('//')).length
                : 0;
            this.successDiv.textContent = `✓ Successfully loaded ${functionCount} custom function(s)`;
            this.successDiv.style.display = 'block';

            // Save to localStorage
            localStorage.setItem('customFunctions', functionsText);

            // Trigger re-render
            this.debouncedApply();
        } catch (error) {
            // Show error message
            this.errorDiv.textContent = `Error: ${error.message}`;
            this.errorDiv.style.display = 'block';
        }
    }

    /**
     * Load saved functions from localStorage
     * @private
     */
    _loadSavedFunctions() {
        const savedFunctions = localStorage.getItem('customFunctions');
        if (savedFunctions && this.textarea) {
            this.textarea.value = savedFunctions;
            try {
                this.mathParser.setCustomFunctions(savedFunctions);
            } catch (error) {
                console.error('Error loading saved custom functions:', error);
            }
        }
    }
}
