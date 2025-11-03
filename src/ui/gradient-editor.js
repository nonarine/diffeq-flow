/**
 * Simple gradient editor component
 * Creates a UI for editing color gradients with multiple stops
 */

import { rgbToHex, hexToRgb } from '../math/gradients.js';

/**
 * Initialize gradient editor
 * @param {string} containerId - ID of container element
 * @param {Array} initialGradient - Initial gradient stops
 * @param {Function} onChange - Callback when gradient changes
 */
export function initGradientEditor(containerId, initialGradient, onChange) {
    const container = $(`#${containerId}`);
    if (!container.length) {
        console.error(`Gradient editor container #${containerId} not found`);
        return null;
    }

    let gradient = initialGradient.map(stop => ({...stop})); // Deep copy

    function render() {
        // Sort by position for display
        const sorted = [...gradient].sort((a, b) => a.position - b.position);

        let html = '<div class="gradient-stops">';

        sorted.forEach((stop, index) => {
            const actualIndex = gradient.indexOf(stop);
            const hex = rgbToHex(stop.color);

            html += `
                <div class="gradient-stop" data-index="${actualIndex}">
                    <input type="color" class="color-picker" value="${hex}" data-index="${actualIndex}">
                    <input type="number" class="stop-position" min="0" max="1" step="0.01" value="${stop.position.toFixed(2)}" data-index="${actualIndex}">
                    ${gradient.length > 2 ? `<button class="remove-stop" data-index="${actualIndex}">×</button>` : ''}
                </div>
            `;
        });

        html += '</div>';
        html += '<button id="add-stop" class="secondary" style="margin-top: 5px;">Add Color Stop</button>';
        html += '<div class="gradient-preview" id="gradient-preview"></div>';

        container.html(html);

        // Render preview
        renderPreview();

        // Attach event listeners
        attachEventListeners();
    }

    function renderPreview() {
        const preview = $('#gradient-preview');
        if (!preview.length) return;

        // Create CSS gradient
        const sorted = [...gradient].sort((a, b) => a.position - b.position);
        const stops = sorted.map(stop => {
            const hex = rgbToHex(stop.color);
            return `${hex} ${(stop.position * 100).toFixed(1)}%`;
        }).join(', ');

        preview.css('background', `linear-gradient(to right, ${stops})`);
    }

    function attachEventListeners() {
        // Color picker change
        $('.color-picker').off('change').on('change', function() {
            const index = parseInt($(this).data('index'));
            const hex = $(this).val();
            gradient[index].color = hexToRgb(hex);
            renderPreview();
            onChange(gradient);
        });

        // Position change
        $('.stop-position').off('change').on('change', function() {
            const index = parseInt($(this).data('index'));
            let pos = parseFloat($(this).val());
            pos = Math.max(0, Math.min(1, pos)); // Clamp to [0,1]
            gradient[index].position = pos;
            render(); // Re-render to resort
            onChange(gradient);
        });

        // Remove stop
        $('.remove-stop').off('click').on('click', function() {
            const index = parseInt($(this).data('index'));
            if (gradient.length > 2) {
                gradient.splice(index, 1);
                render();
                onChange(gradient);
            }
        });

        // Add stop
        $('#add-stop').off('click').on('click', function() {
            // Find middle position
            const sorted = [...gradient].sort((a, b) => a.position - b.position);
            let newPos = 0.5;

            // Find largest gap
            let maxGap = 0;
            let gapPos = 0.5;
            for (let i = 0; i < sorted.length - 1; i++) {
                const gap = sorted[i + 1].position - sorted[i].position;
                if (gap > maxGap) {
                    maxGap = gap;
                    gapPos = (sorted[i].position + sorted[i + 1].position) / 2;
                }
            }
            newPos = gapPos;

            // Interpolate color at that position
            const newColor = interpolateGradient(gradient, newPos);

            gradient.push({
                position: newPos,
                color: newColor
            });

            render();
            onChange(gradient);
        });
    }

    // Helper to interpolate color at a given position
    function interpolateGradient(stops, t) {
        const sorted = [...stops].sort((a, b) => a.position - b.position);

        // Find surrounding stops
        if (t <= sorted[0].position) return [...sorted[0].color];
        if (t >= sorted[sorted.length - 1].position) return [...sorted[sorted.length - 1].color];

        for (let i = 0; i < sorted.length - 1; i++) {
            if (t >= sorted[i].position && t <= sorted[i + 1].position) {
                const t1 = sorted[i].position;
                const t2 = sorted[i + 1].position;
                const segmentT = (t - t1) / (t2 - t1);

                const c1 = sorted[i].color;
                const c2 = sorted[i + 1].color;

                return [
                    c1[0] + (c2[0] - c1[0]) * segmentT,
                    c1[1] + (c2[1] - c1[1]) * segmentT,
                    c1[2] + (c2[2] - c1[2]) * segmentT
                ];
            }
        }

        return [0.5, 0.5, 0.5]; // Fallback
    }

    // Initial render
    render();

    // Return API
    return {
        getGradient: () => gradient.map(stop => ({...stop})),
        setGradient: (newGradient) => {
            gradient = newGradient.map(stop => ({...stop}));
            render();
        }
    };
}
