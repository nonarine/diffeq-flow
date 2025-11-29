/**
 * CAS Engine Factory
 *
 * Creates and initializes CAS engines based on configuration.
 * Supports multiple engines (Nerdamer, Maxima, etc.)
 */

import { NerdamerEngine } from './nerdamer-engine.js';
import { logger } from '../../utils/debug-logger.js';

/**
 * Available CAS engine types
 */
export const CASEngineType = {
    NERDAMER: 'nerdamer',
    MAXIMA: 'maxima' // Will be implemented in Phase 10-11
};

/**
 * Create and initialize a CAS engine
 *
 * @param {string} type - Engine type (from CASEngineType)
 * @returns {Promise<CASEngine>} - Initialized CAS engine
 * @throws {Error} - If engine type is unknown or initialization fails
 */
export async function createCASEngine(type = CASEngineType.NERDAMER) {
    logger.info(`Creating CAS engine: ${type}`);

    let engine;

    switch (type) {
        case CASEngineType.NERDAMER:
            engine = new NerdamerEngine();
            break;

        case CASEngineType.MAXIMA:
            throw new Error('Maxima engine not yet implemented (Phase 10-11)');
            // Future: engine = new MaximaEngine();
            // break;

        default:
            throw new Error(`Unknown CAS engine type: ${type}`);
    }

    // Initialize the engine
    try {
        await engine.initialize();
        logger.info(`CAS engine ${type} initialized successfully`);
        return engine;
    } catch (error) {
        logger.error(`Failed to initialize CAS engine ${type}:`, error.message);
        throw error;
    }
}

/**
 * Get the currently selected CAS engine type from settings
 *
 * @returns {string} - Engine type from CASEngineType
 */
export function getSelectedEngineType() {
    // Check localStorage for saved preference
    const stored = localStorage.getItem('casEngine');
    if (stored && Object.values(CASEngineType).includes(stored)) {
        return stored;
    }

    // Default to Nerdamer
    return CASEngineType.NERDAMER;
}

/**
 * Save CAS engine type preference to localStorage
 *
 * @param {string} type - Engine type from CASEngineType
 */
export function saveEngineTypePreference(type) {
    if (!Object.values(CASEngineType).includes(type)) {
        throw new Error(`Invalid CAS engine type: ${type}`);
    }

    localStorage.setItem('casEngine', type);
    logger.info(`Saved CAS engine preference: ${type}`);
}
