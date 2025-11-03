/**
 * Main entry point for N-dimensional vector field renderer
 */

import { Renderer } from './webgl/renderer.js';
import { initControls, loadPreset } from './ui/controls-v2.js';
import { logger } from './utils/debug-logger.js';

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
            logger.setVerbosity($(this).val());
            logger.info('Verbosity set to: ' + $(this).val());
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

        $('#debug-log-shaders').on('click', function() {
            if (window.renderer && typeof window.renderer.logShaders === 'function') {
                window.renderer.logShaders();
            } else {
                console.warn('Renderer not available yet');
                logger.warn('Renderer not initialized - cannot log shaders');
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

        // Initialize logger with current DOM values (browser may have cached them)
        logger.setEnabled($('#debug-toggle').is(':checked'));
        logger.setVerbosity($('#debug-verbosity').val());

        logger.info('Debug console initialized');

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
            // Get storage strategy from URL or default to Float (RGBA is broken)
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

        resizeGridCanvas();
        updateCursorDisplay();
    }

    // Run initialization sequence in order
    initDebugConsole(function() {
        initRenderer(function(renderer, canvas) {
            setupPanZoom(renderer, canvas);
            setupGridAndCursor(renderer, canvas);
            initUI(renderer, canvas);
        });
    });
});
