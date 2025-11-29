/**
 * NotebookModal - Generic modal with notebook REPL and custom content
 *
 * Provides a modal overlay with:
 * - Custom content area (for editor-specific controls)
 * - Notebook REPL section (always present)
 * - Apply/Cancel buttons with validation
 *
 * Used for:
 * - Standalone Notebook editor
 * - Custom integrator/transform editors
 * - Field equation advanced editor
 * - Any other math expression editing
 */

import { logger } from '../../utils/debug-logger.js';
import { NotebookREPL } from './notebook-repl.js';

export class NotebookModal {
    /**
     * @param {Object} config - Modal configuration
     * @param {string} config.title - Modal title
     * @param {HTMLElement|string} config.customContent - Custom HTML content or element
     * @param {Function} config.onApply - Apply callback: (notebook, customFields) => {success: bool, error?: string}
     * @param {Function} config.onCancel - Cancel callback (optional)
     * @param {string} config.applyButtonText - Apply button text (default: "Apply")
     * @param {boolean} config.showNotebook - Show notebook section (default: true)
     * @param {boolean} config.showExport - Show export/import in notebook (default: true)
     */
    constructor(config) {
        this.config = {
            title: config.title || 'Notebook Editor',
            customContent: config.customContent || null,
            onApply: config.onApply || (() => ({ success: true })),
            onCancel: config.onCancel || null,
            applyButtonText: config.applyButtonText || 'Apply',
            showNotebook: config.showNotebook !== false,
            showExport: config.showExport !== false
        };

        this.overlay = null;
        this.modalContainer = null;
        this.notebookRepl = null;
        this.customContentContainer = null;
        this.errorContainer = null;
        this.isVisible = false;

        this._createUI();
    }

    /**
     * Create the modal UI
     * @private
     */
    _createUI() {
        // Modal overlay (backdrop)
        this.overlay = document.createElement('div');
        this.overlay.className = 'notebook-modal-overlay';

        // Click overlay to close
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.hide();
            }
        });

        // Modal container
        this.modalContainer = document.createElement('div');
        this.modalContainer.className = 'notebook-modal-container';

        // Title bar
        const titleBar = document.createElement('div');
        titleBar.className = 'notebook-modal-header';

        const title = document.createElement('h2');
        title.className = 'notebook-modal-title';
        title.textContent = this.config.title;

        // Title bar buttons container
        const titleButtons = document.createElement('div');
        titleButtons.style.cssText = 'display: flex; gap: 8px; align-items: center;';

        // Export/Import buttons (if enabled)
        if (this.config.showExport) {
            const exportButton = document.createElement('button');
            exportButton.className = 'notebook-modal-header-button';
            exportButton.textContent = 'Export';
            exportButton.title = 'Export notebook as JSON';
            exportButton.addEventListener('click', () => {
                if (this.notebookRepl) this.notebookRepl.exportNotebook();
            });

            const importButton = document.createElement('button');
            importButton.className = 'notebook-modal-header-button';
            importButton.textContent = 'Import';
            importButton.title = 'Import notebook from JSON';
            importButton.addEventListener('click', () => {
                if (this.notebookRepl) this.notebookRepl.importNotebook();
            });

            titleButtons.appendChild(exportButton);
            titleButtons.appendChild(importButton);
        }

        const closeButton = document.createElement('button');
        closeButton.className = 'notebook-modal-close';
        closeButton.textContent = '×';
        closeButton.title = 'Close';
        closeButton.addEventListener('click', () => this.hide());

        titleButtons.appendChild(closeButton);

        titleBar.appendChild(title);
        titleBar.appendChild(titleButtons);

        // Content area
        const contentArea = document.createElement('div');
        contentArea.className = 'notebook-modal-content';

        // Custom content section
        this.customContentContainer = document.createElement('div');
        this.customContentContainer.className = 'notebook-modal-custom-content';

        if (this.config.customContent) {
            if (typeof this.config.customContent === 'string') {
                this.customContentContainer.innerHTML = this.config.customContent;
            } else if (this.config.customContent instanceof HTMLElement) {
                this.customContentContainer.appendChild(this.config.customContent);
            }
            contentArea.appendChild(this.customContentContainer);
        }

        // Notebook REPL section
        if (this.config.showNotebook) {
            const notebookSection = document.createElement('div');
            notebookSection.className = 'notebook-modal-notebook-section';

            this.notebookRepl = new NotebookREPL({
                showExport: false  // Export/Import in title bar instead
            });

            notebookSection.appendChild(this.notebookRepl.getElement());
            contentArea.appendChild(notebookSection);
        }

        // Error container
        this.errorContainer = document.createElement('div');
        this.errorContainer.className = 'notebook-modal-error';

        // Footer with buttons
        const footer = document.createElement('div');
        footer.className = 'notebook-modal-footer';

        const cancelButton = document.createElement('button');
        cancelButton.className = 'notebook-modal-button-cancel';
        cancelButton.textContent = 'Cancel';
        cancelButton.addEventListener('click', () => this.hide());

        const applyButton = document.createElement('button');
        applyButton.className = 'notebook-modal-button-apply';
        applyButton.textContent = this.config.applyButtonText;
        applyButton.addEventListener('click', () => this._handleApply());

        footer.appendChild(cancelButton);
        footer.appendChild(applyButton);

        // Assemble modal
        this.modalContainer.appendChild(titleBar);
        this.modalContainer.appendChild(contentArea);
        this.modalContainer.appendChild(this.errorContainer);
        this.modalContainer.appendChild(footer);

        this.overlay.appendChild(this.modalContainer);
        document.body.appendChild(this.overlay);

        // Close on Escape key
        this._escapeHandler = (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        };
        document.addEventListener('keydown', this._escapeHandler);
    }

    /**
     * Handle Apply button click
     * @private
     */
    async _handleApply() {
        try {
            // Clean up empty cells before applying
            if (this.notebookRepl) {
                this.notebookRepl.cleanupEmptyCells();
            }

            // Gather custom fields (if any)
            const customFields = this._gatherCustomFields();

            // Call apply callback
            const result = await this.config.onApply(window.notebook, customFields);

            if (result.success) {
                logger.info('Modal apply successful');
                this.hide();
            } else {
                // Show error
                alert(`Error: ${result.error || 'Unknown error'}`);
                logger.error('Modal apply failed:', result.error);
            }
        } catch (error) {
            alert(`Error: ${error.message}`);
            logger.error('Modal apply error:', error);
        }
    }

    /**
     * Gather values from custom content fields
     * @private
     * @returns {Object} Field values keyed by input ID
     */
    _gatherCustomFields() {
        const fields = {};

        if (!this.customContentContainer) return fields;

        // Gather all inputs, textareas, and selects
        const inputs = this.customContentContainer.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            if (input.id) {
                if (input.type === 'checkbox') {
                    fields[input.id] = input.checked;
                } else {
                    fields[input.id] = input.value;
                }
            }
        });

        return fields;
    }

    /**
     * Show the modal
     */
    show() {
        this.overlay.style.display = 'block';
        this.isVisible = true;

        // Clear any previous errors
        this.hideError();

        // Refresh notebook REPL
        if (this.notebookRepl) {
            this.notebookRepl.refresh();
        }

        logger.info('Opened notebook modal:', this.config.title);
    }

    /**
     * Hide the modal
     */
    hide() {
        // Clean up empty cells before closing
        if (this.notebookRepl) {
            this.notebookRepl.cleanupEmptyCells();
        }

        this.overlay.style.display = 'none';
        this.isVisible = false;

        // Call cancel callback if provided
        if (this.config.onCancel) {
            this.config.onCancel();
        }

        logger.info('Closed notebook modal');
    }

    /**
     * Check if modal is visible
     * @returns {boolean}
     */
    isOpen() {
        return this.isVisible;
    }

    /**
     * Get custom content container for dynamic manipulation
     * @returns {HTMLElement}
     */
    getCustomContentContainer() {
        return this.customContentContainer;
    }

    /**
     * Get notebook REPL instance
     * @returns {NotebookREPL}
     */
    getNotebookREPL() {
        return this.notebookRepl;
    }

    /**
     * Show error message in modal
     * @param {string} errorHtml - Error message (can include HTML)
     */
    showError(errorHtml) {
        this.errorContainer.innerHTML = errorHtml;
        this.errorContainer.style.display = 'block';
    }

    /**
     * Hide error message
     */
    hideError() {
        this.errorContainer.style.display = 'none';
        this.errorContainer.innerHTML = '';
    }

    /**
     * Destroy the modal and clean up
     */
    destroy() {
        document.removeEventListener('keydown', this._escapeHandler);

        if (this.notebookRepl) {
            this.notebookRepl.destroy();
        }

        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }

        this.overlay = null;
        this.modalContainer = null;
        this.notebookRepl = null;
        this.customContentContainer = null;
    }
}
