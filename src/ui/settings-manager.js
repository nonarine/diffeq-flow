/**
 * Settings Management Module
 *
 * Handles loading, saving, encoding/decoding, and sharing of application settings.
 * Supports:
 * - URL parameter sharing (?s=base64)
 * - localStorage persistence
 * - Coordinate system save/restore
 * - Bbox (pan/zoom state) save/restore
 * - URL clipboard sharing
 */

import { CoordinateSystem, getCartesianSystem } from '../math/coordinate-systems.js';
import { logger } from '../utils/debug-logger.js';

// ========================================
// URL Encoding/Decoding Functions
// ========================================

/**
 * Decode settings from base64 URL string
 * @param {string} base64 - Base64-encoded settings string
 * @returns {Object|null} Decoded settings object or null on error
 */
function decodeSettings(base64) {
    try {
        // Restore standard base64 characters
        let normalized = base64
            .replace(/-/g, '+')
            .replace(/_/g, '/');

        // Restore padding
        while (normalized.length % 4) {
            normalized += '=';
        }

        const json = atob(normalized);
        return JSON.parse(json);
    } catch (e) {
        console.error('Failed to decode settings:', e);
        return null;
    }
}

/**
 * Encode settings to base64 URL string
 * @param {Object} settings - Settings object to encode
 * @returns {string|null} Base64-encoded settings string or null on error
 */
function encodeSettings(settings) {
    try {
        const json = JSON.stringify(settings);
        // Use btoa for base64 encoding, with URL-safe replacements
        const base64 = btoa(json)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, ''); // Remove padding
        return base64;
    } catch (e) {
        console.error('Failed to encode settings:', e);
        return null;
    }
}

// ========================================
// Settings Loading
// ========================================

/**
 * Load settings from URL parameter or localStorage
 * Priority: URL parameter (?s=base64) > localStorage
 * If loaded from URL, saves to localStorage and cleans URL
 *
 * @returns {Object|null} Settings object or null if none found
 */
export function loadSettingsFromURLOrStorage() {
    try {
        // First, check for URL parameter (?s=base64string)
        const urlParams = new URLSearchParams(window.location.search);
        const urlSettings = urlParams.get('s');

        let settings = null;

        if (urlSettings) {
            // Decode from URL parameter
            settings = decodeSettings(urlSettings);
            if (settings) {
                console.log('Loaded settings from URL parameter');
                // Save to localStorage for future visits
                localStorage.setItem('vectorFieldSettings', JSON.stringify(settings));

                // Clean URL by removing the 's' parameter (keep other params like 'storage')
                urlParams.delete('s');
                const newSearch = urlParams.toString();
                const newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '');
                window.history.replaceState({}, '', newUrl);
                console.log('URL cleaned, settings now in localStorage');
            }
        } else {
            // Fall back to localStorage
            const saved = localStorage.getItem('vectorFieldSettings');
            if (saved) {
                settings = JSON.parse(saved);
                console.log('Loaded settings from localStorage');
            }
        }

        return settings;
    } catch (e) {
        console.warn('Failed to load settings:', e);
        return null;
    }
}

// ========================================
// Settings Saving
// ========================================

/**
 * Save settings to localStorage with bbox and coordinate system
 * @param {ControlManager} manager - The control manager instance
 * @param {Renderer} renderer - The renderer instance
 * @returns {Object} The saved settings object
 */
export function saveAllSettings(manager, renderer) {
    const settings = manager.getSettings();

    // Add bbox from renderer
    if (renderer && renderer.bbox) {
        settings.bbox = {
            min: [...renderer.bbox.min],
            max: [...renderer.bbox.max]
        };
    }

    // Add coordinate system from renderer
    if (renderer && renderer.coordinateSystem) {
        settings.coordinateSystem = renderer.coordinateSystem.toJSON();
    }

    // Save to localStorage
    localStorage.setItem('vectorFieldSettings', JSON.stringify(settings));
    return settings;
}

// ========================================
// Settings Sharing (URL Generation)
// ========================================

/**
 * Share settings via URL (copies to clipboard)
 * Generates a shareable URL with settings encoded as base64
 * Preserves the storage parameter if present
 *
 * @param {Object} settings - Settings object to share
 */
export function shareSettings(settings) {
    const encoded = encodeSettings(settings);

    if (!encoded) {
        alert('Failed to encode settings');
        return;
    }

    // Build URL with settings parameter
    const url = new URL(window.location.href);
    // Keep storage parameter if present
    url.search = '';
    const storageParam = new URLSearchParams(window.location.search).get('storage');
    if (storageParam) {
        url.searchParams.set('storage', storageParam);
    }
    url.searchParams.set('s', encoded);

    const shareUrl = url.toString();

    // Copy to clipboard (only available in secure contexts: HTTPS or localhost)
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl).then(() => {
            const button = $('#share-url');
            const originalText = button.text();
            button.text('URL Copied!');
            setTimeout(() => {
                button.text(originalText);
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy URL to clipboard:', err);
            // Fallback: show the URL in an alert
            alert('Share this URL:\n\n' + shareUrl);
        });
    } else {
        // Clipboard API not available (HTTP, not HTTPS)
        // Fallback: select the URL in a temporary input field
        const tempInput = document.createElement('input');
        tempInput.value = shareUrl;
        document.body.appendChild(tempInput);
        tempInput.select();
        tempInput.setSelectionRange(0, 99999); // For mobile

        try {
            // Try old execCommand method
            const success = document.execCommand('copy');
            document.body.removeChild(tempInput);

            if (success) {
                const button = $('#share-url');
                const originalText = button.text();
                button.text('URL Copied!');
                setTimeout(() => {
                    button.text(originalText);
                }, 2000);
            } else {
                throw new Error('execCommand failed');
            }
        } catch (err) {
            document.body.removeChild(tempInput);
            // Final fallback: show the URL
            alert('Copy this URL to share:\n\n' + shareUrl);
        }
    }
}

// ========================================
// Coordinate System Restoration
// ========================================

/**
 * Restore coordinate system from saved settings
 * Validates dimension matching and falls back to Cartesian on error
 *
 * @param {Object} savedSettings - Settings object containing coordinateSystem
 * @param {Renderer} renderer - The renderer instance
 * @param {DimensionInputsControl} expressionsControl - The dimension inputs control
 * @returns {boolean} True if coordinate system was restored successfully
 */
export function restoreCoordinateSystem(savedSettings, renderer, expressionsControl) {
    if (!savedSettings || !savedSettings.coordinateSystem || !savedSettings.dimensions) {
        return false;
    }

    try {
        const coordSystemData = savedSettings.coordinateSystem;

        // Convert Unicode symbols to ASCII in forward transforms
        if (coordSystemData.forwardTransforms && window.UnicodeAutocomplete) {
            coordSystemData.forwardTransforms = coordSystemData.forwardTransforms.map(transform => {
                if (typeof transform === 'string' && window.UnicodeAutocomplete.unicodeToAscii) {
                    return window.UnicodeAutocomplete.unicodeToAscii(transform);
                }
                return transform;
            });
        }

        const coordinateSystem = CoordinateSystem.fromJSON(coordSystemData);

        // Validate that coordinate system dimensions match saved dimensions
        if (coordinateSystem.dimensions === savedSettings.dimensions) {
            renderer.coordinateSystem = coordinateSystem;
            expressionsControl.setCoordinateSystem(coordinateSystem, false);
            console.log('Restored coordinate system:', coordinateSystem.name);
            return true;
        } else {
            // Dimension mismatch - reset to Cartesian for the correct dimensions
            console.warn(`Coordinate system dimension mismatch: system has ${coordinateSystem.dimensions}D but settings use ${savedSettings.dimensions}D. Resetting to Cartesian.`);
            const cartesianSystem = getCartesianSystem(savedSettings.dimensions);
            renderer.coordinateSystem = cartesianSystem;
            expressionsControl.setCoordinateSystem(cartesianSystem, false);
            return false;
        }
    } catch (error) {
        console.warn('Failed to restore coordinate system:', error);
        // Fall back to Cartesian
        if (savedSettings.dimensions) {
            const cartesianSystem = getCartesianSystem(savedSettings.dimensions);
            renderer.coordinateSystem = cartesianSystem;
            expressionsControl.setCoordinateSystem(cartesianSystem, false);
        }
        return false;
    }
}

/**
 * Convert Unicode symbols to ASCII in expressions
 * (θ → theta, φ → phi, etc.)
 *
 * @param {Object} settings - Settings object that may contain expressions
 */
export function convertUnicodeToAscii(settings) {
    // Convert Unicode to ASCII in expressions
    if (settings.expressions && Array.isArray(settings.expressions) && window.UnicodeAutocomplete) {
        settings.expressions = settings.expressions.map(expr => {
            if (typeof expr === 'string' && window.UnicodeAutocomplete.unicodeToAscii) {
                return window.UnicodeAutocomplete.unicodeToAscii(expr);
            }
            return expr;
        });
    }
}

/**
 * Validate and fix mapper params if needed
 * For select mapper, ensures dim2 is different from dim1
 *
 * @param {Object} settings - Settings object that may contain mapperParams
 */
export function fixMapperParams(settings) {
    if (settings.mapperParams) {
        const params = settings.mapperParams;
        // For select mapper, ensure dim2 is different from dim1 and defaults to 1
        if (params.dim1 !== undefined && params.dim2 !== undefined) {
            if (params.dim1 === params.dim2) {
                console.warn('Invalid mapper params: dim1 and dim2 are the same, fixing to default');
                settings.mapperParams = { dim1: 0, dim2: 1 };
            }
        }
    }
}

// ========================================
// Aspect Ratio Utilities
// ========================================

/**
 * Expand bbox to fit canvas aspect ratio (ensure WHOLE bbox is visible)
 * @param {Object} bbox - Original bbox with min/max arrays
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @returns {Object} Expanded bbox that fits aspect ratio
 */
export function expandBBoxForAspectRatio(bbox, canvas) {
    if (!canvas) return bbox;

    const canvasAspect = canvas.width / canvas.height;
    const bboxWidth = bbox.max[0] - bbox.min[0];
    const bboxHeight = bbox.max[1] - bbox.min[1];
    const bboxAspect = bboxWidth / bboxHeight;

    const centerX = (bbox.min[0] + bbox.max[0]) / 2;
    const centerY = (bbox.min[1] + bbox.max[1]) / 2;

    let newWidth = bboxWidth;
    let newHeight = bboxHeight;

    if (canvasAspect > bboxAspect) {
        // Canvas is wider than bbox - expand width to match aspect ratio
        newWidth = bboxHeight * canvasAspect;
    } else {
        // Canvas is taller than bbox - expand height to match aspect ratio
        newHeight = bboxWidth / canvasAspect;
    }

    return {
        min: [centerX - newWidth / 2, centerY - newHeight / 2],
        max: [centerX + newWidth / 2, centerY + newHeight / 2]
    };
}

// ========================================
// Settings Application (Initialization)
// ========================================

/**
 * Apply initial settings after all web components are ready
 * Handles coordinate system restoration, Unicode conversion, and validation
 *
 * @param {Object} savedSettings - Settings loaded from URL or localStorage
 * @param {ControlManager} manager - The control manager instance
 * @param {Renderer} renderer - The renderer instance
 * @param {Function} callback - Called when settings have been applied
 */
export function applyInitialSettings(savedSettings, manager, renderer, callback) {
    if (!savedSettings) {
        if (callback) callback();
        return;
    }

    // Restore coordinate system if present and dimensions match
    const expressionsControl = manager.get('dimension-inputs');
    if (expressionsControl) {
        restoreCoordinateSystem(savedSettings, renderer, expressionsControl);
    }

    // Convert Unicode to ASCII in expressions (θ → theta, φ → phi, etc.)
    convertUnicodeToAscii(savedSettings);

    // Validate and fix mapper params if needed
    fixMapperParams(savedSettings);

    // Apply settings after all Web Components are ready
    if (manager.webComponentRegistry) {
        manager.webComponentRegistry.applyWhenReady(savedSettings).then(() => {
            if (callback) callback();
        });
    } else {
        // Fallback if registry not available (shouldn't happen)
        manager.applySettings(savedSettings);
        manager.apply();
        if (callback) callback();
    }
}

/**
 * Restore bbox (pan/zoom state) from saved settings
 * Expands bbox to fit current canvas aspect ratio
 *
 * @param {Object} savedSettings - Settings object containing bbox
 * @param {Renderer} renderer - The renderer instance
 */
export function restoreBBox(savedSettings, renderer) {
    if (savedSettings && savedSettings.bbox && renderer) {
        const canvas = renderer.gl?.canvas;
        const expandedBBox = expandBBoxForAspectRatio(savedSettings.bbox, canvas);
        renderer.updateConfig({
            bbox: expandedBBox,
            reinitializeParticles: false
        });
        logger.verbose('Restored bbox expanded for aspect ratio');
    }
}
