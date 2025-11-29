/**
 * Standalone Notebook Editor
 *
 * Opens the notebook modal for editing math functions and definitions
 * Accessible via top menu bar button
 */

import { logger } from '../utils/debug-logger.js';
import { NotebookModal } from './components/notebook-modal.js';

export class NotebookEditor {
    constructor() {
        this.modal = null;
        this._initialized = false;
    }

    /**
     * Initialize the notebook editor (lazy - called on first open)
     * @private
     */
    _initialize() {
        if (this._initialized) return;

        // Create modal instance (minimal config for standalone notebook)
        this.modal = new NotebookModal({
            title: 'Notebook',
            customContent: null,  // No extra content needed
            applyButtonText: 'Close',
            showNotebook: true,
            showExport: true,
            onApply: () => {
                // Just close the modal, notebook auto-saves
                return { success: true };
            }
        });

        this._initialized = true;
        logger.info('Notebook editor initialized');
    }

    /**
     * Create info section for standalone notebook
     * @private
     */
    _createInfoSection() {
        const info = document.createElement('div');
        info.style.cssText = 'margin-bottom: 16px; font-size: 13px; color: #e0e0e0;';
        info.innerHTML = `
            <p style="margin: 0 0 8px 0;">
                Define mathematical functions and expressions that can be used throughout the application.
            </p>
            <p style="margin: 0; font-family: monospace; color: #888; font-size: 11px;">
                Example: <span style="color: #4CAF50;">f(x) = sin(x) * exp(-x)</span>
            </p>
        `;
        return info;
    }

    /**
     * Open the notebook editor
     */
    open() {
        // Lazy-initialize on first open
        this._initialize();
        this.modal.show();
    }

    /**
     * Check if notebook editor is open
     * @returns {boolean}
     */
    isOpen() {
        return this.modal && this.modal.isOpen();
    }

    /**
     * Get the modal instance (for advanced usage)
     * @returns {NotebookModal}
     */
    getModal() {
        return this.modal;
    }
}

// Create global singleton instance
export const notebookEditor = new NotebookEditor();
