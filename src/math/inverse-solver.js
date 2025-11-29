/**
 * Symbolic Inverse Transform Solver
 *
 * Attempts to solve for inverse coordinate transforms using symbolic equation solver.
 * Given forward transforms (Cartesian → Native), solves for reverse transforms (Native → Cartesian).
 */

import { logger } from '../utils/debug-logger.js';

/**
 * Notebook instance (injected from main.js)
 * @type {import('./notebook.js').Notebook}
 */
let notebook = null;

/**
 * Set the Notebook to use for inverse solving
 * @param {import('./notebook.js').Notebook} nb
 */
export function setNotebook(nb) {
    notebook = nb;
    logger.info('Inverse Solver: Notebook set (CAS engine:', notebook.casEngine.getName() + ')');
}

/**
 * Attempt to solve for inverse transforms symbolically using CAS engine
 *
 * Strategy:
 * 1. Set up equations: native_i = forwardTransform_i(cartesian vars)
 * 2. Use CAS solve() to isolate each Cartesian variable
 * 3. Simplify results
 *
 * @param {string[]} forwardTransforms - Forward transform expressions (e.g., ['sqrt(x^2+y^2)', 'atan2(y,x)'])
 * @param {number} dimensions - Number of dimensions
 * @param {string[]} cartesianVars - Cartesian variable names (e.g., ['x', 'y', 'z'])
 * @param {string[]} nativeVars - Native variable names (e.g., ['r', 'theta', 'phi'])
 * @returns {string[]|null} - Inverse transform expressions or null if failed
 */
export function solveInverseSymbolically(forwardTransforms, dimensions, cartesianVars, nativeVars) {
    logger.info('=== SYMBOLIC INVERSE SOLVING ===');
    logger.info('Forward transforms:', forwardTransforms);
    logger.info('Cartesian vars:', cartesianVars);
    logger.info('Native vars:', nativeVars);

    if (!notebook) {
        logger.error('Notebook not set - cannot solve inverse symbolically');
        return null;
    }

    if (!notebook.casEngine.isReady()) {
        logger.error('CAS engine not ready - cannot solve inverse symbolically');
        return null;
    }

    try {
        // NOTE: No cache clear needed - Notebook handles context automatically

        const inverseTransforms = [];

        // Strategy: For each Cartesian variable, try to solve from the equations
        // This works well for 2D/3D coordinate systems with simple relationships

        // For 2D Polar (r, θ), we can solve:
        //   From r = sqrt(x^2+y^2) and θ = atan2(y,x)
        //   We can derive x = r*cos(θ), y = r*sin(θ)
        //
        // Approach:
        //   1. Try substitution method for common patterns (polar, spherical)
        //   2. Fall back to Nerdamer's solve() for individual variables

        if (dimensions === 2 && isValidPolarTransform(forwardTransforms)) {
            // Polar 2D: Use known inverse formulas
            logger.info('Detected 2D polar coordinates - using standard inverse');
            return [`${nativeVars[0]}*cos(${nativeVars[1]})`, `${nativeVars[0]}*sin(${nativeVars[1]})`];
        }

        if (dimensions === 3 && isValidCylindricalTransform(forwardTransforms)) {
            // Cylindrical 3D: Use known inverse formulas
            logger.info('Detected 3D cylindrical coordinates - using standard inverse');
            return [
                `${nativeVars[0]}*cos(${nativeVars[1]})`,  // x = ρ*cos(φ)
                `${nativeVars[0]}*sin(${nativeVars[1]})`,  // y = ρ*sin(φ)
                nativeVars[2]                               // z = z
            ];
        }

        if (dimensions === 3 && isValidSphericalTransform(forwardTransforms)) {
            // Spherical 3D: Use known inverse formulas
            logger.info('Detected 3D spherical coordinates - using standard inverse');
            return [
                `${nativeVars[0]}*sin(${nativeVars[1]})*cos(${nativeVars[2]})`,  // x = r*sin(θ)*cos(φ)
                `${nativeVars[0]}*sin(${nativeVars[1]})*sin(${nativeVars[2]})`,  // y = r*sin(θ)*sin(φ)
                `${nativeVars[0]}*cos(${nativeVars[1]})`                          // z = r*cos(θ)
            ];
        }

        // General approach: Try to solve each equation individually
        logger.info('Attempting general symbolic solve...');

        for (let i = 0; i < dimensions; i++) {
            const cartesianVar = cartesianVars[i];

            // Try to isolate cartesian variable from each forward transform
            let solved = null;

            for (let j = 0; j < dimensions; j++) {
                const nativeVar = nativeVars[j];
                const forwardExpr = forwardTransforms[j];

                try {
                    // Set up equation: nativeVar = forwardExpr
                    // Solve for cartesianVar using Notebook (ensures context is applied)
                    const equation = `${nativeVar} - (${forwardExpr})`;
                    const solutions = notebook.solve(equation, cartesianVar);

                    if (solutions) {
                        const solStr = typeof solutions === 'string' ? solutions : solutions.toString();
                        logger.verbose(`Solved ${cartesianVar} from equation ${j}:`, solStr);

                        // Check if solution is valid (doesn't contain other Cartesian variables)
                        const containsOtherVars = cartesianVars.some((v, idx) =>
                            idx !== i && solStr.includes(v)
                        );

                        if (!containsOtherVars) {
                            solved = solStr;
                            break; // Found a valid solution
                        }
                    }
                } catch (e) {
                    logger.verbose(`Failed to solve ${cartesianVar} from equation ${j}:`, e.message);
                }
            }

            if (!solved) {
                logger.warn(`Could not solve for ${cartesianVar} - symbolic solving failed`);
                return null;
            }

            inverseTransforms.push(solved);
        }

        logger.info('Successfully solved inverse transforms:', inverseTransforms);
        return inverseTransforms;

    } catch (error) {
        logger.error('Symbolic inverse solving failed:', error.message);
        return null;
    }
}

/**
 * Check if forward transforms match standard 2D polar pattern
 */
function isValidPolarTransform(transforms) {
    if (transforms.length !== 2) return false;

    const r = transforms[0];
    const theta = transforms[1];

    // Check for sqrt(x^2 + y^2) pattern
    const hasRadialTerm = /sqrt\s*\(\s*x\s*\^?\*?\*?\s*2\s*\+\s*y\s*\^?\*?\*?\s*2/.test(r);

    // Check for atan2(y, x) pattern
    const hasAngleTerm = /atan2\s*\(\s*y\s*,\s*x\s*\)/.test(theta);

    return hasRadialTerm && hasAngleTerm;
}

/**
 * Check if forward transforms match standard 3D cylindrical pattern
 */
function isValidCylindricalTransform(transforms) {
    if (transforms.length !== 3) return false;

    const rho = transforms[0];
    const phi = transforms[1];
    const z = transforms[2];

    // Check for sqrt(x^2 + y^2) pattern
    const hasRadialTerm = /sqrt\s*\(\s*x\s*\^?\*?\*?\s*2\s*\+\s*y\s*\^?\*?\*?\s*2/.test(rho);

    // Check for atan2(y, x) pattern
    const hasAngleTerm = /atan2\s*\(\s*y\s*,\s*x\s*\)/.test(phi);

    // Check for z = z identity
    const hasZTerm = z.trim() === 'z';

    return hasRadialTerm && hasAngleTerm && hasZTerm;
}

/**
 * Check if forward transforms match standard 3D spherical pattern
 */
function isValidSphericalTransform(transforms) {
    if (transforms.length !== 3) return false;

    const r = transforms[0];
    const theta = transforms[1];
    const phi = transforms[2];

    // Check for sqrt(x^2 + y^2 + z^2) pattern
    const hasRadialTerm = /sqrt\s*\(\s*x\s*\^?\*?\*?\s*2\s*\+\s*y\s*\^?\*?\*?\s*2\s*\+\s*z\s*\^?\*?\*?\s*2/.test(r);

    // Check for acos(...) pattern for polar angle
    const hasPolarAngleTerm = /acos/.test(theta);

    // Check for atan2(y, x) pattern for azimuthal angle
    const hasAzimuthalTerm = /atan2\s*\(\s*y\s*,\s*x\s*\)/.test(phi);

    return hasRadialTerm && hasPolarAngleTerm && hasAzimuthalTerm;
}
