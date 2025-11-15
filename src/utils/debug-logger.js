/**
 * Debug logging utility
 */

class DebugLogger {
    constructor() {
        this.enabled = true;
        this.verbosity = 'info'; // verbose, debug, info, warn, error
        this.maxLogs = 100; // Display buffer size
        this.logs = [];
        this.consoleHooked = false;
        this.originalConsole = {};
        this.outputElement = null; // Can be set to a specific element, defaults to $('#debug-output')

        // Silent mode buffering
        this.silenced = false;
        this.silencedBuffer = [];
        this.maxSilencedLogs = 5000; // Buffer more logs during silent mode
    }

    /**
     * Set the output element for log display
     */
    setOutputElement(element) {
        this.outputElement = element;
    }

    /**
     * Set whether logging is enabled
     */
    setEnabled(enabled) {
        this.enabled = enabled;
    }

    /**
     * Set verbosity level
     */
    setVerbosity(level) {
        const wasSilent = this.verbosity === 'silent';
        this.verbosity = level;
        const isSilent = level === 'silent';

        // If transitioning from silent to non-silent, flush buffer
        if (wasSilent && !isSilent) {
            this.unsilence();
        } else if (!wasSilent && isSilent) {
            this.silence();
        }
    }

    /**
     * Enter silent mode (buffer logs instead of displaying)
     */
    silence() {
        if (this.silenced) return;
        this.silenced = true;
        this.info('Entering silent mode - logs will be buffered', null, false); // Not silenceable
    }

    /**
     * Exit silent mode and flush buffered logs
     */
    unsilence() {
        if (!this.silenced) return;
        const bufferSize = this.silencedBuffer.length;
        this.silenced = false;
        this.flush();
        this.info(`Exited silent mode - flushed ${bufferSize} buffered logs`, null, false); // Not silenceable
    }

    /**
     * Flush silenced buffer to main logs and UI
     */
    flush() {
        if (this.silencedBuffer.length === 0) return;

        const bufferSize = this.silencedBuffer.length;
        this.info(`Flushing ${bufferSize} silenced logs...`, null, false); // Not silenceable

        // Output all buffered logs to console
        const consoleMethod = this.consoleHooked ? this.originalConsole.log : console.log;
        for (const logEntry of this.silencedBuffer) {
            const consoleMsg = `[${logEntry.timestamp}] ${logEntry.message}`;
            if (logEntry.data) {
                consoleMethod(consoleMsg, logEntry.data);
            } else {
                consoleMethod(consoleMsg);
            }
            if (logEntry.stack) {
                consoleMethod('Stack trace:', logEntry.stack);
            }
        }

        // Add ALL buffered logs to main logs
        this.logs.push(...this.silencedBuffer);

        // Then truncate to keep only the last maxLogs entries
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }

        // Clear buffer
        this.silencedBuffer = [];

        // Update UI with all logs
        this.updateUI();
    }

    /**
     * Clear silenced buffer without flushing
     */
    clearSilencedBuffer() {
        const count = this.silencedBuffer.length;
        this.silencedBuffer = [];
        this.info(`Cleared ${count} buffered logs`, null, false); // Not silenceable
    }

    /**
     * Check if a log level should be displayed
     * Note: In silent mode, logs still pass this check but are buffered instead of displayed
     */
    shouldLog(level) {
        if (!this.enabled) return false;

        const levels = {
            verbose: 0,
            debug: 1,
            info: 2,
            warn: 3,
            error: 4,
            silent: 0  // Silent mode - accept all logs but buffer them
        };

        return levels[level] >= levels[this.verbosity];
    }

    /**
     * Log a message
     * @param {string} level - Log level (verbose, debug, info, warn, error)
     * @param {string} message - Log message
     * @param {*} data - Optional data to log
     * @param {boolean} silenceable - If true, log can be silenced (buffered); if false, always outputs immediately
     */
    log(level, message, data = null, silenceable = true) {
        if (!this.shouldLog(level)) return;

        const timestamp = new Date().toLocaleTimeString();

        // Extract stack trace for errors
        let stack = null;
        if (data instanceof Error) {
            stack = data.stack;
            data = {
                message: data.message,
                name: data.name,
                stack: data.stack
            };
        }

        const logEntry = {
            timestamp,
            level,
            message,
            data,
            stack
        };

        // If in silent mode and this log is silenceable, buffer it instead of displaying
        if (this.silenced && silenceable) {
            this.silencedBuffer.push(logEntry);

            // Keep only last maxSilencedLogs entries in buffer
            if (this.silencedBuffer.length > this.maxSilencedLogs) {
                this.silencedBuffer.shift();
            }

            // Don't output to console or UI
            return;
        }

        // Normal logging (not silenced or not silenceable)
        this.logs.push(logEntry);

        // Keep only last maxLogs entries
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        // Also log to console for debugging (use original console to avoid infinite loop)
        const consoleMethod = this.consoleHooked ? this.originalConsole.log : console.log;
        const consoleMsg = `[${timestamp}] ${message}`;
        if (data) {
            consoleMethod(consoleMsg, data);
        } else {
            consoleMethod(consoleMsg);
        }
        if (stack) {
            consoleMethod('Stack trace:', stack);
        }

        // Trigger UI update
        this.updateUI();
    }

    /**
     * Convenience methods
     * @param {string} message - Log message
     * @param {*} data - Optional data to log
     * @param {boolean} silenceable - If true (default), log can be buffered in silent mode
     */
    verbose(message, data = null, silenceable = true) {
        this.log('verbose', message, data, silenceable);
    }

    debug(message, data = null, silenceable = true) {
        this.log('debug', message, data, silenceable);
    }

    info(message, data = null, silenceable = true) {
        this.log('info', message, data, silenceable);
    }

    warn(message, data = null, silenceable = true) {
        this.log('warn', message, data, silenceable);
    }

    error(message, data = null, silenceable = true) {
        this.log('error', message, data, silenceable);
    }

    /**
     * Clear all logs
     */
    clear() {
        this.logs = [];
        this.updateUI();
    }

    /**
     * Update the UI with current logs
     */
    updateUI() {
        // Use configured output element or fallback to default selector
        const output = this.outputElement ? $(this.outputElement) : $('#debug-output');
        if (!output || output.length === 0) return;

        output.empty();

        for (const log of this.logs) {
            const logDiv = $('<div class="debug-log"></div>')
                .addClass(log.level);

            const timestamp = $('<span class="debug-timestamp"></span>')
                .text(log.timestamp);

            const message = $('<span></span>').text(log.message);

            logDiv.append(timestamp).append(message);

            if (log.data) {
                const dataStr = typeof log.data === 'object' ?
                    JSON.stringify(log.data, null, 2) :
                    String(log.data);
                const dataSpan = $('<span></span>')
                    .text(' | ' + dataStr)
                    .css('color', '#888');
                logDiv.append(dataSpan);
            }

            // Show stack trace for errors (collapsed by default)
            if (log.stack) {
                const stackBtn = $('<span></span>')
                    .text(' [stack]')
                    .css({
                        'color': '#ff6b6b',
                        'cursor': 'pointer',
                        'text-decoration': 'underline'
                    });

                const stackDiv = $('<pre></pre>')
                    .text(log.stack)
                    .css({
                        'display': 'none',
                        'color': '#ff6b6b',
                        'font-size': '9px',
                        'margin': '4px 0 0 20px',
                        'padding': '4px',
                        'background': '#2a0000',
                        'border-left': '2px solid #ff6b6b',
                        'overflow-x': 'auto'
                    });

                stackBtn.on('click', function() {
                    stackDiv.toggle();
                });

                logDiv.append(stackBtn);
                logDiv.append(stackDiv);
            }

            output.append(logDiv);
        }

        // Auto-scroll to bottom
        output.scrollTop(output[0].scrollHeight);
    }

    /**
     * Get all logs
     */
    getLogs() {
        return this.logs;
    }

    /**
     * Get silenced buffer
     */
    getSilencedBuffer() {
        return this.silencedBuffer;
    }

    /**
     * Get silenced state
     */
    isSilenced() {
        return this.silenced;
    }

    /**
     * Get buffer stats
     */
    getBufferStats() {
        return {
            silenced: this.silenced,
            bufferSize: this.silencedBuffer.length,
            maxBufferSize: this.maxSilencedLogs,
            bufferUsagePercent: Math.round((this.silencedBuffer.length / this.maxSilencedLogs) * 100)
        };
    }

    /**
     * Hook browser console methods to echo to debug console
     */
    hookConsole() {
        if (this.consoleHooked) {
            this.warn('Console already hooked');
            return;
        }

        // Store original console methods
        this.originalConsole = {
            log: console.log,
            info: console.info,
            warn: console.warn,
            error: console.error
        };

        const self = this;

        // Override console.log
        console.log = function(...args) {
            self.originalConsole.log.apply(console, args);
            const message = args.map(arg =>
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ');
            self.debug('[console.log] ' + message);
        };

        // Override console.info
        console.info = function(...args) {
            self.originalConsole.info.apply(console, args);
            const message = args.map(arg =>
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ');
            self.debug('[console.info] ' + message);
        };

        // Override console.warn
        console.warn = function(...args) {
            self.originalConsole.warn.apply(console, args);
            const message = args.map(arg =>
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ');
            self.warn('[console] ' + message);
        };

        // Override console.error
        console.error = function(...args) {
            self.originalConsole.error.apply(console, args);
            const message = args.map(arg =>
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ');
            self.error('[console] ' + message);
        };

        this.consoleHooked = true;
        this.info('Console hooked - browser console calls will echo to debug console');
    }

    /**
     * Unhook browser console methods (restore original behavior)
     */
    unhookConsole() {
        if (!this.consoleHooked) {
            this.warn('Console not hooked');
            return;
        }

        console.log = this.originalConsole.log;
        console.info = this.originalConsole.info;
        console.warn = this.originalConsole.warn;
        console.error = this.originalConsole.error;

        this.consoleHooked = false;
        this.info('Console unhooked - restored original behavior');
    }
}

// Create singleton instance
export const logger = new DebugLogger();
