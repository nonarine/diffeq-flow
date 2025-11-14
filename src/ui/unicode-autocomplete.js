/**
 * Unicode Symbol Autocomplete System
 *
 * Automatically replaces ASCII names with Unicode symbols in text inputs.
 * Example: typing "theta" → "θ", "phi" → "φ"
 */

// Global symbol mapping: ASCII name → Unicode symbol
const UNICODE_SYMBOLS = {
    // Greek letters (lowercase)
    'alpha': 'α',
    'beta': 'β',
    'gamma': 'γ',
    'delta': 'δ',
    'epsilon': 'ε',
    'zeta': 'ζ',
    'eta': 'η',
    'theta': 'θ',
    'iota': 'ι',
    'kappa': 'κ',
    'lambda': 'λ',
    'mu': 'μ',
    'nu': 'ν',
    'xi': 'ξ',
    'omicron': 'ο',
    'pi': 'π',
    'rho': 'ρ',
    'sigma': 'σ',
    'tau': 'τ',
    'upsilon': 'υ',
    'phi': 'φ',
    'chi': 'χ',
    'psi': 'ψ',
    'omega': 'ω',

    // Greek letters (uppercase)
    'Alpha': 'Α',
    'Beta': 'Β',
    'Gamma': 'Γ',
    'Delta': 'Δ',
    'Epsilon': 'Ε',
    'Zeta': 'Ζ',
    'Eta': 'Η',
    'Theta': 'Θ',
    'Iota': 'Ι',
    'Kappa': 'Κ',
    'Lambda': 'Λ',
    'Mu': 'Μ',
    'Nu': 'Ν',
    'Xi': 'Ξ',
    'Omicron': 'Ο',
    'Pi': 'Π',
    'Rho': 'Ρ',
    'Sigma': 'Σ',
    'Tau': 'Τ',
    'Upsilon': 'Υ',
    'Phi': 'Φ',
    'Chi': 'Χ',
    'Psi': 'Ψ',
    'Omega': 'Ω',
};

// Reverse mapping for parsing: Unicode → ASCII
const UNICODE_TO_ASCII = {};
for (const [ascii, unicode] of Object.entries(UNICODE_SYMBOLS)) {
    UNICODE_TO_ASCII[unicode] = ascii;
}

class UnicodeAutocomplete {
    constructor() {
        this.enabled = true;
        this.attachedInputs = new Set();
    }

    /**
     * Enable or disable autocomplete globally
     */
    setEnabled(enabled) {
        this.enabled = enabled;
    }

    /**
     * Attach autocomplete to a text input element
     */
    attach(input) {
        if (this.attachedInputs.has(input)) {
            return; // Already attached
        }

        const handler = (event) => this.handleInput(event, input);
        input.addEventListener('input', handler);

        // Store handler reference for potential cleanup
        input._unicodeAutocompleteHandler = handler;
        this.attachedInputs.add(input);
    }

    /**
     * Detach autocomplete from a text input element
     */
    detach(input) {
        if (!this.attachedInputs.has(input)) {
            return;
        }

        if (input._unicodeAutocompleteHandler) {
            input.removeEventListener('input', input._unicodeAutocompleteHandler);
            delete input._unicodeAutocompleteHandler;
        }

        this.attachedInputs.delete(input);
    }

    /**
     * Handle input event and perform replacements
     */
    handleInput(event, input) {
        if (!this.enabled) {
            return;
        }

        const cursorPos = input.selectionStart;
        const value = input.value;

        // Find the word before the cursor
        const beforeCursor = value.substring(0, cursorPos);
        const wordMatch = beforeCursor.match(/(\w+)$/);

        if (!wordMatch) {
            return; // No word to check
        }

        const word = wordMatch[1];
        const wordStart = cursorPos - word.length;

        // Check if this word should be replaced
        if (UNICODE_SYMBOLS.hasOwnProperty(word)) {
            const symbol = UNICODE_SYMBOLS[word];

            // Replace the word with the symbol
            const newValue = value.substring(0, wordStart) +
                           symbol +
                           value.substring(cursorPos);

            input.value = newValue;

            // Restore cursor position after the symbol
            const newCursorPos = wordStart + symbol.length;
            input.setSelectionRange(newCursorPos, newCursorPos);

            // Trigger change event so other listeners know the value changed
            const changeEvent = new Event('change', { bubbles: true });
            input.dispatchEvent(changeEvent);
        }
    }

    /**
     * Attach to all text inputs matching a selector
     */
    attachToAll(selector) {
        const inputs = document.querySelectorAll(selector);
        inputs.forEach(input => this.attach(input));
    }

    /**
     * Convert Unicode symbols in a string back to ASCII for parsing
     */
    static unicodeToAscii(str) {
        let result = str;
        for (const [unicode, ascii] of Object.entries(UNICODE_TO_ASCII)) {
            result = result.replaceAll(unicode, ascii);
        }
        return result;
    }

    /**
     * Convert ASCII names in a string to Unicode symbols
     */
    static asciiToUnicode(str) {
        let result = str;

        // Sort by length (longest first) to avoid partial replacements
        const sortedEntries = Object.entries(UNICODE_SYMBOLS)
            .sort((a, b) => b[0].length - a[0].length);

        for (const [ascii, unicode] of sortedEntries) {
            // Use word boundaries to avoid replacing parts of words
            const regex = new RegExp(`\\b${ascii}\\b`, 'g');
            result = result.replace(regex, unicode);
        }

        return result;
    }
}

// Global singleton instance
const unicodeAutocomplete = new UnicodeAutocomplete();

// Export for use in other modules
window.UnicodeAutocomplete = UnicodeAutocomplete;
window.unicodeAutocomplete = unicodeAutocomplete;
window.UNICODE_SYMBOLS = UNICODE_SYMBOLS;
window.UNICODE_TO_ASCII = UNICODE_TO_ASCII;
