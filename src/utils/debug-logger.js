/**
 * Debug logging utility
 */

class DebugLogger {
    constructor() {
        this.enabled = true;
        this.verbosity = 'info'; // info, verbose, warn, error
        this.maxLogs = 100;
        this.logs = [];
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
        this.verbosity = level;
    }

    /**
     * Check if a log level should be displayed
     */
    shouldLog(level) {
        if (!this.enabled) return false;

        const levels = {
            verbose: 0,
            info: 1,
            warn: 2,
            error: 3
        };

        return levels[level] >= levels[this.verbosity];
    }

    /**
     * Log a message
     */
    log(level, message, data = null) {
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

        this.logs.push(logEntry);

        // Keep only last maxLogs entries
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        // Also log to console for debugging
        const consoleMsg = `[${timestamp}] ${message}`;
        if (data) {
            console.log(consoleMsg, data);
        } else {
            console.log(consoleMsg);
        }
        if (stack) {
            console.log('Stack trace:', stack);
        }

        // Trigger UI update
        this.updateUI();
    }

    /**
     * Convenience methods
     */
    verbose(message, data) {
        this.log('verbose', message, data);
    }

    info(message, data) {
        this.log('info', message, data);
    }

    warn(message, data) {
        this.log('warn', message, data);
    }

    error(message, data) {
        this.log('error', message, data);
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
        const output = $('#debug-output');
        if (output.length === 0) return;

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
}

// Create singleton instance
export const logger = new DebugLogger();
