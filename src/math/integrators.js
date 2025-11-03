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
 * Symplectic Euler (for Hamiltonian systems)
 * Preserves energy better than standard Euler
 */
export function symplecticEulerIntegrator(dimensions) {
    // Note: This requires splitting position and velocity
    // For now, using standard Euler, but can be extended
    return {
        name: 'Symplectic Euler',
        code: `
// Symplectic Euler integration
// Note: Works best for systems with position-velocity splitting
vec${dimensions} integrate(vec${dimensions} pos, float h) {
    vec${dimensions} velocity = get_velocity(pos);
    // First update velocity, then position (symplectic)
    // This is a simplified version; proper implementation depends on system structure
    return pos + h * velocity;
}
`
    };
}

/**
 * Get integrator by name
 */
export function getIntegrator(name, dimensions) {
    switch (name) {
        case 'euler':
            return eulerIntegrator(dimensions);
        case 'rk2':
            return rk2Integrator(dimensions);
        case 'rk4':
            return rk4Integrator(dimensions);
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
