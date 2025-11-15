# Implicit Solver Architecture Documentation

## Table of Contents
1. [Overview](#overview)
2. [The Problem](#the-problem)
3. [The Solution](#the-solution)
4. [Solver Generator Functions](#solver-generator-functions)
5. [Integrator Implementations](#integrator-implementations)
6. [Generated GLSL Examples](#generated-glsl-examples)
7. [Adding New Solvers](#adding-new-solvers)
8. [Adding New Integrators](#adding-new-integrators)

---

## Overview

This document describes the architecture for solving implicit numerical integration equations in the particle flow renderer. The system separates **solver algorithms** (how to solve implicit equations) from **integrator methods** (what equations to solve), using a function generator pattern to compose GLSL shader code dynamically.

**Key Insight**: All implicit integrators solve equations of the form `F(x) = 0` iteratively, but they differ in:
- What `F(x)` looks like (the integrator's responsibility)
- How to find the solution (the solver's responsibility)

By separating these concerns, we can mix-and-match any solver with any integrator.

---

## The Problem

### Original Implementation Issues

The original code had these problems:

1. **Massive code duplication**: Each integrator (Implicit Euler, Implicit Midpoint, Trapezoidal, Implicit RK4) manually implemented both fixed-point and Newton's method solvers.

2. **Fragile string manipulation**: Early refactoring attempts used string replacement like:
   ```javascript
   updateExpr.replace(new RegExp(varName, 'g'), midName)
   ```
   This broke when expressions had different structure (e.g., `f((pos + x_new)/2)` vs `f(x_new)`).

3. **Hard to extend**: Adding a new solver (like midpoint predictor-corrector) required updating 4+ integrator functions, each 50-100 lines long.

4. **Implicit RK4 couldn't reuse code**: It has two coupled stages solved Gauss-Seidel style, which didn't fit the single-equation pattern.

### What We Needed

- Generate only the **loop body** for each solver iteration
- Let each integrator build its own loop structure
- Use **function generators** instead of string replacement
- Support both single-stage (Euler, Midpoint, Trapezoidal) and multi-stage (RK4) integrators

---

## The Solution

### Architecture: Function Generators + Composable Loop Bodies

```
┌─────────────────────────────────────────────────────────┐
│                   Integrator Function                   │
│  (Implicit Euler, Implicit Midpoint, Trapezoidal, RK4) │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ Defines problem-specific update functions:
                 │   updateExprFn = (v) => `pos + h * get_velocity(${v})`
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│              Solver Generator Function                  │
│   (Fixed-Point, Midpoint, Newton)                       │
│                                                          │
│   Input:  varName, updateExprFn, dimensions             │
│   Output: GLSL loop body (single iteration)             │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ Returns GLSL code snippet:
                 │   "        x_new = pos + h * get_velocity(x_new);"
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│                  Integrator builds loop:                │
│                                                          │
│   for (int i = 0; i < iterations; i++) {                │
│       ${solverBody}                                      │
│   }                                                      │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Function Generators**: Solver generators accept **JavaScript functions** that generate GLSL code:
   ```javascript
   const updateExprFn = (v) => `pos + h * get_velocity(${v})`;
   ```

   This allows the integrator to define how variables appear in the expression without string manipulation.

2. **Loop Bodies Only**: Solver generators return only the iteration body:
   ```javascript
   return `        ${varName} = ${updateExpr};`;
   ```

   The integrator wraps this in its own loop, initial guess, and variable declarations.

3. **Gauss-Seidel for Coupled Stages**: RK4 calls solver generators twice in one loop:
   ```javascript
   for (int i = 0; i < iterations; i++) {
       // Stage 1
       ${k1_solverBody}

       // Stage 2
       ${k2_solverBody}
   }
   ```

---

## Solver Generator Functions

Located in `src/math/integrators.js` (lines 163-223).

### 1. Fixed-Point Iteration

**Purpose**: Simple substitution: `x := update(x)`

**Signature**:
```javascript
function generateFixedPointSolverBody(varName, updateExprFn, dimensions)
```

**Parameters**:
- `varName` - Variable to solve for (e.g., `'x_new'`, `'k1'`)
- `updateExprFn` - Function: `(varName) => GLSL expression`
- `dimensions` - Number of dimensions (for type checking)

**Example**:
```javascript
const updateFn = (v) => `pos + h * get_velocity(${v})`;
const body = generateFixedPointSolverBody('x_new', updateFn, 3);
// Returns: "        x_new = pos + h * get_velocity(x_new);"
```

**Generated GLSL**:
```glsl
x_new = pos + h * get_velocity(x_new);
```

---

### 2. Midpoint Solver (Predictor-Corrector)

**Purpose**: Accelerate convergence by evaluating at midpoint between current and predicted values.

**Algorithm**:
1. **Predictor**: Compute `x_pred = update(x_current)`
2. **Midpoint**: `x_mid = (x_current + x_pred) / 2`
3. **Corrector**: `x_new = update(x_mid)`

**Signature**:
```javascript
function generateMidpointSolverBody(varName, updateExprFn, dimensions)
```

**Example**:
```javascript
const updateFn = (v) => `pos + h * get_velocity(${v})`;
const body = generateMidpointSolverBody('x_new', updateFn, 3);
```

**Generated GLSL**:
```glsl
// Predictor: standard fixed-point step
vec3 x_new_pred = pos + h * get_velocity(x_new);

// Corrector: evaluate at midpoint between current and predictor
vec3 x_new_mid = (x_new + x_new_pred) * 0.5;
x_new = pos + h * get_velocity(x_new_mid);
```

**Why it's faster**: The midpoint evaluation provides a better approximation, requiring fewer iterations to converge than fixed-point.

---

### 3. Newton's Method

**Purpose**: Quadratic convergence using Jacobian linearization.

**Algorithm**: Solve `F(x) = 0` using `x := x - J^(-1) * F(x)`

**Signature**:
```javascript
function generateNewtonSolverBody(varName, residualExprFn, jacobianExprFn, dimensions)
```

**Parameters**:
- `residualExprFn` - Function: `(varName) => GLSL expression for F(x)`
- `jacobianExprFn` - Function: `(varName) => GLSL expression for Jacobian matrix`

**Example**:
```javascript
const residualFn = (v) => `${v} - pos - h * get_velocity(${v})`;
const jacobianFn = (v) => `mat3(1.0) - h * computeJacobian(${v})`;
const body = generateNewtonSolverBody('x_new', residualFn, jacobianFn, 3);
```

**Generated GLSL**:
```glsl
vec3 F = x_new - pos - h * get_velocity(x_new);
mat3 J = mat3(1.0) - h * computeJacobian(x_new);

// Newton step: x -= J^(-1) * F
vec3 delta = inverse3(J) * F;
x_new -= delta;
```

**Note**: Newton's method requires symbolic differentiation to compute the Jacobian, handled separately by `computeSymbolicJacobian()` from `jacobian.js`.

---

## Integrator Implementations

### Pattern: Single-Stage Integrators

All single-stage integrators (Implicit Euler, Implicit Midpoint, Trapezoidal) follow this pattern:

```javascript
export function implicitXIntegrator(dimensions, iterations, solutionMethod, expressions) {
    // 1. Define the problem
    const initialGuess = '...';  // GLSL expression
    const updateExprFn = (v) => `...${v}...`;  // Function generator

    // 2. Choose solver
    let solverBody;
    let solverName;
    let jacobianGLSL = '';

    if (solutionMethod === 'newton' && expressions) {
        // Try to compute Jacobian
        const jacobian = computeSymbolicJacobian(expressions, dimensions);
        if (isValidJacobian(jacobian)) {
            jacobianGLSL = generateJacobianGLSL(jacobian, dimensions);
            const residualFn = (v) => `...`;
            const jacobianFn = (v) => `...`;
            solverBody = generateNewtonSolverBody('x_new', residualFn, jacobianFn, dimensions);
            solverName = 'Newton';
        } else {
            // Fall back to fixed-point
            solutionMethod = 'fixed-point';
        }
    }

    if (!solverBody) {
        if (solutionMethod === 'midpoint') {
            solverBody = generateMidpointSolverBody('x_new', updateExprFn, dimensions);
            solverName = 'Midpoint';
        } else {
            solverBody = generateFixedPointSolverBody('x_new', updateExprFn, dimensions);
            solverName = 'Fixed-Point';
        }
    }

    // 3. Build the GLSL code
    return {
        name: `Integrator Name (${solverName})`,
        code: `
${jacobianGLSL}
vec${dimensions} integrate(vec${dimensions} pos, float h) {
    vec${dimensions} x_new = ${initialGuess};

    for (int i = 0; i < ${iterations}; i++) {
${solverBody}
    }

    return x_new;
}
`
    };
}
```

---

### Example 1: Implicit Euler

**Equation**: `x(t+h) = x(t) + h*f(x(t+h))`

**Problem Definition**:
```javascript
const updateExprFn = (v) => `pos + h * get_velocity(${v})`;
```

**Fixed-Point Solver Body**:
```glsl
x_new = pos + h * get_velocity(x_new);
```

**Midpoint Solver Body**:
```glsl
vec3 x_new_pred = pos + h * get_velocity(x_new);
vec3 x_new_mid = (x_new + x_new_pred) * 0.5;
x_new = pos + h * get_velocity(x_new_mid);
```

**Newton Solver Body**:
```glsl
vec3 F = x_new - pos - h * get_velocity(x_new);
mat3 J = mat3(1.0) - h * computeJacobian(x_new);
vec3 delta = inverse3(J) * F;
x_new -= delta;
```

---

### Example 2: Implicit Midpoint

**Equation**: `x(t+h) = x(t) + h*f((x(t) + x(t+h))/2)`

**Problem Definition**:
```javascript
const updateExprFn = (v) => `pos + h * get_velocity((pos + ${v}) * 0.5)`;
```

**Key Difference**: The update function itself computes a midpoint! When the midpoint solver evaluates this, it creates nested midpoint calculations, which converges very quickly.

**Fixed-Point Solver Body**:
```glsl
x_new = pos + h * get_velocity((pos + x_new) * 0.5);
```

**Midpoint Solver Body**:
```glsl
vec3 x_new_pred = pos + h * get_velocity((pos + x_new) * 0.5);
vec3 x_new_mid = (x_new + x_new_pred) * 0.5;
x_new = pos + h * get_velocity((pos + x_new_mid) * 0.5);
```

---

### Example 3: Trapezoidal Rule

**Equation**: `x(t+h) = x(t) + h/2 * (f(x(t)) + f(x(t+h)))`

**Problem Definition**:
```javascript
const updateExprFn = (v) => `pos + h * 0.5 * (f0 + get_velocity(${v}))`;
```

**Key Detail**: `f0 = get_velocity(pos)` is pre-computed before the loop, then used in every iteration.

**Fixed-Point Solver Body**:
```glsl
x_new = pos + h * 0.5 * (f0 + get_velocity(x_new));
```

---

### Example 4: Implicit RK4 (Coupled Stages) - DETAILED EXPLANATION

Implicit RK4 is the most complex integrator because it has **two coupled stages** that must be solved simultaneously. This section explains how we handle it using the solver generator architecture.

#### The Mathematical Problem

**Gauss-Legendre 2-Stage Implicit RK4**:
```
k1 = f(pos + h*(a11*k1 + a12*k2))
k2 = f(pos + h*(a21*k1 + a22*k2))
```

Where `a11`, `a12`, `a21`, `a22` are Gauss-Legendre coefficients (constants defined in the shader).

**Key Challenge**: Both `k1` and `k2` appear in both equations! They're **mutually dependent**.

#### Solving Strategy: Gauss-Seidel Iteration

Instead of solving the full coupled 2N×2N system simultaneously (which would be very complex), we use **Gauss-Seidel iteration**:

1. Update `k1` while treating `k2` as constant
2. Update `k2` using the newly computed `k1`
3. Repeat until convergence

This is simpler and fits perfectly with our solver generator architecture.

#### Implementation Pattern

**Step 1: Define update functions for each stage**
```javascript
// Stage 1: k1 depends on itself AND k2
const k1_updateFn = (v) => `get_velocity(pos + h * (a11 * ${v} + a12 * k2))`;

// Stage 2: k2 depends on k1 AND itself
const k2_updateFn = (v) => `get_velocity(pos + h * (a21 * k1 + a22 * ${v}))`;
```

**Step 2: Generate solver bodies for each stage**
```javascript
// For fixed-point solver
const k1_solverBody = generateFixedPointSolverBody('k1', k1_updateFn, dimensions);
const k2_solverBody = generateFixedPointSolverBody('k2', k2_updateFn, dimensions);

// For midpoint solver
const k1_solverBody = generateMidpointSolverBody('k1', k1_updateFn, dimensions);
const k2_solverBody = generateMidpointSolverBody('k2', k2_updateFn, dimensions);

// For Newton's method
const k1_residualFn = (v) => `${v} - get_velocity(pos + h * (a11 * ${v} + a12 * k2))`;
const k1_jacobianFn = (v) => `mat2(1.0) - (h * a11) * computeJacobian(pos + h * (a11 * ${v} + a12 * k2))`;
const k1_solverBody = generateNewtonSolverBody('k1', k1_residualFn, k1_jacobianFn, dimensions);

const k2_residualFn = (v) => `${v} - get_velocity(pos + h * (a21 * k1 + a22 * ${v}))`;
const k2_jacobianFn = (v) => `mat2(1.0) - (h * a22) * computeJacobian(pos + h * (a21 * k1 + a22 * ${v}))`;
const k2_solverBody = generateNewtonSolverBody('k2', k2_residualFn, k2_jacobianFn, dimensions);
```

**Step 3: Combine both solver bodies in a single loop**
```javascript
const solverCode = `
    // Iterative solver for coupled stages (Gauss-Seidel style)
    for (int i = 0; i < ${iterations}; i++) {
        // Stage 1: solve for k1 (k2 is treated as constant)
${k1_solverBody}

        // Stage 2: solve for k2 (using updated k1)
${k2_solverBody}
    }`;
```

#### Generated GLSL Example (Fixed-Point)

```glsl
vec2 integrate(vec2 pos, float h) {
    // Gauss-Legendre coefficients
    const float a11 = 0.25;
    const float a12 = 0.25 - sqrt(3.0) / 6.0;
    const float a21 = 0.25 + sqrt(3.0) / 6.0;
    const float a22 = 0.25;
    const float b1 = 0.5;
    const float b2 = 0.5;

    // Initial guess
    vec2 k1 = get_velocity(pos);
    vec2 k2 = get_velocity(pos + h * 0.5 * k1);

    // Iterative solver for coupled stages (Gauss-Seidel style)
    for (int i = 0; i < 5; i++) {
        // Stage 1
        k1 = get_velocity(pos + h * (a11 * k1 + a12 * k2));

        // Stage 2
        k2 = get_velocity(pos + h * (a21 * k1 + a22 * k2));
    }

    return pos + h * (b1 * k1 + b2 * k2);
}
```

#### Generated GLSL Example (Midpoint Solver)

```glsl
vec2 integrate(vec2 pos, float h) {
    // ... (coefficients and initial guess same as above)

    // Iterative solver for coupled stages (Gauss-Seidel style)
    for (int i = 0; i < 5; i++) {
        // Stage 1: predictor-corrector for k1
        vec2 k1_pred = get_velocity(pos + h * (a11 * k1 + a12 * k2));
        vec2 k1_mid = (k1 + k1_pred) * 0.5;
        k1 = get_velocity(pos + h * (a11 * k1_mid + a12 * k2));

        // Stage 2: predictor-corrector for k2
        vec2 k2_pred = get_velocity(pos + h * (a21 * k1 + a22 * k2));
        vec2 k2_mid = (k2 + k2_pred) * 0.5;
        k2 = get_velocity(pos + h * (a21 * k1 + a22 * k2_mid));
    }

    return pos + h * (b1 * k1 + b2 * k2);
}
```

#### Generated GLSL Example (Newton's Method)

```glsl
vec2 integrate(vec2 pos, float h) {
    // ... (coefficients and initial guess same as above)

    // Iterative solver for coupled stages (Gauss-Seidel style)
    for (int i = 0; i < 5; i++) {
        // Stage 1: Newton's method for k1
        vec2 F_k1 = k1 - get_velocity(pos + h * (a11 * k1 + a12 * k2));
        mat2 J_k1 = mat2(1.0) - (h * a11) * computeJacobian(pos + h * (a11 * k1 + a12 * k2));
        vec2 delta_k1 = inverse2(J_k1) * F_k1;
        k1 -= delta_k1;

        // Stage 2: Newton's method for k2
        vec2 F_k2 = k2 - get_velocity(pos + h * (a21 * k1 + a22 * k2));
        mat2 J_k2 = mat2(1.0) - (h * a22) * computeJacobian(pos + h * (a21 * k1 + a22 * k2));
        vec2 delta_k2 = inverse2(J_k2) * F_k2;
        k2 -= delta_k2;
    }

    return pos + h * (b1 * k1 + b2 * k2);
}
```

#### Critical Design Detail: Variable Name Prefixing

**Problem**: When we call `generateNewtonSolverBody()` twice in the same loop scope (once for k1, once for k2), the generated code would normally declare variables like `F`, `J`, and `delta` twice, causing GLSL compilation errors.

**Solution**: The Newton solver generator prefixes temporary variables with the variable name being solved:

```javascript
// Inside generateNewtonSolverBody():
return `        ${vecType} F_${varName} = ${residualExpr};     // F_k1, F_k2
        ${matType} J_${varName} = ${jacobianExpr};     // J_k1, J_k2
        ${vecType} delta_${varName} = ...;              // delta_k1, delta_k2
        ${varName} -= delta_${varName};`;
```

This ensures unique variable names even when the solver body is used multiple times in the same scope.

#### Why This Architecture Works So Well for RK4

1. **Reusable**: The same solver generators work for single-stage (Euler, Midpoint, Trapezoidal) AND multi-stage (RK4) integrators
2. **Composable**: We can call solver generators multiple times and arrange them however we need
3. **Consistent**: All three solver methods (fixed-point, midpoint, Newton) work identically for RK4
4. **Maintainable**: Adding a new solver (e.g., Anderson acceleration) automatically works for RK4 too

#### Gauss-Seidel vs. Full Newton's Method

**What we implemented (Gauss-Seidel):**
- Solve each stage separately using the current value of the other stage
- Iterate until both converge
- Jacobian is N×N for each stage

**Full coupled Newton's method (not implemented):**
- Solve both stages simultaneously as a single 2N×2N system
- Would require:
  - Computing a 2N×2N Jacobian matrix
  - Inverting a 2N×2N matrix (expensive!)
  - More complex code generation
- Converges in fewer iterations but each iteration is much more expensive
- Not worth the complexity for this application

The Gauss-Seidel approach gives us 90% of the benefits with 10% of the complexity.

#### Key Takeaways

1. **Multi-stage implicit integrators** can reuse the same solver generators as single-stage integrators
2. **Gauss-Seidel iteration** allows us to treat coupled equations as sequential single-variable solves
3. **Variable name prefixing** prevents conflicts when generating multiple solver bodies in the same scope
4. **All three solvers** (fixed-point, midpoint, Newton) work seamlessly with this pattern

This design pattern could be extended to even more complex integrators (e.g., 3-stage or 4-stage implicit RK methods) without modifying the solver generators at all.

---

## Generated GLSL Examples

### Fixed-Point Implicit Euler (3D)

```glsl
vec3 integrate(vec3 pos, float h) {
    // Start with initial guess
    vec3 x_new = pos + h * get_velocity(pos);

    // Iterative solver
    for (int i = 0; i < 3; i++) {
        x_new = pos + h * get_velocity(x_new);
    }

    return x_new;
}
```

---

### Midpoint Solver Trapezoidal (2D)

```glsl
vec2 integrate(vec2 pos, float h) {
    vec2 f0 = get_velocity(pos);

    // Start with initial guess
    vec2 x_new = pos + h * f0;

    // Iterative solver
    for (int i = 0; i < 4; i++) {
        // Predictor: standard fixed-point step
        vec2 x_new_pred = pos + h * 0.5 * (f0 + get_velocity(x_new));

        // Corrector: evaluate at midpoint between current and predictor
        vec2 x_new_mid = (x_new + x_new_pred) * 0.5;
        x_new = pos + h * 0.5 * (f0 + get_velocity(x_new_mid));
    }

    return x_new;
}
```

---

### Newton's Method Implicit Midpoint (3D)

```glsl
// (Jacobian matrix computation code generated above)

vec3 integrate(vec3 pos, float h) {
    // Start with initial guess
    vec3 x_new = pos + h * get_velocity(pos + h * 0.5 * get_velocity(pos));

    // Iterative solver
    for (int i = 0; i < 4; i++) {
        vec3 F = x_new - pos - h * get_velocity((pos + x_new) * 0.5);
        mat3 J = mat3(1.0) - (h * 0.5) * computeJacobian((pos + x_new) * 0.5);

        // Newton step: x -= J^(-1) * F
        vec3 delta = inverse3(J) * F;
        x_new -= delta;
    }

    return x_new;
}
```

---

### Midpoint Solver RK4 (2D, partial)

```glsl
vec2 integrate(vec2 pos, float h) {
    // Gauss-Legendre coefficients
    const float a11 = 0.25;
    const float a12 = 0.25 - sqrt(3.0) / 6.0;
    const float a21 = 0.25 + sqrt(3.0) / 6.0;
    const float a22 = 0.25;
    // ... (other coefficients)

    // Initial guess
    vec2 k1 = get_velocity(pos);
    vec2 k2 = get_velocity(pos + h * 0.5 * k1);

    // Iterative solver for coupled stages (Gauss-Seidel style)
    for (int i = 0; i < 5; i++) {
        // Stage 1
        vec2 k1_pred = get_velocity(pos + h * (a11 * k1 + a12 * k2));
        vec2 k1_mid = (k1 + k1_pred) * 0.5;
        k1 = get_velocity(pos + h * (a11 * k1_mid + a12 * k2));

        // Stage 2
        vec2 k2_pred = get_velocity(pos + h * (a21 * k1 + a22 * k2));
        vec2 k2_mid = (k2 + k2_pred) * 0.5;
        k2 = get_velocity(pos + h * (a21 * k1 + a22 * k2_mid));
    }

    return pos + h * (b1 * k1 + b2 * k2);
}
```

---

## Adding New Solvers

To add a new solver method (e.g., Anderson acceleration, GMRES):

1. **Create the solver body generator** in `integrators.js`:
   ```javascript
   function generateNewSolverBody(varName, updateExprFn, dimensions) {
       const vecType = `vec${dimensions}`;
       const updateExpr = updateExprFn(varName);

       return `        // Your solver algorithm here
       ${vecType} temp = ...;
       ${varName} = ...;`;
   }
   ```

2. **Add to each integrator's solver selection**:
   ```javascript
   if (solutionMethod === 'new-solver') {
       solverBody = generateNewSolverBody('x_new', updateExprFn, dimensions);
       solverName = 'New Solver';
   }
   ```

3. **Add UI option** in `index.html`:
   ```html
   <option value="new-solver">New Solver Name</option>
   ```

**That's it!** The solver is now available for all 4 implicit integrators automatically.

---

## Adding New Integrators

To add a new implicit integrator (e.g., BDF2, SDIRK methods):

1. **Define the problem** mathematically. What equation are you solving?
   - Single-stage: `x_new = ...expression involving x_new...`
   - Multi-stage: Multiple coupled equations

2. **Write the integrator function**:
   ```javascript
   export function newImplicitIntegrator(dimensions, iterations, solutionMethod, expressions) {
       const vecType = `vec${dimensions}`;
       const matType = /* mat2, mat3, or mat4 */;

       // Define update function(s)
       const updateExprFn = (v) => `your expression with ${v}`;

       // Choose solver (copy pattern from existing integrators)
       let solverBody;
       /* ... solver selection logic ... */

       // Build final GLSL
       return {
           name: `Your Integrator (${solverName})`,
           code: `
vec${dimensions} integrate(vec${dimensions} pos, float h) {
    vec${dimensions} x_new = ${initialGuess};

    for (int i = 0; i < ${iterations}; i++) {
${solverBody}
    }

    return x_new;
}
`
       };
   }
   ```

3. **Add to `getIntegrator()` switch statement** (bottom of `integrators.js`).

4. **Add UI option** in `index.html`.

**For multi-stage methods**: Call solver generators multiple times and arrange the bodies in nested or sequential loops as needed.

---

## Performance Characteristics

### Solver Comparison

| Solver | Cost/Iteration | Convergence Rate | Best For |
|--------|---------------|------------------|----------|
| **Fixed-Point** | 1 function eval | Linear (slow) | Smooth flows, artistic chaos |
| **Midpoint** | 2 function evals | Superlinear | Balanced performance |
| **Newton** | 1 eval + Jacobian + matrix inverse | Quadratic (fast) | Accuracy, large timesteps |

### Integrator Comparison

| Method | Order | Stability | Solver Iterations Needed |
|--------|-------|-----------|-------------------------|
| **Implicit Euler** | 1st | A-stable | 3-5 (fixed-point), 2-3 (Newton) |
| **Implicit Midpoint** | 2nd | A-stable | 4-6 (fixed-point), 2-4 (Newton) |
| **Trapezoidal** | 2nd | A-stable | 4-6 (fixed-point), 2-4 (Newton) |
| **Implicit RK4** | 4th | A-stable | 5-8 (fixed-point), 3-5 (Newton) |

**Visual Differences**: Fixed-point iteration creates interesting "damped chaos" artifacts due to slow convergence. Newton's method produces sharper, more accurate attractors. Midpoint solver is in between.

---

## References

- **Hairer & Wanner, "Solving Ordinary Differential Equations II: Stiff and Differential-Algebraic Problems"** - Authoritative reference on implicit methods
- **Implicit RK Methods**: Gauss-Legendre coefficients from Butcher tableau
- **Fixed-Point Iteration**: Classic Picard iteration
- **Newton's Method**: Newton-Raphson for systems of equations

---

## Summary

The implicit solver architecture achieves:

✅ **Separation of concerns**: Solvers independent of integrators
✅ **No code duplication**: 3 solver generators × 4 integrators = 12 combinations from ~150 lines of code
✅ **Easy to extend**: Add solver → all integrators get it. Add integrator → all solvers work.
✅ **Composable**: RK4's coupled stages reuse solver bodies seamlessly
✅ **Type-safe**: Function generators prevent string manipulation bugs
✅ **Flexible**: Supports single-stage, multi-stage, and custom integrators

The key innovation is **generating loop bodies** instead of complete loops, allowing each integrator to control loop structure while reusing solver logic.
