/**
 * Centralized Z-Index Management
 *
 * Single source of truth for all z-index values in the application.
 * This eliminates 20+ scattered z-index definitions across multiple files.
 *
 * @module ui/utils/z-index
 */

/**
 * Z-Index hierarchy constants
 * Values are ordered from lowest (background) to highest (foreground)
 */
export const ZIndex = {
    /** Grid canvas overlay (background) */
    GRID: 1,

    /** Info counters (step time, FPS) */
    COUNTERS: 10,

    /** Main controls panel (desktop) */
    CONTROLS_PANEL: 200,

    /** Coordinate editor floating panel */
    COORDINATE_EDITOR: 300,

    /** Gradient editor floating panel */
    GRADIENT_PANEL: 325,

    /** Rendering effects floating panel */
    RENDERING_PANEL: 350,

    /** Mobile view control buttons */
    MOBILE_VIEW_CONTROLS: 9998,

    /** Mobile menu bar (side panel) */
    MOBILE_MENU_BAR: 10000,

    /** Desktop menu bar (top) */
    MENU_BAR: 10001,

    /** Menu bar lowered state (when panels are open on mobile) */
    MENU_BAR_LOWERED: 1,

    /** Mobile panel overlay (full screen) */
    MOBILE_PANEL: 20000,

    /** Close buttons (above everything) */
    CLOSE_BUTTON: 99999
};

/**
 * Lower the menu bar z-index (used when panels are open on mobile)
 * This ensures panels appear above the menu bar
 */
export function lowerMenuBar() {
    $('#menu-bar').css('z-index', ZIndex.MENU_BAR_LOWERED);
}

/**
 * Restore the menu bar to its normal z-index
 * Called when panels are closed on mobile
 */
export function restoreMenuBar() {
    $('#menu-bar').css('z-index', ZIndex.MENU_BAR);
}

/**
 * Get the z-index value for a specific layer
 * Useful for debugging or dynamic z-index management
 *
 * @param {string} layerName - Name of the layer (e.g., 'MENU_BAR')
 * @returns {number|undefined} The z-index value or undefined if not found
 */
export function getZIndex(layerName) {
    return ZIndex[layerName];
}

/**
 * Get all z-index layers sorted by value
 * Useful for debugging the stacking context
 *
 * @returns {Array<{name: string, value: number}>} Sorted array of z-index layers
 */
export function getLayersSorted() {
    return Object.entries(ZIndex)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => a.value - b.value);
}
