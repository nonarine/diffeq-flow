/**
 * Debug Console tab for the modal window
 *
 * Provides debug logging, shader inspection, and performance monitoring.
 */

import { Tab } from './tab-base.js';

export class DebugTab extends Tab {
    constructor(logger) {
        super('debug', 'Debug Console');
        this.logger = logger;

        // UI elements (created in render())
        this.debugToggle = null;
        this.debugVerbosity = null;
        this.debugOutput = null;
        this.bufferSizeSpan = null;
        this.bufferPercentSpan = null;
        this.bufferStatusDiv = null;
    }

    /**
     * Render the tab content
     */
    render(container) {
        const content = document.createElement('div');
        content.id = 'debug-tab-content';
        content.className = 'modal-tab-content';
        content.style.display = 'none';

        content.innerHTML = `
            <div style="display: flex; align-items: center; margin-bottom: 16px;">
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" id="debug-toggle" checked style="margin-right: 8px;">
                    <span style="font-weight: bold;">Enable Debug Logging</span>
                </label>
            </div>

            <div id="debug-controls" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px;">
                <select id="debug-verbosity" style="flex: 0 0 auto;">
                    <option value="info">Info</option>
                    <option value="debug">Debug</option>
                    <option value="verbose">Verbose</option>
                    <option value="warn">Warnings Only</option>
                    <option value="error">Errors Only</option>
                    <option value="silent">Silent (Buffer)</option>
                </select>
                <button id="debug-log-update-shader" class="secondary" style="padding: 4px 8px;" title="Particle integration shader (updates positions each frame)">Update Shader</button>
                <button id="debug-log-draw-shader" class="secondary" style="padding: 4px 8px;" title="Particle rendering shaders (vertex + fragment for color/display)">Draw Shaders</button>
                <button id="debug-log-screen-shader" class="secondary" style="padding: 4px 8px;" title="Screen fade shader (trail decay)">Fade Shader</button>
                <button id="debug-log-stats-shaders" class="secondary" style="padding: 4px 8px;" title="Velocity statistics shader (max velocity tracking)">Velocity Stats</button>
                <button id="debug-buffer-stats" class="secondary" style="padding: 4px 8px;">Buffer Stats</button>
                <button id="debug-copy" class="secondary" style="padding: 4px 8px;">Copy Log</button>
                <button id="debug-clear" class="secondary" style="padding: 4px 8px;">Clear</button>
            </div>

            <div id="debug-buffer-status" style="display: none; padding: 8px; background: #2a2a2a; border-radius: 4px; margin-bottom: 12px; font-size: 11px; color: #888;">
                <span style="color: #FFA726; font-weight: bold;">SILENT MODE:</span>
                Buffering <span id="buffer-size" style="color: #4CAF50;">0</span> logs
                (<span id="buffer-percent">0</span>% of max)
                <button id="debug-flush-buffer" class="secondary" style="padding: 2px 6px; margin-left: 8px; font-size: 10px;">Flush Buffer</button>
                <button id="debug-clear-buffer" class="secondary" style="padding: 2px 6px; margin-left: 4px; font-size: 10px;">Clear Buffer</button>
            </div>

            <div style="padding: 8px; margin-bottom: 12px; background: #1f1f1f; border-radius: 4px;">
                <label style="display: flex; align-items: center; cursor: pointer; font-size: 11px;" title="Enable particle sampling and detailed logging (expensive GPU readback). Buffer stats for tone mapping are always enabled but optimized.">
                    <input type="checkbox" id="debug-enable-stats" style="margin-right: 6px;">
                    <span>Enable Particle Sampling (expensive GPU readback)</span>
                </label>
            </div>

            <div id="debug-output" style="background: #0a0a0a; border: 1px solid #333; border-radius: 4px; padding: 12px; height: calc(100vh - 450px); overflow-y: auto; font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.4;"></div>
        `;

        container.appendChild(content);

        // Get references to UI elements
        this.debugToggle = content.querySelector('#debug-toggle');
        this.debugVerbosity = content.querySelector('#debug-verbosity');
        this.debugOutput = content.querySelector('#debug-output');
        this.bufferSizeSpan = content.querySelector('#buffer-size');
        this.bufferPercentSpan = content.querySelector('#buffer-percent');
        this.bufferStatusDiv = content.querySelector('#debug-buffer-status');

        // Setup event listeners
        this._setupEventListeners(content);

        // Initialize logger with current DOM values
        this.logger.setEnabled(this.debugToggle.checked);
        const initialVerbosity = this.debugVerbosity.value;
        this.logger.setVerbosity(initialVerbosity);

        // Show buffer status if starting in silent mode
        if (initialVerbosity === 'silent') {
            this.bufferStatusDiv.style.display = 'block';
            this._updateBufferStatus();
        }

        // Make logger output to this debug output div
        this.logger.setOutputElement(this.debugOutput);

        return content;
    }

    /**
     * Setup event listeners for debug controls
     * @private
     */
    _setupEventListeners(content) {
        // Toggle debug logging
        this.debugToggle.addEventListener('change', () => {
            this.logger.setEnabled(this.debugToggle.checked);
            this.logger.info('Debug logging ' + (this.debugToggle.checked ? 'enabled' : 'disabled'));
        });

        // Change verbosity
        this.debugVerbosity.addEventListener('change', () => {
            const verbosity = this.debugVerbosity.value;
            this.logger.setVerbosity(verbosity);
            this.logger.info('Verbosity set to: ' + verbosity);

            // Show/hide buffer status indicator
            if (verbosity === 'silent') {
                this.bufferStatusDiv.style.display = 'block';
                this._updateBufferStatus();
            } else {
                this.bufferStatusDiv.style.display = 'none';
            }
        });

        // Copy log to clipboard
        content.querySelector('#debug-copy').addEventListener('click', () => {
            const logs = this.logger.getLogs();
            let logText = 'N-Dimensional Vector Field Renderer - Debug Log\n';
            logText += '='.repeat(60) + '\n\n';

            for (const log of logs) {
                logText += `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`;
                if (log.data) {
                    const dataStr = typeof log.data === 'object' ?
                        JSON.stringify(log.data) :
                        String(log.data);
                    logText += ` | Data: ${dataStr}`;
                }
                if (log.stack) {
                    logText += `\nStack Trace:\n${log.stack}`;
                }
                logText += '\n';
            }

            // Copy to clipboard
            navigator.clipboard.writeText(logText).then(() => {
                this.logger.info('Log copied to clipboard (' + logs.length + ' entries)');
            }).catch(err => {
                this.logger.error('Failed to copy log to clipboard', err);
            });
        });

        // Clear log
        content.querySelector('#debug-clear').addEventListener('click', () => {
            this.logger.clear();
        });

        // Flush buffer
        content.querySelector('#debug-flush-buffer').addEventListener('click', () => {
            this.logger.flush();
            this._updateBufferStatus();
        });

        // Clear buffer
        content.querySelector('#debug-clear-buffer').addEventListener('click', () => {
            this.logger.clearSilencedBuffer();
            this._updateBufferStatus();
        });

        // Shader logging buttons
        content.querySelector('#debug-log-update-shader').addEventListener('click', () => {
            if (window.renderer && typeof window.renderer.logUpdateShader === 'function') {
                window.renderer.logUpdateShader();
            } else {
                this.logger.warn('Renderer not initialized - cannot log update shader');
            }
        });

        content.querySelector('#debug-log-draw-shader').addEventListener('click', () => {
            if (window.renderer && typeof window.renderer.logDrawShader === 'function') {
                window.renderer.logDrawShader();
            } else {
                this.logger.warn('Renderer not initialized - cannot log draw shader');
            }
        });

        content.querySelector('#debug-log-screen-shader').addEventListener('click', () => {
            if (window.renderer && typeof window.renderer.logScreenShader === 'function') {
                window.renderer.logScreenShader();
            } else {
                this.logger.warn('Renderer not initialized - cannot log screen shader');
            }
        });

        content.querySelector('#debug-log-stats-shaders').addEventListener('click', () => {
            if (window.renderer && typeof window.renderer.logStatsShaders === 'function') {
                window.renderer.logStatsShaders();
            } else {
                this.logger.warn('Renderer not initialized - cannot log stats shaders');
            }
        });

        content.querySelector('#debug-buffer-stats').addEventListener('click', () => {
            if (window.renderer && typeof window.renderer.logBufferStats === 'function') {
                window.renderer.logBufferStats();
            } else {
                this.logger.warn('Renderer not initialized - cannot log buffer stats');
            }
        });

        // Enable/disable stats
        content.querySelector('#debug-enable-stats').addEventListener('change', (e) => {
            if (window.renderer) {
                const enabled = e.target.checked;
                window.renderer.enableDebugStats = enabled;
                this.logger.info(`GPU debug stats ${enabled ? 'ENABLED' : 'DISABLED'}`);
            }
        });
    }

    /**
     * Update buffer status display
     * @private
     */
    _updateBufferStatus() {
        const stats = this.logger.getBufferStats();
        this.bufferSizeSpan.textContent = stats.bufferSize;
        this.bufferPercentSpan.textContent = stats.bufferUsagePercent;

        // Update color based on buffer usage
        if (stats.bufferUsagePercent > 80) {
            this.bufferSizeSpan.style.color = '#EF5350'; // Red when near full
        } else if (stats.bufferUsagePercent > 50) {
            this.bufferSizeSpan.style.color = '#FFA726'; // Orange when half full
        } else {
            this.bufferSizeSpan.style.color = '#4CAF50'; // Green when plenty of space
        }
    }

    /**
     * Called when tab becomes active
     */
    onActivate() {
        // Start periodic buffer status updates if in silent mode
        if (!this._bufferUpdateInterval) {
            this._bufferUpdateInterval = setInterval(() => {
                if (this.logger.isSilenced() && this._isActive) {
                    this._updateBufferStatus();
                }
            }, 1000);
        }
    }

    /**
     * Called when tab becomes inactive
     */
    onDeactivate() {
        // Stop buffer status updates
        if (this._bufferUpdateInterval) {
            clearInterval(this._bufferUpdateInterval);
            this._bufferUpdateInterval = null;
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (this._bufferUpdateInterval) {
            clearInterval(this._bufferUpdateInterval);
            this._bufferUpdateInterval = null;
        }
        super.destroy();
    }
}
