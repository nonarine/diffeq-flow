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
 * Implicit Midpoint (Implicit RK2)
 * Solves: x(t+h) = x(t) + h*f((x(t) + x(t+h))/2) using fixed-point iteration
 * 2nd order accurate, A-stable (excellent for stiff systems)
 */
export function implicitMidpointIntegrator(dimensions, iterations = 4) {
    return {
        name: 'Implicit Midpoint',
        code: `
// Implicit Midpoint integration (fixed-point iteration)
vec${dimensions} integrate(vec${dimensions} pos, float h) {
    // Start with explicit RK2 as initial guess
    vec${dimensions} k1 = get_velocity(pos);
    vec${dimensions} x_new = pos + h * get_velocity(pos + h * 0.5 * k1);

    // Fixed-point iteration: x_new = x + h * f((x + x_new)/2)
    for (int i = 0; i < ${iterations}; i++) {
        vec${dimensions} x_mid = (pos + x_new) * 0.5;
        x_new = pos + h * get_velocity(x_mid);
    }

    return x_new;
}
`
    };
}

/**
 * Trapezoidal Rule (Implicit RK2)
 * Solves: x(t+h) = x(t) + h/2 * (f(x(t)) + f(x(t+h))) using fixed-point iteration
 * 2nd order accurate, A-stable
 */
export function trapezoidalIntegrator(dimensions, iterations = 4) {
    return {
        name: 'Trapezoidal',
        code: `
// Trapezoidal Rule integration (fixed-point iteration)
vec${dimensions} integrate(vec${dimensions} pos, float h) {
    vec${dimensions} f0 = get_velocity(pos);

    // Start with explicit Euler as initial guess
    vec${dimensions} x_new = pos + h * f0;

    // Fixed-point iteration: x_new = x + h/2 * (f(x) + f(x_new))
    for (int i = 0; i < ${iterations}; i++) {
        vec${dimensions} f_new = get_velocity(x_new);
        x_new = pos + h * 0.5 * (f0 + f_new);
    }

    return x_new;
}
`
    };
}

/**
 * Implicit RK4 (Gauss-Legendre)
 * Fully implicit 4th order method, excellent stability
 * Uses simplified 2-stage Gauss-Legendre with fixed-point iteration
 */
export function implicitRK4Integrator(dimensions, iterations = 5) {
    return {
        name: 'Implicit RK4',
        code: `
// Implicit RK4 (Gauss-Legendre 2-stage) integration
vec${dimensions} integrate(vec${dimensions} pos, float h) {
    // Gauss-Legendre coefficients for 2-stage method
    const float a11 = 0.25;
    const float a12 = 0.25 - sqrt(3.0) / 6.0;
    const float a21 = 0.25 + sqrt(3.0) / 6.0;
    const float a22 = 0.25;
    const float b1 = 0.5;
    const float b2 = 0.5;
    const float c1 = 0.5 - sqrt(3.0) / 6.0;
    const float c2 = 0.5 + sqrt(3.0) / 6.0;

    // Start with explicit RK4 as initial guess
    vec${dimensions} k1_guess = get_velocity(pos);
    vec${dimensions} k2_guess = get_velocity(pos + h * 0.5 * k1_guess);

    vec${dimensions} k1 = k1_guess;
    vec${dimensions} k2 = k2_guess;

    // Fixed-point iteration to solve implicit stages
    for (int i = 0; i < ${iterations}; i++) {
        k1 = get_velocity(pos + h * (a11 * k1 + a12 * k2));
        k2 = get_velocity(pos + h * (a21 * k1 + a22 * k2));
    }

    return pos + h * (b1 * k1 + b2 * k2);
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
        case 'implicit-euler':
            return implicitEulerIntegrator(dimensions, params.iterations || 3);
        case 'implicit-midpoint':
            return implicitMidpointIntegrator(dimensions, params.iterations || 4);
        case 'trapezoidal':
            return trapezoidalIntegrator(dimensions, params.iterations || 4);
        case 'implicit-rk4':
            return implicitRK4Integrator(dimensions, params.iterations || 5);
        case 'symplectic':
            return symplecticEulerIntegrator(dimensions);
        // Legacy alias
        case 'implicit':
            return implicitEulerIntegrator(dimensions, params.iterations || 3);
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
