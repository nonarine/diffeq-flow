/**
 * Numerical integration methods for updating particle positions
 * Each integrator generates GLSL code for computing position updates
 */

/**
 * Euler integrator (1st order)
 * Simple forward step: x(t+h) = x(t) + h*f(x)
 */
export function eulerIntegrator(dimensions) {
    return {
        name: 'Euler',
        code: `
// Euler integration
vec${dimensions} integrate(vec${dimensions} pos, float h) {
    vec${dimensions} velocity = get_velocity(pos);
    return pos + h * velocity;
}
`
    };
}

/**
 * Runge-Kutta 2 (Midpoint method)
 * 2nd order accurate
 */
export function rk2Integrator(dimensions) {
    return {
        name: 'RK2 (Midpoint)',
        code: `
// Runge-Kutta 2 (Midpoint) integration
vec${dimensions} integrate(vec${dimensions} pos, float h) {
    vec${dimensions} k1 = get_velocity(pos);
    vec${dimensions} k2 = get_velocity(pos + h * 0.5 * k1);
    return pos + h * k2;
}
`
    };
}

/**
 * Runge-Kutta 4
 * 4th order accurate, good balance of accuracy and performance
 */
export function rk4Integrator(dimensions) {
    return {
        name: 'RK4',
        code: `
// Runge-Kutta 4 integration
vec${dimensions} integrate(vec${dimensions} pos, float h) {
    vec${dimensions} k1 = get_velocity(pos);
    vec${dimensions} k2 = get_velocity(pos + h * 0.5 * k1);
    vec${dimensions} k3 = get_velocity(pos + h * 0.5 * k2);
    vec${dimensions} k4 = get_velocity(pos + h * k3);

    return pos + h * (k1 / 6.0 + k2 / 3.0 + k3 / 3.0 + k4 / 6.0);
}
`
    };
}

/**
 * Implicit Euler (Backward Euler)
 * Solves: x(t+h) = x(t) + h*f(x(t+h)) using fixed-point iteration
 * More stable than explicit Euler, especially for stiff systems
 */
export function implicitEulerIntegrator(dimensions, iterations = 3) {
    return {
        name: 'Implicit Euler',
        code: `
// Implicit Euler integration (fixed-point iteration)
vec${dimensions} integrate(vec${dimensions} pos, float h) {
    // Start with explicit Euler as initial guess
    vec${dimensions} x_new = pos + h * get_velocity(pos);

    // Fixed-point iteration: x_new = x + h * f(x_new)
    for (int i = 0; i < ${iterations}; i++) {
        x_new = pos + h * get_velocity(x_new);
    }

    return x_new;
}
`
    };
}

/**
 * Symplectic Euler (Semi-implicit Euler) for Hamiltonian systems
 * Assumes even dimensions are positions, odd dimensions are velocities
 * Updates velocities first, then positions using new velocities
 * Preserves energy better than standard Euler
 */
export function symplecticEulerIntegrator(dimensions) {
    const coords = ['x', 'y', 'z', 'w'];

    // Generate unrolled update code for each position/velocity pair
    let updateCode = '';

    if (dimensions % 2 === 0) {
        // For even dimensions, treat pairs as (position, velocity)
        const numPairs = dimensions / 2;
        for (let i = 0; i < numPairs; i++) {
            const posIdx = i * 2;
            const velIdx = i * 2 + 1;
            const posCoord = coords[posIdx];
            const velCoord = coords[velIdx];

            updateCode += `
    // Pair ${i}: position[${posIdx}], velocity[${velIdx}]
    // Update velocity first (using current position)
    result.${velCoord} = pos.${velCoord} + h * vel.${velCoord};
    // Update position using new velocity
    result.${posCoord} = pos.${posCoord} + h * result.${velCoord};`;
        }
    } else {
        // For odd dimensions, update all but last dimension in pairs
        const numPairs = Math.floor(dimensions / 2);
        for (let i = 0; i < numPairs; i++) {
            const posIdx = i * 2;
            const velIdx = i * 2 + 1;
            const posCoord = coords[posIdx];
            const velCoord = coords[velIdx];

            updateCode += `
    // Pair ${i}: position[${posIdx}], velocity[${velIdx}]
    result.${velCoord} = pos.${velCoord} + h * vel.${velCoord};
    result.${posCoord} = pos.${posCoord} + h * result.${velCoord};`;
        }

        // Handle last dimension with standard Euler
        const lastCoord = coords[dimensions - 1];
        updateCode += `
    // Last dimension (odd): standard Euler
    result.${lastCoord} = pos.${lastCoord} + h * vel.${lastCoord};`;
    }

    return {
        name: 'Symplectic Euler',
        code: `
// Symplectic Euler integration
// Assumes alternating position/velocity pairs: (x0, v0, x1, v1, ...)
vec${dimensions} integrate(vec${dimensions} pos, float h) {
    vec${dimensions} vel = get_velocity(pos);
    vec${dimensions} result = pos;
${updateCode}

    return result;
}
`
    };
}

/**
 * Get integrator by name
 */
export function getIntegrator(name, dimensions, params = {}) {
    switch (name) {
        case 'euler':
            return eulerIntegrator(dimensions);
        case 'rk2':
            return rk2Integrator(dimensions);
        case 'rk4':
            return rk4Integrator(dimensions);
        case 'implicit':
            return implicitEulerIntegrator(dimensions, params.iterations || 3);
        case 'symplectic':
            return symplecticEulerIntegrator(dimensions);
        default:
            return rk4Integrator(dimensions); // Default to RK4
    }
}

/**
 * Create custom integrator from user GLSL code
 */
export function customIntegrator(glslCode, dimensions) {
    return {
        name: 'Custom',
        code: glslCode
    };
}
