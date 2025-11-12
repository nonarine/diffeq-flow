/**
 * Domain transformations for phase space integration
 *
 * Applies a 1-to-1 transformation T(x) before integration, then transforms back with T^(-1)(y).
 * This creates a spatially-varying effective timestep without breaking convergence.
 *
 * For dx/dt = f(x), we transform to y-space:
 *   y = T(x)
 *   dy/dt = J_T(x) * f(x)
 *
 * We integrate in y-space and transform back:
 *   y(t+h) = integrate(y(t), h, J_T * f ∘ T^(-1))
 *   x(t+h) = T^(-1)(y(t+h))
 */

// Transform parameter slider constants
const TRANSFORM_PARAM_MIN = 0.0001;
const TRANSFORM_PARAM_MAX = 25.0;
const TRANSFORM_PARAM_STEP = 0.0001;

/**
 * Base class for coordinate transformations
 */
class Transform {
    constructor(name, description) {
        this.name = name;
        this.description = description;
    }

    /**
     * Generate GLSL helper functions (optional)
     * @param {number} dimensions - Number of dimensions
     * @returns {string} GLSL helper function code
     */
    generateHelpers(dimensions) {
        return ''; // Default: no helpers
    }

    /**
     * Generate GLSL code for forward transform: y = T(x)
     * @param {number} dimensions - Number of dimensions
     * @returns {string} GLSL function code
     */
    generateForward(dimensions) {
        throw new Error('generateForward must be implemented');
    }

    /**
     * Generate GLSL code for inverse transform: x = T^(-1)(y)
     * @param {number} dimensions - Number of dimensions
     * @returns {string} GLSL function code
     */
    generateInverse(dimensions) {
        throw new Error('generateInverse must be implemented');
    }

    /**
     * Generate GLSL code for Jacobian: J_T(x)
     * @param {number} dimensions - Number of dimensions
     * @returns {string} GLSL function code
     */
    generateJacobian(dimensions) {
        throw new Error('generateJacobian must be implemented');
    }

    /**
     * Get parameter schema for UI controls
     * @returns {Array<{name: string, label: string, type: string, min: number, max: number, step: number, default: number}>}
     */
    getParameters() {
        return [];
    }
}

/**
 * Identity transform (no transformation)
 */
class IdentityTransform extends Transform {
    constructor() {
        super('identity', 'No transformation (identity)');
    }

    generateForward(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_forward(${vecType} x) {
    return x;
}`;
    }

    generateInverse(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_inverse(${vecType} y) {
    return y;
}`;
    }

    generateJacobian(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_jacobian(${vecType} x) {
    return ${vecType}(1.0);
}`;
    }
}

/**
 * Power transform (component-wise)
 * T(x) = sign(x) * |x|^alpha
 *
 * alpha < 1.0: More detail near origin, compress outer regions
 * alpha > 1.0: Less detail near origin, stretch outer regions
 */
class PowerTransform extends Transform {
    constructor() {
        super('power', 'Power transform (zoom lens effect)');
    }

    generateForward(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_forward(${vecType} x) {
    float alpha = u_transform_params.x;
    ${vecType} result;
    ${Array.from({length: dimensions}, (_, i) => {
        const comp = ['x', 'y', 'z', 'w'][i] || `[${i}]`;
        return `    result.${comp} = sign(x.${comp}) * pow(abs(x.${comp}) + 1e-8, alpha);`;
    }).join('\n')}
    return result;
}`;
    }

    generateInverse(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_inverse(${vecType} y) {
    float alpha = u_transform_params.x;
    float inv_alpha = 1.0 / alpha;
    ${vecType} result;
    ${Array.from({length: dimensions}, (_, i) => {
        const comp = ['x', 'y', 'z', 'w'][i] || `[${i}]`;
        return `    result.${comp} = sign(y.${comp}) * pow(abs(y.${comp}) + 1e-8, inv_alpha);`;
    }).join('\n')}
    return result;
}`;
    }

    generateJacobian(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_jacobian(${vecType} x) {
    float alpha = u_transform_params.x;
    ${vecType} result;
    ${Array.from({length: dimensions}, (_, i) => {
        const comp = ['x', 'y', 'z', 'w'][i] || `[${i}]`;
        return `    result.${comp} = alpha * pow(abs(x.${comp}) + 1e-8, alpha - 1.0);`;
    }).join('\n')}
    return result;
}`;
    }

    getParameters() {
        return [{
            name: 'alpha',
            label: 'Exponent (α)',
            type: 'slider',
            min: TRANSFORM_PARAM_MIN,
            max: TRANSFORM_PARAM_MAX,
            step: TRANSFORM_PARAM_STEP,
            default: 0.5,
            info: 'α < 1.0: zoom into origin; α > 1.0: compress origin'
        }];
    }
}

/**
 * Hyperbolic tangent transform (component-wise)
 * T(x) = tanh(beta * x)
 *
 * Compresses infinite space into [-1, 1]
 * Higher beta = more compression near origin
 */
class TanhTransform extends Transform {
    constructor() {
        super('tanh', 'Hyperbolic tangent (compress infinity)');
    }

    generateHelpers(dimensions) {
        return `
// Helper: tanh(x) = (exp(2x) - 1) / (exp(2x) + 1)
float tanh_scalar(float x) {
    float e2x = exp(2.0 * x);
    return (e2x - 1.0) / (e2x + 1.0);
}
`;
    }

    generateForward(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_forward(${vecType} x) {
    float beta = u_transform_params.x;
    ${vecType} result;
    ${Array.from({length: dimensions}, (_, i) => {
        const comp = ['x', 'y', 'z', 'w'][i] || `[${i}]`;
        return `result.${comp} = tanh_scalar(beta * x.${comp});`;
    }).join('\n    ')}
    return result;
}`;
    }

    generateInverse(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_inverse(${vecType} y) {
    float beta = u_transform_params.x;
    // atanh(y) = 0.5 * log((1+y)/(1-y))
    ${vecType} result;
    ${Array.from({length: dimensions}, (_, i) => {
        const comp = ['x', 'y', 'z', 'w'][i] || `[${i}]`;
        return `{
        float y_clamped = clamp(y.${comp}, -0.99999, 0.99999);
        result.${comp} = 0.5 * log((1.0 + y_clamped) / (1.0 - y_clamped)) / beta;
    }`;
    }).join('\n    ')}
    return result;
}`;
    }

    generateJacobian(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_jacobian(${vecType} x) {
    float beta = u_transform_params.x;
    // Jacobian of tanh: d/dx tanh(x) = 1 - tanh^2(x)
    ${vecType} tanh_vals;
    ${Array.from({length: dimensions}, (_, i) => {
        const comp = ['x', 'y', 'z', 'w'][i] || `[${i}]`;
        return `tanh_vals.${comp} = tanh_scalar(beta * x.${comp});`;
    }).join('\n    ')}
    return beta * (${vecType}(1.0) - tanh_vals * tanh_vals);
}`;
    }

    getParameters() {
        return [{
            name: 'beta',
            label: 'Compression (β)',
            type: 'slider',
            min: TRANSFORM_PARAM_MIN,
            max: TRANSFORM_PARAM_MAX,
            step: TRANSFORM_PARAM_STEP,
            default: 1.0,
            info: 'Higher = more compression. Maps infinite space to [-1,1]'
        }];
    }
}

/**
 * Logistic sigmoid transform (component-wise)
 * T(x) = 2*sigmoid(k*x) - 1 = 2/(1 + exp(-k*x)) - 1
 *
 * Compresses to [-1, 1], smoother than tanh in center region
 * Standard logistic function, centered at zero
 */
class SigmoidTransform extends Transform {
    constructor() {
        super('sigmoid', 'Logistic Sigmoid (smooth S-curve)');
    }

    generateHelpers(dimensions) {
        return `
// Helper: sigmoid(x) = 1 / (1 + exp(-x))
float sigmoid_scalar(float x) {
    return 1.0 / (1.0 + exp(-x));
}
`;
    }

    generateForward(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_forward(${vecType} x) {
    float k = u_transform_params.x;
    ${vecType} result;
    ${Array.from({length: dimensions}, (_, i) => {
        const comp = ['x', 'y', 'z', 'w'][i] || `[${i}]`;
        return `result.${comp} = 2.0 * sigmoid_scalar(k * x.${comp}) - 1.0;`;
    }).join('\n    ')}
    return result;
}`;
    }

    generateInverse(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_inverse(${vecType} y) {
    float k = u_transform_params.x;
    // Inverse: x = ln((y+1)/(1-y)) / k
    ${vecType} result;
    ${Array.from({length: dimensions}, (_, i) => {
        const comp = ['x', 'y', 'z', 'w'][i] || `[${i}]`;
        return `{
        float y_clamped = clamp(y.${comp}, -0.99999, 0.99999);
        result.${comp} = log((y_clamped + 1.0) / (1.0 - y_clamped)) / k;
    }`;
    }).join('\n    ')}
    return result;
}`;
    }

    generateJacobian(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_jacobian(${vecType} x) {
    float k = u_transform_params.x;
    // Jacobian: d/dx [2*sigmoid(k*x) - 1] = 2k * sigmoid(k*x) * (1 - sigmoid(k*x))
    ${vecType} result;
    ${Array.from({length: dimensions}, (_, i) => {
        const comp = ['x', 'y', 'z', 'w'][i] || `[${i}]`;
        return `{
        float sig = sigmoid_scalar(k * x.${comp});
        result.${comp} = 2.0 * k * sig * (1.0 - sig);
    }`;
    }).join('\n    ')}
    return result;
}`;
    }

    getParameters() {
        return [{
            name: 'k',
            label: 'Steepness (k)',
            type: 'slider',
            min: TRANSFORM_PARAM_MIN,
            max: TRANSFORM_PARAM_MAX,
            step: TRANSFORM_PARAM_STEP,
            default: 1.0,
            info: 'Higher = steeper transition. Maps infinite space to [-1,1] with logistic curve.'
        }];
    }
}

/**
 * Rational transform (component-wise)
 * T(x) = x / sqrt(x^2 + a)
 * Jacobian: a/(x^2+a)^(3/2) - bell-shaped!
 *
 * Compresses to (-√a, √a), with bell-shaped derivative
 * Parameter 'a' controls bell width: higher = wider/shallower, lower = narrower/sharper
 */
class RationalTransform extends Transform {
    constructor() {
        super('rational', 'Rational (bell-shaped Jacobian)');
    }

    generateForward(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_forward(${vecType} x) {
    float a = u_transform_params.x;
    ${vecType} result;
    ${Array.from({length: dimensions}, (_, i) => {
        const comp = ['x', 'y', 'z', 'w'][i] || `[${i}]`;
        return `result.${comp} = x.${comp} / sqrt(x.${comp} * x.${comp} + a);`;
    }).join('\n    ')}
    return result;
}`;
    }

    generateInverse(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_inverse(${vecType} y) {
    float a = u_transform_params.x;
    // Inverse: x = y * sqrt(a / (1 - y^2))
    // Note: y is bounded to [-1, 1] regardless of a
    ${vecType} result;
    ${Array.from({length: dimensions}, (_, i) => {
        const comp = ['x', 'y', 'z', 'w'][i] || `[${i}]`;
        return `{
        float y_clamped = clamp(y.${comp}, -0.99999, 0.99999);
        float y_sq = y_clamped * y_clamped;
        result.${comp} = y_clamped * sqrt(a / (1.0 - y_sq));
    }`;
    }).join('\n    ')}
    return result;
}`;
    }

    generateJacobian(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_jacobian(${vecType} x) {
    float a = u_transform_params.x;
    // Jacobian: d/dx [x/sqrt(x^2+a)] = a/(x^2+a)^(3/2)
    // This is bell-shaped! Peaks at x=0, decays at infinity
    ${vecType} result;
    ${Array.from({length: dimensions}, (_, i) => {
        const comp = ['x', 'y', 'z', 'w'][i] || `[${i}]`;
        return `{
        float x_sq = x.${comp} * x.${comp};
        float denom = x_sq + a;
        result.${comp} = a / (denom * sqrt(denom));
    }`;
    }).join('\n    ')}
    return result;
}`;
    }

    getParameters() {
        return [{
            name: 'a',
            label: 'Width (a)',
            type: 'slider',
            min: TRANSFORM_PARAM_MIN,
            max: TRANSFORM_PARAM_MAX,
            step: TRANSFORM_PARAM_STEP,
            default: 1.0,
            info: 'Controls bell curve width. Higher = wider/shallower, lower = narrower/sharper.'
        }];
    }
}

/**
 * Sine wave distortion (component-wise)
 * T(x) = x + amplitude * sin(frequency * x)
 *
 * Creates periodic "speed bumps" in integration
 */
class SineTransform extends Transform {
    constructor() {
        super('sine', 'Sine wave distortion (periodic speed bumps)');
    }

    generateForward(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_forward(${vecType} x) {
    float amplitude = u_transform_params.x;
    float frequency = u_transform_params.y;
    return x + amplitude * sin(frequency * x);
}`;
    }

    generateInverse(dimensions) {
        const vecType = `vec${dimensions}`;
        // Use Newton's method to solve y = x + a*sin(f*x) for x
        return `
${vecType} transform_inverse(${vecType} y) {
    float amplitude = u_transform_params.x;
    float frequency = u_transform_params.y;

    // Newton's method: x_{n+1} = x_n - (f(x_n) - y) / f'(x_n)
    // where f(x) = x + a*sin(f*x)
    // f'(x) = 1 + a*f*cos(f*x)
    ${vecType} x = y; // Initial guess
    for (int iter = 0; iter < 5; iter++) {
        ${vecType} fx = x + amplitude * sin(frequency * x);
        ${vecType} dfx = ${vecType}(1.0) + amplitude * frequency * cos(frequency * x);
        x = x - (fx - y) / dfx;
    }
    return x;
}`;
    }

    generateJacobian(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_jacobian(${vecType} x) {
    float amplitude = u_transform_params.x;
    float frequency = u_transform_params.y;
    return ${vecType}(1.0) + amplitude * frequency * cos(frequency * x);
}`;
    }

    getParameters() {
        return [
            {
                name: 'amplitude',
                label: 'Amplitude',
                type: 'slider',
                min: TRANSFORM_PARAM_MIN,
                max: TRANSFORM_PARAM_MAX,
                step: TRANSFORM_PARAM_STEP,
                default: 0.5,
                info: 'Strength of distortion'
            },
            {
                name: 'frequency',
                label: 'Frequency',
                type: 'slider',
                min: TRANSFORM_PARAM_MIN,
                max: TRANSFORM_PARAM_MAX,
                step: TRANSFORM_PARAM_STEP,
                default: 1.0,
                info: 'Number of waves per unit length'
            }
        ];
    }
}

/**
 * Radial power transform (2D and 3D)
 * In polar/spherical coordinates: r' = r^alpha, theta' = theta
 *
 * Changes integration density as function of distance from origin
 */
class RadialPowerTransform extends Transform {
    constructor() {
        super('radial_power', 'Radial power (compress/expand by distance)');
    }

    generateForward(dimensions) {
        const vecType = `vec${dimensions}`;
        if (dimensions === 2) {
            return `
${vecType} transform_forward(${vecType} x) {
    float alpha = u_transform_params.x;
    float r = length(x);
    if (r < 1e-8) return x;
    float r_new = pow(r, alpha);
    return x * (r_new / r);
}`;
        } else {
            // For higher dimensions, apply same radial logic
            return `
${vecType} transform_forward(${vecType} x) {
    float alpha = u_transform_params.x;
    float r = length(x);
    if (r < 1e-8) return x;
    float r_new = pow(r, alpha);
    return x * (r_new / r);
}`;
        }
    }

    generateInverse(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_inverse(${vecType} y) {
    float alpha = u_transform_params.x;
    float inv_alpha = 1.0 / alpha;
    float r = length(y);
    if (r < 1e-8) return y;
    float r_new = pow(r, inv_alpha);
    return y * (r_new / r);
}`;
    }

    generateJacobian(dimensions) {
        const vecType = `vec${dimensions}`;
        // Jacobian is scalar for radial transform: J = alpha * r^(alpha-1)
        // But we need component-wise for vector field multiplication
        // For radial transform, Jacobian is J = alpha * r^(alpha-1) * I (identity matrix scaled)
        // In component form: J_i = alpha * r^(alpha-1)
        return `
${vecType} transform_jacobian(${vecType} x) {
    float alpha = u_transform_params.x;
    float r = length(x);
    float jacobian_scalar = alpha * pow(r + 1e-8, alpha - 1.0);
    return ${vecType}(jacobian_scalar);
}`;
    }

    getParameters() {
        return [{
            name: 'alpha',
            label: 'Radial Exponent (α)',
            type: 'slider',
            min: 0.1,
            max: 3.0,
            step: 0.1,
            default: 0.5,
            info: 'α < 1.0: zoom into origin; α > 1.0: compress origin'
        }];
    }
}

/**
 * Logarithmic transform (component-wise)
 * T(x) = sign(x) * log(|x| + 1)
 *
 * Stretches near zero (large derivative), compresses at infinity
 * Maps infinite space to infinite space with logarithmic spacing
 */
class LogTransform extends Transform {
    constructor() {
        super('log', 'Logarithmic (stretch near zero)');
    }

    generateForward(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_forward(${vecType} x) {
    ${vecType} result;
    ${Array.from({length: dimensions}, (_, i) => {
        const comp = ['x', 'y', 'z', 'w'][i] || `[${i}]`;
        return `result.${comp} = sign(x.${comp}) * log(abs(x.${comp}) + 1.0);`;
    }).join('\n    ')}
    return result;
}`;
    }

    generateInverse(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_inverse(${vecType} y) {
    ${vecType} result;
    ${Array.from({length: dimensions}, (_, i) => {
        const comp = ['x', 'y', 'z', 'w'][i] || `[${i}]`;
        return `result.${comp} = sign(y.${comp}) * (exp(abs(y.${comp})) - 1.0);`;
    }).join('\n    ')}
    return result;
}`;
    }

    generateJacobian(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_jacobian(${vecType} x) {
    // Jacobian: d/dx [sign(x)*log(|x|+1)] = 1/(|x|+1)
    ${vecType} result;
    ${Array.from({length: dimensions}, (_, i) => {
        const comp = ['x', 'y', 'z', 'w'][i] || `[${i}]`;
        return `result.${comp} = 1.0 / (abs(x.${comp}) + 1.0);`;
    }).join('\n    ')}
    return result;
}`;
    }

    getParameters() {
        return [];
    }
}

/**
 * Exponential transform (component-wise)
 * T(x) = sign(x) * (exp(α*|x|) - 1)
 *
 * Compresses near zero, stretches at infinity
 * Creates exponential growth away from origin
 */
class ExpTransform extends Transform {
    constructor() {
        super('exp', 'Exponential (compress near zero)');
    }

    generateForward(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_forward(${vecType} x) {
    float alpha = u_transform_params.x;
    ${vecType} result;
    ${Array.from({length: dimensions}, (_, i) => {
        const comp = ['x', 'y', 'z', 'w'][i] || `[${i}]`;
        return `result.${comp} = sign(x.${comp}) * (exp(alpha * abs(x.${comp})) - 1.0);`;
    }).join('\n    ')}
    return result;
}`;
    }

    generateInverse(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_inverse(${vecType} y) {
    float alpha = u_transform_params.x;
    ${vecType} result;
    ${Array.from({length: dimensions}, (_, i) => {
        const comp = ['x', 'y', 'z', 'w'][i] || `[${i}]`;
        return `result.${comp} = sign(y.${comp}) * log(abs(y.${comp}) + 1.0) / alpha;`;
    }).join('\n    ')}
    return result;
}`;
    }

    generateJacobian(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_jacobian(${vecType} x) {
    float alpha = u_transform_params.x;
    // Jacobian: d/dx [sign(x)*(exp(α|x|)-1)] = α*exp(α|x|)
    ${vecType} result;
    ${Array.from({length: dimensions}, (_, i) => {
        const comp = ['x', 'y', 'z', 'w'][i] || `[${i}]`;
        return `result.${comp} = alpha * exp(alpha * abs(x.${comp}));`;
    }).join('\n    ')}
    return result;
}`;
    }

    getParameters() {
        return [{
            name: 'alpha',
            label: 'Growth Rate (α)',
            type: 'slider',
            min: 0.1,
            max: 2.0,
            step: 0.1,
            default: 0.5,
            info: 'Higher α = stronger exponential growth. Use small values (0.1-0.5) to avoid overflow.'
        }];
    }
}

/**
 * Soft-sign transform (component-wise)
 * T(x) = x / (1 + |x|)
 *
 * Compresses to [-1, 1], smooth S-curve
 * Similar to tanh but simpler, no parameters
 */
class SoftsignTransform extends Transform {
    constructor() {
        super('softsign', 'Soft-sign (smooth compression to [-1,1])');
    }

    generateForward(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_forward(${vecType} x) {
    ${vecType} result;
    ${Array.from({length: dimensions}, (_, i) => {
        const comp = ['x', 'y', 'z', 'w'][i] || `[${i}]`;
        return `result.${comp} = x.${comp} / (1.0 + abs(x.${comp}));`;
    }).join('\n    ')}
    return result;
}`;
    }

    generateInverse(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_inverse(${vecType} y) {
    ${vecType} result;
    ${Array.from({length: dimensions}, (_, i) => {
        const comp = ['x', 'y', 'z', 'w'][i] || `[${i}]`;
        return `{
        float y_clamped = clamp(y.${comp}, -0.99999, 0.99999);
        result.${comp} = y_clamped / (1.0 - abs(y_clamped));
    }`;
    }).join('\n    ')}
    return result;
}`;
    }

    generateJacobian(dimensions) {
        const vecType = `vec${dimensions}`;
        return `
${vecType} transform_jacobian(${vecType} x) {
    // Jacobian: d/dx [x/(1+|x|)] = 1/(1+|x|)^2
    ${vecType} result;
    ${Array.from({length: dimensions}, (_, i) => {
        const comp = ['x', 'y', 'z', 'w'][i] || `[${i}]`;
        return `{
        float denom = 1.0 + abs(x.${comp});
        result.${comp} = 1.0 / (denom * denom);
    }`;
    }).join('\n    ')}
    return result;
}`;
    }

    getParameters() {
        return [];
    }
}

/**
 * Custom transform (user-defined)
 * Requires user to provide forward, inverse, and Jacobian expressions
 */
class CustomTransform extends Transform {
    constructor() {
        super('custom', 'Custom (user-defined GLSL)');
        this.forwardCode = '';
        this.inverseCode = '';
        this.jacobianCode = '';
    }

    setCode(forward, inverse, jacobian) {
        this.forwardCode = forward;
        this.inverseCode = inverse;
        this.jacobianCode = jacobian;
    }

    generateForward(dimensions) {
        return this.forwardCode || new IdentityTransform().generateForward(dimensions);
    }

    generateInverse(dimensions) {
        return this.inverseCode || new IdentityTransform().generateInverse(dimensions);
    }

    generateJacobian(dimensions) {
        return this.jacobianCode || new IdentityTransform().generateJacobian(dimensions);
    }
}

/**
 * Transform registry
 */
const transforms = {
    identity: new IdentityTransform(),
    power: new PowerTransform(),
    log: new LogTransform(),
    exp: new ExpTransform(),
    softsign: new SoftsignTransform(),
    tanh: new TanhTransform(),
    sigmoid: new SigmoidTransform(),
    rational: new RationalTransform(),
    sine: new SineTransform(),
    radial_power: new RadialPowerTransform(),
    custom: new CustomTransform()
};

/**
 * Get transform by name
 */
function getTransform(name) {
    return transforms[name] || transforms.identity;
}

/**
 * Get all transform names
 */
function getTransformNames() {
    return Object.keys(transforms);
}

/**
 * Get transform list for UI
 */
function getTransformList() {
    return Object.entries(transforms).map(([key, transform]) => ({
        value: key,
        label: transform.description
    }));
}

export {
    Transform,
    IdentityTransform,
    PowerTransform,
    TanhTransform,
    SineTransform,
    RadialPowerTransform,
    CustomTransform,
    getTransform,
    getTransformNames,
    getTransformList
};
