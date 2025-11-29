/**
 * Notebook Debug Tab
 *
 * Shows the raw notebook context for debugging purposes.
 * Displays all defined functions and cells.
 */

import { Tab } from './tab-base.js';

export class NotebookDebugTab extends Tab {
    constructor() {
        super('notebook-debug', 'Notebook Debug');
        this.contextTextarea = null;
        this.refreshButton = null;
    }

    /**
     * Render the tab content
     */
    render(container) {
        const content = document.createElement('div');
        content.id = 'notebook-debug-tab-content';
        content.className = 'modal-tab-content';
        content.style.display = 'none';

        content.innerHTML = `
            <div class="info" style="margin-bottom: 16px;">
                Debug view of the current notebook context. Shows all defined functions and cells.
            </div>

            <h4 style="margin: 0 0 8px 0; padding: 0; font-size: 14px; color: #4CAF50;">Notebook Context</h4>
            <div class="control-group">
                <textarea id="notebook-debug-context"
                    readonly
                    rows="20"
                    style="width: 100%; font-family: 'Courier New', monospace; font-size: 11px; background: #0a0a0a; color: #4CAF50; border: 1px solid #444; border-radius: 4px; padding: 10px; resize: vertical;"></textarea>
            </div>

            <div class="control-group" style="margin-top: 12px;">
                <button id="refresh-notebook-debug" style="padding: 8px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
                    Refresh Context
                </button>
            </div>
        `;

        container.appendChild(content);

        // Get references
        this.contextTextarea = content.querySelector('#notebook-debug-context');
        this.refreshButton = content.querySelector('#refresh-notebook-debug');

        // Setup event listeners
        this.refreshButton.addEventListener('click', () => this._refreshContext());

        // Initial load
        this._refreshContext();

        return content;
    }

    /**
     * Called when tab becomes active
     */
    onActivate() {
        // Refresh context when tab is shown
        this._refreshContext();
    }

    /**
     * Refresh the notebook context display
     * @private
     */
    _refreshContext() {
        if (!this.contextTextarea) return;

        try {
            if (!window.notebook) {
                this.contextTextarea.value = 'Error: Notebook not initialized';
                return;
            }

            const notebook = window.notebook;
            const cells = notebook.cells || [];

            let output = `Notebook Context (${cells.length} cells)\n`;
            output += '='.repeat(60) + '\n\n';

            if (cells.length === 0) {
                output += '(No cells defined)\n';
            } else {
                cells.forEach((cell, index) => {
                    output += `Cell ${index + 1} [${cell.type}]:\n`;
                    output += `  ID: ${cell.id}\n`;
                    output += `  Input: ${cell.input || '(empty)'}\n`;

                    if (cell.output) {
                        output += `  Output: ${cell.output}\n`;
                    }

                    if (cell.error) {
                        output += `  Error: ${cell.error}\n`;
                    }

                    output += '\n';
                });
            }

            // Show CAS engine info
            output += '='.repeat(60) + '\n';
            output += 'CAS Engine:\n';
            if (notebook.casEngine) {
                output += `  Name: ${notebook.casEngine.getName()}\n`;
            } else {
                output += '  (Not available)\n';
            }

            this.contextTextarea.value = output;
        } catch (error) {
            this.contextTextarea.value = `Error refreshing context: ${error.message}`;
            console.error('Error refreshing notebook debug context:', error);
        }
    }
}
