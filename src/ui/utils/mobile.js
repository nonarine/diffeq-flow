/**
 * Mobile Detection Utilities
 *
 * Single source of truth for mobile breakpoint detection.
 * This eliminates 5+ hardcoded breakpoint checks throughout the codebase.
 *
 * @module ui/utils/mobile
 */

/**
 * Mobile breakpoint in pixels
 * Screens <= this width are considered mobile
 */
export const MOBILE_BREAKPOINT = 768;

/**
 * Check if the current viewport is mobile size
 *
 * @returns {boolean} True if viewport width is <= mobile breakpoint
 *
 * @example
 * if (isMobile()) {
 *     // Apply mobile-specific behavior
 * }
 */
export function isMobile() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
}

/**
 * Check if the current viewport is desktop size
 *
 * @returns {boolean} True if viewport width is > mobile breakpoint
 */
export function isDesktop() {
    return window.innerWidth > MOBILE_BREAKPOINT;
}

/**
 * Register a callback for when the viewport crosses the mobile breakpoint
 *
 * @param {Function} callback - Function to call when breakpoint changes
 * @returns {Function} Cleanup function to remove the listener
 *
 * @example
 * const cleanup = onBreakpointChange((isMobile) => {
 *     console.log('Mobile mode:', isMobile);
 * });
 *
 * // Later, to stop listening:
 * cleanup();
 */
export function onBreakpointChange(callback) {
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);

    // Call immediately with current state
    callback(mediaQuery.matches);

    // Listen for changes
    const handler = (e) => callback(e.matches);
    mediaQuery.addEventListener('change', handler);

    // Return cleanup function
    return () => mediaQuery.removeEventListener('change', handler);
}

/**
 * Execute different functions based on mobile/desktop state
 *
 * @param {Object} options
 * @param {Function} options.mobile - Function to execute on mobile
 * @param {Function} options.desktop - Function to execute on desktop
 *
 * @example
 * executeForViewport({
 *     mobile: () => showMobileMenu(),
 *     desktop: () => showDesktopMenu()
 * });
 */
export function executeForViewport({ mobile, desktop }) {
    if (isMobile() && mobile) {
        mobile();
    } else if (isDesktop() && desktop) {
        desktop();
    }
}

/**
 * Get a CSS media query string for the mobile breakpoint
 *
 * @returns {string} Media query string
 *
 * @example
 * const mq = getMobileMediaQuery();
 * // Returns: "(max-width: 768px)"
 */
export function getMobileMediaQuery() {
    return `(max-width: ${MOBILE_BREAKPOINT}px)`;
}

/**
 * Get a CSS media query string for the desktop breakpoint
 *
 * @returns {string} Media query string
 *
 * @example
 * const mq = getDesktopMediaQuery();
 * // Returns: "(min-width: 769px)"
 */
export function getDesktopMediaQuery() {
    return `(min-width: ${MOBILE_BREAKPOINT + 1}px)`;
}
