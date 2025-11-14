/**
 * Coordinate System Editor
 *
 * Provides a UI for configuring alternate coordinate systems (polar, spherical, etc.)
 * Users can select presets or define custom coordinate transformations.
 */

import { CoordinateSystem, PRESET_COORDINATE_SYSTEMS, getPresetsForDimension, getCartesianSystem } from '../math/coordinate-systems.js';

/**
 * Initialize coordinate editor panel
 * @param {string} containerId - ID of container element
 * @param {number} dimensions - Current number of dimensions
 * @param {Object} initialSystem - Initial coordinate system
 * @param {Function} onChange - Callback when coordinate system changes (system) => {}
 */
export function initCoordinateEditor(containerId, dimensions, initialSystem, onChange) {
    const container = $(`#${containerId}`);
    if (!container.length) {
        console.error(`Coordinate editor container #${containerId} not found`);
        return null;
    }

    let currentSystem = initialSystem || getCartesianSystem(dimensions);
    let currentDimensions = dimensions;

    const editor = {
        render,
        update,
        getCurrentSystem: () => currentSystem,
        setDimensions
    };

    function render() {
        const presets = getPresetsForDimension(currentDimensions);

        let html = '<div class="coordinate-editor-content">';

        // Preset dropdown
        html += '<div class="control-group">';
        html += '<label for="coord-preset">Preset</label>';
        html += '<select id="coord-preset">';

        // Find current preset key (if any)
        let currentPresetKey = 'custom';
        for (const [key, system] of Object.entries(PRESET_COORDINATE_SYSTEMS)) {
            if (system.name === currentSystem.name &&
                system.dimensions === currentSystem.dimensions) {
                currentPresetKey = key;
                break;
            }
        }

        html += '<option value="custom">Custom</option>';
        presets.forEach(({ key, system }) => {
            const selected = key === currentPresetKey ? 'selected' : '';
            html += `<option value="${key}" ${selected}>${system.name}</option>`;
        });
        html += '</select>';
        html += '</div>';

        // Variable definitions
        html += '<div class="coordinate-variables">';
        html += '<div style="font-weight: bold;">Coordinate Variables:</div>';

        for (let i = 0; i < currentDimensions; i++) {
            const variable = currentSystem.variables[i] || { label: 'x', displayLabel: 'x' };
            const transform = currentSystem.forwardTransforms[i] || 'x';
            const cartesianVar = ['x', 'y', 'z', 'w', 'u', 'v'][i];

            html += '<div class="coord-var-row">';
            html += `<input type="text" class="coord-var-label" data-index="${i}" value="${variable.displayLabel}" placeholder="${cartesianVar}" title="Variable label (can use Greek letters like θ)">`;
            html += '<span>=</span>';
            html += `<input type="text" class="coord-var-transform coord-math-input" data-index="${i}" value="${transform}" placeholder="${cartesianVar}" title="Transformation expression in Cartesian coordinates">`;
            html += '</div>';
        }

        html += '</div>';

        // Info text
        html += '<div class="info-text">';
        html += 'Define each coordinate in terms of Cartesian variables (x, y, z, w, ...). ';
        html += 'Type "theta", "phi", etc. to insert Greek letters.';
        html += '</div>';

        // Action buttons
        html += '<div class="coordinate-editor-buttons">';
        html += '<button id="coord-apply" class="primary">Apply</button>';
        html += '<button id="coord-cancel" class="secondary">Cancel</button>';
        html += '</div>';

        html += '</div>';

        container.html(html);

        // Attach event listeners
        attachEventListeners();

        // Attach unicode autocomplete to math inputs
        if (window.unicodeAutocomplete) {
            $('.coord-math-input').each(function() {
                window.unicodeAutocomplete.attach(this);
            });
            $('.coord-var-label').each(function() {
                window.unicodeAutocomplete.attach(this);
            });
        }
    }

    function attachEventListeners() {
        // Preset selection
        $('#coord-preset').off('change').on('change', function() {
            const presetKey = $(this).val();

            if (presetKey === 'custom') {
                // Keep current custom system
                return;
            }

            const preset = PRESET_COORDINATE_SYSTEMS[presetKey];
            if (preset) {
                currentSystem = preset;
                render();
            }
        });

        // Variable label change
        $('.coord-var-label').off('input').on('input', function() {
            const index = parseInt($(this).data('index'));
            const label = $(this).val().trim();

            // Update current system (make it custom)
            if (!currentSystem.variables[index]) {
                currentSystem.variables[index] = { label: '', displayLabel: '' };
            }
            currentSystem.variables[index].displayLabel = label;
            currentSystem.variables[index].label = label;

            // Mark as custom
            $('#coord-preset').val('custom');
        });

        // Transform expression change
        $('.coord-var-transform').off('input').on('input', function() {
            const index = parseInt($(this).data('index'));
            const transform = $(this).val().trim();

            // Update current system (make it custom)
            if (!currentSystem.forwardTransforms[index]) {
                currentSystem.forwardTransforms[index] = transform;
            } else {
                currentSystem.forwardTransforms[index] = transform;
            }

            // Mark as custom
            $('#coord-preset').val('custom');
        });

        // Apply button
        $('#coord-apply').off('click').on('click', function() {
            const button = $(this);

            // Disable button and show feedback
            button.prop('disabled', true);
            const originalText = button.text();
            button.text('Applying...');

            try {
                // Validate system
                const isValid = validateSystem();

                if (isValid) {
                    // Convert Unicode symbols to ASCII in transform expressions before applying
                    const transformsWithAscii = currentSystem.forwardTransforms.map(transform => {
                        // Convert θ → theta, φ → phi, etc.
                        if (window.UnicodeAutocomplete && window.UnicodeAutocomplete.unicodeToAscii) {
                            return window.UnicodeAutocomplete.unicodeToAscii(transform);
                        }
                        return transform;
                    });

                    // Create a proper CoordinateSystem instance (not a plain object!)
                    // This preserves methods like getVariableNames(), toJSON(), etc.
                    const systemToApply = new CoordinateSystem(
                        currentSystem.name,
                        currentSystem.dimensions,
                        currentSystem.variables,
                        transformsWithAscii
                    );

                    // Brief delay for visual feedback
                    setTimeout(() => {
                        try {
                            onChange(systemToApply);
                        } catch (error) {
                            console.error('Error applying coordinate system:', error);
                            alert('Error applying coordinate system: ' + error.message);
                        } finally {
                            button.prop('disabled', false);
                            button.text(originalText);
                        }
                    }, 100);
                } else {
                    alert('Invalid coordinate system. Please check your expressions.');
                    button.prop('disabled', false);
                    button.text(originalText);
                }
            } catch (error) {
                console.error('Error in apply handler:', error);
                alert('Error: ' + error.message);
                button.prop('disabled', false);
                button.text(originalText);
            }
        });

        // Cancel button
        $('#coord-cancel').off('click').on('click', function() {
            // Close panel (handled by caller)
            onChange(null); // null means cancelled
        });
    }

    function validateSystem() {
        // Check that all variables have labels
        for (let i = 0; i < currentDimensions; i++) {
            if (!currentSystem.variables[i] || !currentSystem.variables[i].label) {
                return false;
            }
            if (!currentSystem.forwardTransforms[i] || currentSystem.forwardTransforms[i].trim() === '') {
                return false;
            }
        }
        return true;
    }

    function update(newSystem) {
        currentSystem = newSystem;
        render();
    }

    function setDimensions(newDimensions) {
        if (newDimensions !== currentDimensions) {
            currentDimensions = newDimensions;
            // Reset to Cartesian for new dimensions
            currentSystem = getCartesianSystem(newDimensions);
            render();
        }
    }

    // Initial render
    render();

    return editor;
}

/**
 * Show coordinate editor in a floating panel
 * @param {number} dimensions - Current number of dimensions
 * @param {Object} initialSystem - Initial coordinate system
 * @param {Function} onApply - Callback when system is applied
 */
export function showCoordinateEditor(dimensions, initialSystem, onApply) {
    // Create floating panel if it doesn't exist
    let panel = $('#coordinate-editor-panel');
    if (!panel.length) {
        $('body').append(`
            <div id="coordinate-editor-panel" class="floating-panel" style="display: none;">
                <div class="panel-header">
                    <h3>Coordinate System</h3>
                    <button class="panel-close">&times;</button>
                </div>
                <div id="coordinate-editor-container" class="panel-content">
                </div>
            </div>
        `);
        panel = $('#coordinate-editor-panel');
    }

    // Show panel
    panel.show();

    // Initialize editor
    const editor = initCoordinateEditor(
        'coordinate-editor-container',
        dimensions,
        initialSystem,
        (system) => {
            if (system === null) {
                // Cancelled
                panel.hide();
            } else {
                // Applied
                onApply(system);
                panel.hide();
            }
        }
    );

    // Close button
    $('.panel-close', panel).off('click').on('click', function() {
        panel.hide();
    });

    // Drag functionality (same as gradient editor)
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    $('.panel-header', panel).off('mousedown').on('mousedown', function(e) {
        isDragging = true;
        dragOffsetX = e.clientX - panel.offset().left;
        dragOffsetY = e.clientY - panel.offset().top;
        $(document).on('mousemove.panelDrag', function(e) {
            if (isDragging) {
                panel.css({
                    left: e.clientX - dragOffsetX,
                    top: e.clientY - dragOffsetY
                });
            }
        });
    });

    $(document).on('mouseup.panelDrag', function() {
        isDragging = false;
        $(document).off('mousemove.panelDrag');
    });

    return editor;
}
