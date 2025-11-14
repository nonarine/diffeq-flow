/**
 * Main entry point for N-dimensional vector field renderer
 */

import { Renderer } from './webgl/renderer.js';
import { initControls, loadPreset } from './ui/controls-v2.js';
import { logger } from './utils/debug-logger.js';
import { Animator } from './animation/animator.js';
import { setCustomFunctions, getCustomFunctions } from './math/parser.js';

// Expose MathParser API to window for use in UI controls
window.MathParser = {
    setCustomFunctions,
    getCustomFunctions
};

// Initialize when DOM is ready
$(document).ready(function() {
    // Step 1: Initialize debug console
    function initDebugConsole(callback) {
        let isDebugExpanded = false;

        $('#debug-header').on('click', function(e) {
            if (e.target.id !== 'debug-toggle') {
                isDebugExpanded = !isDebugExpanded;
                $('#debug-console').toggleClass('collapsed', !isDebugExpanded);
                $('#debug-expand').text(isDebugExpanded ? '▼' : '▶');
            }
        });

        $('#debug-toggle').on('change', function() {
            logger.setEnabled($(this).is(':checked'));
            logger.info('Debug logging ' + ($(this).is(':checked') ? 'enabled' : 'disabled'));
        });

        $('#debug-verbosity').on('change', function() {
            const verbosity = $(this).val();
            logger.setVerbosity(verbosity);
            logger.info('Verbosity set to: ' + verbosity);

            // Show/hide buffer status indicator
            if (verbosity === 'silent') {
                $('#debug-buffer-status').show();
                updateBufferStatus();
            } else {
                $('#debug-buffer-status').hide();
            }
        });

        $('#debug-copy').on('click', function() {
            const logs = logger.getLogs();
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
                logger.info('Log copied to clipboard (' + logs.length + ' entries)');
            }).catch(err => {
                logger.error('Failed to copy log to clipboard', err);
            });
        });

        $('#debug-clear').on('click', function() {
            logger.clear();
        });

        $('#debug-flush-buffer').on('click', function() {
            logger.flush();
            updateBufferStatus();
        });

        $('#debug-clear-buffer').on('click', function() {
            logger.clearSilencedBuffer();
            updateBufferStatus();
        });

        // Update buffer status display
        function updateBufferStatus() {
            const stats = logger.getBufferStats();
            $('#buffer-size').text(stats.bufferSize);
            $('#buffer-percent').text(stats.bufferUsagePercent);

            // Update color based on buffer usage
            if (stats.bufferUsagePercent > 80) {
                $('#buffer-size').css('color', '#EF5350'); // Red when near full
            } else if (stats.bufferUsagePercent > 50) {
                $('#buffer-size').css('color', '#FFA726'); // Orange when half full
            } else {
                $('#buffer-size').css('color', '#4CAF50'); // Green when plenty of space
            }
        }

        // Update buffer status periodically when in silent mode
        setInterval(function() {
            if (logger.isSilenced()) {
                updateBufferStatus();
            }
        }, 1000);

        $('#debug-log-update-shader').on('click', function() {
            if (window.renderer && typeof window.renderer.logUpdateShader === 'function') {
                window.renderer.logUpdateShader();
            } else {
                console.warn('Renderer not available yet');
                logger.warn('Renderer not initialized - cannot log update shader');
            }
        });

        $('#debug-log-draw-shader').on('click', function() {
            if (window.renderer && typeof window.renderer.logDrawShader === 'function') {
                window.renderer.logDrawShader();
            } else {
                console.warn('Renderer not available yet');
                logger.warn('Renderer not initialized - cannot log draw shader');
            }
        });

        $('#debug-log-screen-shader').on('click', function() {
            if (window.renderer && typeof window.renderer.logScreenShader === 'function') {
                window.renderer.logScreenShader();
            } else {
                console.warn('Renderer not available yet');
                logger.warn('Renderer not initialized - cannot log screen shader');
            }
        });

        $('#debug-log-stats-shaders').on('click', function() {
            if (window.renderer && typeof window.renderer.logStatsShaders === 'function') {
                window.renderer.logStatsShaders();
            } else {
                console.warn('Renderer not available yet');
                logger.warn('Renderer not initialized - cannot log stats shaders');
            }
        });

        $('#debug-buffer-stats').on('click', function() {
            if (window.renderer && typeof window.renderer.logBufferStats === 'function') {
                window.renderer.logBufferStats();
            } else {
                console.warn('Renderer not available yet');
                logger.warn('Renderer not initialized - cannot log buffer stats');
            }
        });

        $('#debug-enable-stats').on('change', function() {
            if (window.renderer) {
                const enabled = $(this).is(':checked');
                window.renderer.enableDebugStats = enabled;
                logger.info(`GPU debug stats ${enabled ? 'ENABLED' : 'DISABLED'}`);
            }
        });

        // Initialize logger with current DOM values (browser may have cached them)
        logger.setEnabled($('#debug-toggle').is(':checked'));
        const initialVerbosity = $('#debug-verbosity').val();
        logger.setVerbosity(initialVerbosity);

        // Show buffer status if starting in silent mode
        if (initialVerbosity === 'silent') {
            $('#debug-buffer-status').show();
            updateBufferStatus();
        }

        logger.info('Debug console initialized');

        // Make logger globally available
        window.logger = logger;

        // Hook console methods to echo to debug console
        logger.hookConsole();

        callback();
    }

    // Step 2: Initialize renderer and canvas
    function initRenderer(callback) {
        const canvas = document.getElementById('canvas');
        let renderer = null;

        // Set canvas size and maintain square aspect ratio for coordinate space
        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            if (renderer) {
                renderer.resize(canvas.width, canvas.height);

                // Adjust bbox to maintain square coordinate grid
                const aspectRatio = canvas.width / canvas.height;
                const bbox = renderer.bbox;
                const centerX = (bbox.min[0] + bbox.max[0]) / 2;
                const centerY = (bbox.min[1] + bbox.max[1]) / 2;
                const currentHeight = bbox.max[1] - bbox.min[1];

                // Set width based on aspect ratio to maintain square grid
                const newWidth = currentHeight * aspectRatio;

                bbox.min[0] = centerX - newWidth / 2;
                bbox.max[0] = centerX + newWidth / 2;

                renderer.updateConfig({ bbox: bbox });
            }
        }

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Create renderer with storage strategy from controls
        try {
            // Get storage strategy from URL or default to Float (best precision)
            const urlParams = new URLSearchParams(window.location.search);
            const storageStrategy = urlParams.get('storage') || 'float';

            renderer = new Renderer(canvas, { storageStrategy });
            callback(renderer, canvas);
        } catch (error) {
            logger.error('Failed to initialize renderer', error);
            alert('Failed to initialize WebGL renderer: ' + (error.message || error));
        }
    }

    // Step 3: Initialize UI and start rendering
    function initUI(renderer, canvas) {
        // Initialize UI controls
        const manager = initControls(renderer, function(controlsData) {
            const { manager, state, saveSettings } = controlsData;

            // Get initial settings and apply to renderer
            // ControlManager settings keys match renderer config keys exactly,
            // so we can pass the settings object directly (no manual mapping!)
            const settings = manager.getSettings();
            renderer.updateConfig(settings);

            // Controls are ready, start rendering
            renderer.start();

            // Setup animation panel
            setupAnimationPanel(renderer, manager);

            // Make utilities globally available for debugging
            window.renderer = renderer;
            window.loadPreset = loadPreset;
            window.logger = logger;
            window.saveSettings = saveSettings; // Make saveSettings available globally
            window.manager = manager; // Make manager available for debugging

            logger.info('N-Dimensional Vector Field Renderer initialized!');
            logger.info('Available presets: ' + Object.keys(window.presets).join(', '));
            logger.info('Try: loadPreset("3d_lorenz")');
        });
    }

    // Step 4: Setup pan/zoom (after renderer is created)
    function setupPanZoom(renderer, canvas) {
        // Pan and zoom handling
        let isDragging = false;
        let lastX = 0;
        let lastY = 0;

        // Debounced save for pan/zoom (saves 500ms after last interaction)
        let saveTimeout = null;
        function debouncedSave() {
            if (saveTimeout) {
                clearTimeout(saveTimeout);
            }
            saveTimeout = setTimeout(() => {
                if (window.saveSettings) {
                    window.saveSettings();
                }
            }, 500);
        }

        canvas.addEventListener('mousedown', (e) => {
            if (e.target === canvas) {
                isDragging = true;
                lastX = e.clientX;
                lastY = e.clientY;
            }
        });

        canvas.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const dx = e.clientX - lastX;
                const dy = e.clientY - lastY;

                const bbox = renderer.bbox;
                const width = bbox.max[0] - bbox.min[0];
                const height = bbox.max[1] - bbox.min[1];

                const scale = width / canvas.width;

                bbox.min[0] -= dx * scale;
                bbox.max[0] -= dx * scale;
                bbox.min[1] += dy * scale;
                bbox.max[1] += dy * scale;

                renderer.updateConfig({ bbox: bbox });

                lastX = e.clientX;
                lastY = e.clientY;
            }
        });

        canvas.addEventListener('mouseup', () => {
            isDragging = false;
            debouncedSave(); // Save after panning ends
        });

        canvas.addEventListener('mouseleave', () => {
            isDragging = false;
            if (!isDragging) {
                debouncedSave(); // Save if we were panning
            }
        });

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();

            const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;

            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const bbox = renderer.bbox;
            const width = bbox.max[0] - bbox.min[0];
            const height = bbox.max[1] - bbox.min[1];

            // Zoom towards mouse position
            const centerX = bbox.min[0] + width * (mouseX / canvas.width);
            const centerY = bbox.max[1] - height * (mouseY / canvas.height);

            const newHeight = height * zoomFactor;
            const aspectRatio = canvas.width / canvas.height;
            const newWidth = newHeight * aspectRatio;

            const ratioX = (centerX - bbox.min[0]) / width;
            const ratioY = (bbox.max[1] - centerY) / height;

            bbox.min[0] = centerX - newWidth * ratioX;
            bbox.max[0] = centerX + newWidth * (1 - ratioX);
            bbox.min[1] = centerY - newHeight * (1 - ratioY);
            bbox.max[1] = centerY + newHeight * ratioY;

            renderer.updateConfig({ bbox: bbox });
            debouncedSave(); // Save after zoom
        });

        // Touch support for mobile
        let lastTouchDistance = 0;

        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                isDragging = true;
                lastX = e.touches[0].clientX;
                lastY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                isDragging = false;
                const dx = e.touches[1].clientX - e.touches[0].clientX;
                const dy = e.touches[1].clientY - e.touches[0].clientY;
                lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
            }
            e.preventDefault();
        });

        canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1 && isDragging) {
                const dx = e.touches[0].clientX - lastX;
                const dy = e.touches[0].clientY - lastY;

                const bbox = renderer.bbox;
                const width = bbox.max[0] - bbox.min[0];
                const height = bbox.max[1] - bbox.min[1];

                const scale = width / canvas.width;

                bbox.min[0] -= dx * scale;
                bbox.max[0] -= dx * scale;
                bbox.min[1] += dy * scale;
                bbox.max[1] += dy * scale;

                renderer.updateConfig({ bbox: bbox });

                lastX = e.touches[0].clientX;
                lastY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                const dx = e.touches[1].clientX - e.touches[0].clientX;
                const dy = e.touches[1].clientY - e.touches[0].clientY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (lastTouchDistance > 0) {
                    const zoomFactor = lastTouchDistance / distance;

                    const bbox = renderer.bbox;
                    const height = bbox.max[1] - bbox.min[1];

                    const centerX = (bbox.min[0] + bbox.max[0]) / 2;
                    const centerY = (bbox.min[1] + bbox.max[1]) / 2;

                    const newHeight = height * zoomFactor;
                    const aspectRatio = canvas.width / canvas.height;
                    const newWidth = newHeight * aspectRatio;

                    bbox.min[0] = centerX - newWidth / 2;
                    bbox.max[0] = centerX + newWidth / 2;
                    bbox.min[1] = centerY - newHeight / 2;
                    bbox.max[1] = centerY + newHeight / 2;

                    renderer.updateConfig({ bbox: bbox });
                }

                lastTouchDistance = distance;
            }
            e.preventDefault();
        });

        canvas.addEventListener('touchend', () => {
            isDragging = false;
            lastTouchDistance = 0;
            debouncedSave(); // Save after touch interaction ends
        });

        // ========================================
        // Zoom/Pan Button Controls
        // ========================================

        // Helper function to zoom towards center
        function zoomToCenter(zoomFactor) {
            const bbox = renderer.bbox;
            const width = bbox.max[0] - bbox.min[0];
            const height = bbox.max[1] - bbox.min[1];

            const centerX = (bbox.min[0] + bbox.max[0]) / 2;
            const centerY = (bbox.min[1] + bbox.max[1]) / 2;

            const newHeight = height * zoomFactor;
            const aspectRatio = canvas.width / canvas.height;
            const newWidth = newHeight * aspectRatio;

            bbox.min[0] = centerX - newWidth / 2;
            bbox.max[0] = centerX + newWidth / 2;
            bbox.min[1] = centerY - newHeight / 2;
            bbox.max[1] = centerY + newHeight / 2;

            renderer.updateConfig({ bbox: bbox });
            debouncedSave();
        }

        // Helper function to pan
        function panView(dx, dy) {
            const bbox = renderer.bbox;
            const width = bbox.max[0] - bbox.min[0];
            const height = bbox.max[1] - bbox.min[1];

            // Pan by 10% of the current view
            const panX = width * dx * 0.1;
            const panY = height * dy * 0.1;

            bbox.min[0] += panX;
            bbox.max[0] += panX;
            bbox.min[1] += panY;
            bbox.max[1] += panY;

            renderer.updateConfig({ bbox: bbox });
            debouncedSave();
        }

        // Zoom buttons
        $('#zoom-in').on('click', () => zoomToCenter(0.9)); // Zoom in (0.9 = 10% closer)
        $('#zoom-out').on('click', () => zoomToCenter(1.11)); // Zoom out (1.11 = 11% farther)

        // Pan buttons
        $('#pan-up').on('click', () => panView(0, 1));
        $('#pan-down').on('click', () => panView(0, -1));
        $('#pan-left').on('click', () => panView(-1, 0));
        $('#pan-right').on('click', () => panView(1, 0));

        // Diagonal pan buttons
        $('#pan-up-left').on('click', () => panView(-1, 1));
        $('#pan-up-right').on('click', () => panView(1, 1));
        $('#pan-down-left').on('click', () => panView(-1, -1));
        $('#pan-down-right').on('click', () => panView(1, -1));

        // Center View at Origin button - centers view at (0,0) while keeping current zoom
        $('#pan-reset').on('click', function() {
            const currentBBox = renderer.bbox;
            const currentWidth = currentBBox.max[0] - currentBBox.min[0];
            const currentHeight = currentBBox.max[1] - currentBBox.min[1];

            renderer.updateConfig({
                bbox: {
                    min: [-currentWidth / 2, -currentHeight / 2],
                    max: [currentWidth / 2, currentHeight / 2]
                },
                reinitializeParticles: false
            });
            debouncedSave();
        });
    }

    // Step 5: Setup grid and cursor display
    function setupGridAndCursor(renderer, canvas) {
        const gridCanvas = document.getElementById('grid-canvas');
        const gridCtx = gridCanvas.getContext('2d');
        const cursorDiv = $('#cursor-position');

        let showGrid = $('#show-grid').is(':checked');
        let cursorX = 0;
        let cursorY = 0;

        // Resize grid canvas to match main canvas
        function resizeGridCanvas() {
            gridCanvas.width = canvas.width;
            gridCanvas.height = canvas.height;
            drawGrid();
        }

        // Convert screen coordinates to world coordinates
        function screenToWorld(screenX, screenY) {
            const bbox = renderer.bbox;
            const width = bbox.max[0] - bbox.min[0];
            const height = bbox.max[1] - bbox.min[1];

            const worldX = bbox.min[0] + (screenX / canvas.width) * width;
            const worldY = bbox.max[1] - (screenY / canvas.height) * height;

            return { x: worldX, y: worldY };
        }

        // Convert world coordinates to screen coordinates
        function worldToScreen(worldX, worldY) {
            const bbox = renderer.bbox;
            const width = bbox.max[0] - bbox.min[0];
            const height = bbox.max[1] - bbox.min[1];

            const screenX = ((worldX - bbox.min[0]) / width) * canvas.width;
            const screenY = ((bbox.max[1] - worldY) / height) * canvas.height;

            return { x: screenX, y: screenY };
        }

        // Calculate appropriate grid spacing
        function getGridSpacing() {
            const bbox = renderer.bbox;
            const width = bbox.max[0] - bbox.min[0];

            // Target ~10 grid lines across the view
            const targetLines = 10;
            const rawSpacing = width / targetLines;

            // Round to nice numbers (1, 2, 5, 10, 20, 50, etc.)
            const magnitude = Math.pow(10, Math.floor(Math.log10(rawSpacing)));
            const normalized = rawSpacing / magnitude;

            let spacing;
            if (normalized < 1.5) spacing = 1 * magnitude;
            else if (normalized < 3.5) spacing = 2 * magnitude;
            else if (normalized < 7.5) spacing = 5 * magnitude;
            else spacing = 10 * magnitude;

            return spacing;
        }

        // Draw coordinate grid
        function drawGrid() {
            if (!showGrid) {
                gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
                return;
            }

            gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);

            const bbox = renderer.bbox;
            const spacing = getGridSpacing();

            // Draw vertical grid lines
            const startX = Math.floor(bbox.min[0] / spacing) * spacing;
            const endX = Math.ceil(bbox.max[0] / spacing) * spacing;

            gridCtx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            gridCtx.lineWidth = 1;
            gridCtx.font = '10px Courier New';
            gridCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';

            for (let x = startX; x <= endX; x += spacing) {
                const screen = worldToScreen(x, 0);

                // Draw line
                gridCtx.beginPath();
                gridCtx.moveTo(screen.x, 0);
                gridCtx.lineTo(screen.x, gridCanvas.height);
                gridCtx.stroke();

                // Draw label
                if (Math.abs(x) < 0.0001) continue; // Skip zero
                const label = x.toFixed(Math.max(0, -Math.floor(Math.log10(spacing))));
                gridCtx.fillText(label, screen.x + 3, gridCanvas.height - 5);
            }

            // Draw horizontal grid lines
            const startY = Math.floor(bbox.min[1] / spacing) * spacing;
            const endY = Math.ceil(bbox.max[1] / spacing) * spacing;

            for (let y = startY; y <= endY; y += spacing) {
                const screen = worldToScreen(0, y);

                // Draw line
                gridCtx.beginPath();
                gridCtx.moveTo(0, screen.y);
                gridCtx.lineTo(gridCanvas.width, screen.y);
                gridCtx.stroke();

                // Draw label
                if (Math.abs(y) < 0.0001) continue; // Skip zero
                const label = y.toFixed(Math.max(0, -Math.floor(Math.log10(spacing))));
                gridCtx.fillText(label, 5, screen.y - 3);
            }

            // Draw axes (thicker)
            const origin = worldToScreen(0, 0);

            gridCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            gridCtx.lineWidth = 2;

            // X-axis
            if (origin.y >= 0 && origin.y <= gridCanvas.height) {
                gridCtx.beginPath();
                gridCtx.moveTo(0, origin.y);
                gridCtx.lineTo(gridCanvas.width, origin.y);
                gridCtx.stroke();
                gridCtx.fillText('0', origin.x + 3, origin.y - 3);
            }

            // Y-axis
            if (origin.x >= 0 && origin.x <= gridCanvas.width) {
                gridCtx.beginPath();
                gridCtx.moveTo(origin.x, 0);
                gridCtx.lineTo(origin.x, gridCanvas.height);
                gridCtx.stroke();
            }
        }

        // Update cursor position display
        function updateCursorDisplay() {
            const world = screenToWorld(cursorX, cursorY);
            cursorDiv.text(`x: ${world.x.toFixed(3)}, y: ${world.y.toFixed(3)}`);
        }

        // Track mouse position
        canvas.addEventListener('mousemove', (e) => {
            cursorX = e.clientX;
            cursorY = e.clientY;
            updateCursorDisplay();
        });

        // Toggle grid
        $('#show-grid').on('change', function() {
            showGrid = $(this).is(':checked');
            drawGrid();
        });

        // Redraw grid when window resizes
        window.addEventListener('resize', resizeGridCanvas);

        // Redraw grid periodically to catch bbox changes
        setInterval(drawGrid, 100);

        // Update FPS counter
        const fpsDisplay = document.querySelector('#fps-counter .fps-display');
        function formatFrameCount(count) {
            if (count >= 1000) {
                const k = count / 1000;
                // Show one decimal place for values like 1.5k, but not for 1k, 2k, etc.
                if (k % 1 === 0) {
                    return `${Math.floor(k)}k`;
                } else {
                    return `${k.toFixed(1)}k`;
                }
            }
            return count.toString();
        }
        function updateFPS() {
            if (renderer && renderer.fps !== undefined) {
                const framesText = renderer.totalFrames !== undefined
                    ? ` | ${formatFrameCount(renderer.totalFrames)} frames`
                    : '';
                fpsDisplay.textContent = `FPS: ${renderer.fps}${framesText}`;
            }
        }
        setInterval(updateFPS, 500); // Update every 500ms

        // Histogram panel
        const histogramPanel = $('#histogram-panel');
        const histogramCanvas = document.getElementById('histogram-canvas');
        const histogramCtx = histogramCanvas.getContext('2d');

        // Make histogram panel collapsible
        $('#histogram-header').on('click', function() {
            histogramPanel.toggleClass('collapsed');
            $('#histogram-expand').text(histogramPanel.hasClass('collapsed') ? '▶' : '▼');
        });

        // Draw histogram
        function drawHistogram() {
            if (!renderer) return;

            const stats = renderer.getBufferStats();
            if (!stats || !stats.histogram || stats.histogram.length === 0) return;

            const canvas = histogramCanvas;
            const ctx = histogramCtx;
            const dpr = window.devicePixelRatio || 1;

            // Set canvas resolution
            canvas.width = canvas.clientWidth * dpr;
            canvas.height = canvas.clientHeight * dpr;
            ctx.scale(dpr, dpr);

            const width = canvas.clientWidth;
            const height = canvas.clientHeight;

            // Clear
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(0, 0, width, height);

            // Find max count for scaling
            const maxCount = Math.max(...stats.histogram);
            if (maxCount === 0) return;

            // Draw bars
            const barWidth = width / stats.histogram.length;
            ctx.fillStyle = '#4CAF50';

            stats.histogram.forEach((count, i) => {
                const barHeight = (count / maxCount) * (height - 4);
                const x = i * barWidth;
                const y = height - barHeight;
                ctx.fillRect(x, y, barWidth - 1, barHeight);
            });

            // Update info
            $('#hist-avg').text(stats.avgBrightness.toFixed(1));
            $('#hist-max').text(stats.maxBrightness.toFixed(0));

            // Check if velocity is available
            if (stats.maxVelocity !== undefined && stats.maxVelocity !== null) {
                $('#hist-vel').text(stats.maxVelocity.toFixed(2));
            } else {
                $('#hist-vel').text('--');
            }
        }

        setInterval(drawHistogram, 1000); // Update every second

        resizeGridCanvas();
        updateCursorDisplay();
    }

    // Step 6: Setup keyboard shortcuts
    function setupKeyboardShortcuts(renderer) {
        document.addEventListener('keydown', (e) => {
            // Clear screen: Press 'C' key (with no modifiers to avoid conflicts)
            if (e.key === 'c' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
                // Don't trigger if user is typing in an input field
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                    return;
                }

                e.preventDefault();
                renderer.clearScreen();
                logger.info('Screen cleared via keyboard shortcut (C)');
            }
        });
    }

    // Step 7: Setup animation panel
    function setupAnimationPanel(renderer, manager) {
        let animator = null;

        // Open/close panel
        $('#open-animation-panel').on('click', function() {
            $('#animation-panel').toggle();
        });

        // Load animation script
        $('#animation-script-input').on('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(event) {
                try {
                    const scriptData = JSON.parse(event.target.result);

                    // Create animator
                    animator = new Animator(renderer, manager);
                    const script = animator.loadScript(scriptData);

                    // Update UI with script info
                    $('#anim-name').text(script.name);

                    // Timeline-based animation (new format)
                    const duration = script.timeline[script.timeline.length - 1].time;
                    const totalFrames = Math.ceil(duration * script.fps);

                    $('#anim-param').text(`${script.timeline.length} keyframes`);
                    $('#anim-range').text(`0s → ${duration}s`);
                    $('#anim-frames').text(totalFrames);
                    $('#anim-fps').text(script.fps);
                    $('#anim-duration').text(`${duration.toFixed(1)}s`);

                    // Show info and enable run button
                    $('#animation-info').show();
                    $('#animation-run-btn').prop('disabled', false);
                    $('#animation-download-btn').prop('disabled', true);

                    logger.info(`Animation script loaded: ${script.name}`);
                } catch (error) {
                    alert('Failed to load animation script: ' + error.message);
                    logger.error('Animation script load failed', error);
                }
            };
            reader.readAsText(file);
        });

        // Run animation
        $('#animation-run-btn').on('click', async function() {
            if (!animator) return;

            try {
                // Disable controls
                $('#animation-run-btn').prop('disabled', true);
                $('#animation-pause-btn').prop('disabled', false);
                $('#animation-stop-btn').prop('disabled', false);
                $('#animation-script-input').prop('disabled', true);

                // Show progress
                $('#animation-progress').show();

                // Run with progress callback
                await animator.run((frameNum, totalFrames, time) => {
                    const percent = (frameNum / totalFrames) * 100;
                    $('#progress-bar').css('width', percent + '%');
                    $('#progress-text').text(`Frame ${frameNum} / ${totalFrames}`);
                    $('#progress-param').text(`Time: ${time.toFixed(2)}s`);
                });

                // Animation complete
                logger.info('Animation complete!');
                alert('Animation complete! ' + animator.frames.length + ' frames captured.');

                // Enable download button
                $('#animation-download-btn').prop('disabled', false);

            } catch (error) {
                logger.error('Animation failed', error);
                alert('Animation failed: ' + error.message);
            } finally {
                // Re-enable controls
                $('#animation-run-btn').prop('disabled', false);
                $('#animation-pause-btn').prop('disabled', true);
                $('#animation-stop-btn').prop('disabled', true);
                $('#animation-script-input').prop('disabled', false);
            }
        });

        // Pause animation
        $('#animation-pause-btn').on('click', function() {
            if (!animator) return;

            if (animator.isPaused) {
                animator.resume();
                $(this).text('⏸ Pause');
                logger.info('Animation resumed');
            } else {
                animator.pause();
                $(this).text('▶ Resume');
                logger.info('Animation paused');
            }
        });

        // Stop animation
        $('#animation-stop-btn').on('click', function() {
            if (!animator) return;

            animator.stop();
            logger.info('Animation stopped');

            // Reset UI
            $('#animation-run-btn').prop('disabled', false);
            $('#animation-pause-btn').prop('disabled', true);
            $('#animation-stop-btn').prop('disabled', true);
            $('#animation-script-input').prop('disabled', false);
        });

        // Download frames
        $('#animation-download-btn').on('click', async function() {
            if (!animator || animator.frames.length === 0) return;

            try {
                $(this).prop('disabled', true);
                $(this).text('💾 Downloading...');

                await animator.downloadFrames();

                $(this).text('✓ Downloaded');
                setTimeout(() => {
                    $(this).text('💾 Download Frames (ZIP)');
                    $(this).prop('disabled', false);
                }, 2000);

            } catch (error) {
                logger.error('Download failed', error);
                alert('Download failed: ' + error.message);
                $(this).text('💾 Download Frames (ZIP)');
                $(this).prop('disabled', false);
            }
        });

        logger.info('Animation panel initialized');
    }

    // Step 8: Initialize accordion for controls sections
    function initAccordion() {
        const ACCORDION_STATE_KEY = 'accordionState';

        // Load saved accordion state from localStorage
        let savedState = {};
        try {
            const saved = localStorage.getItem(ACCORDION_STATE_KEY);
            if (saved) {
                savedState = JSON.parse(saved);
            }
        } catch (e) {
            console.warn('Failed to load accordion state', e);
        }

        // Get all h2 headers in the controls panel
        $('#controls h2').each(function(index) {
            const $header = $(this);
            const $section = $header.next('.accordion-section');

            if ($section.length === 0) return; // Skip if no accordion section follows

            // Use the header text as a unique identifier
            const sectionId = $header.text().trim();

            // Determine initial state (default to expanded for first section, collapsed for others)
            const isCollapsed = savedState.hasOwnProperty(sectionId)
                ? savedState[sectionId]
                : (index > 0); // First section open, rest collapsed

            // Set initial state
            if (isCollapsed) {
                $header.addClass('collapsed');
                $section.addClass('collapsed');
            } else {
                // Set max-height for smooth transition
                $section.css('max-height', $section[0].scrollHeight + 'px');
            }

            // Add click handler
            $header.on('click', function() {
                const $h2 = $(this);
                const $content = $h2.next('.accordion-section');
                const isCurrentlyCollapsed = $h2.hasClass('collapsed');

                if (isCurrentlyCollapsed) {
                    // Expand
                    $h2.removeClass('collapsed');
                    $content.css('max-height', $content[0].scrollHeight + 'px');
                    $content.removeClass('collapsed');
                } else {
                    // Collapse
                    $content.css('max-height', $content[0].scrollHeight + 'px');
                    // Force reflow
                    $content[0].offsetHeight;
                    $content.css('max-height', '0');
                    $h2.addClass('collapsed');
                    $content.addClass('collapsed');
                }

                // Save state to localStorage
                savedState[sectionId] = !isCurrentlyCollapsed;
                try {
                    localStorage.setItem(ACCORDION_STATE_KEY, JSON.stringify(savedState));
                } catch (e) {
                    console.warn('Failed to save accordion state', e);
                }
            });

            // Update max-height when window resizes or content changes
            const updateMaxHeight = () => {
                if (!$section.hasClass('collapsed')) {
                    $section.css('max-height', $section[0].scrollHeight + 'px');
                }
            };

            // Create a ResizeObserver to watch for content changes
            if (typeof ResizeObserver !== 'undefined') {
                const observer = new ResizeObserver(updateMaxHeight);
                observer.observe($section[0]);
            }
        });

        logger.info('Accordion initialized with ' + $('#controls h2').length + ' sections');
    }

    // Run initialization sequence in order
    initDebugConsole(function() {
        initAccordion(); // Initialize accordion early (doesn't depend on renderer)
        initRenderer(function(renderer, canvas) {
            setupPanZoom(renderer, canvas);
            setupGridAndCursor(renderer, canvas);
            setupKeyboardShortcuts(renderer);
            initUI(renderer, canvas);
        });
    });
});
