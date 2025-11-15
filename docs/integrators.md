# Integration Methods

Integrators determine how the vector field is numerically solved to update particle positions.

## Explicit Methods

**Euler (1st order):** Simplest method. Fast but less accurate. Good for smooth, non-stiff systems.

**Explicit Midpoint (2nd order):** Better accuracy than Euler with minimal extra cost.

**Heun/Explicit Trapezoidal (2nd order):** Predictor-corrector method with good stability.

**RK4 (4th order):** Highest accuracy for smooth systems. Best for capturing fine details.

## Implicit Methods (A-stable)

**Implicit Euler:** Very stable, excellent for stiff systems. May dampen oscillations.

**Implicit Midpoint:** 2nd order accuracy with excellent stability properties.

**Trapezoidal:** 2nd order, preserves energy in Hamiltonian systems.

**Implicit RK4:** 4th order with excellent stability. Best for complex stiff systems.

## Method Parity

Each explicit method has a corresponding implicit method:

- Euler ↔ Implicit Euler (1st order)
- Explicit Midpoint ↔ Implicit Midpoint (2nd order)
- Heun ↔ Trapezoidal (2nd order)
- RK4 ↔ Implicit RK4 (4th order)

Implicit methods are A-stable and allow larger timesteps for stiff systems.

## Timestep Control

Timesteps are automatically scaled by integrator order for fair comparison (cost factor):

- 1st order methods: timestep × 1
- 2nd order methods: timestep × 2
- 4th order methods: timestep × 4

Fine control buttons: **+/-** = 0.001 increments, **++/--** = 0.01 increments

Click 🎬 to enable animation bounds for timestep interpolation.

## Solver Iterations (Implicit Methods)

Controls convergence accuracy for implicit integrators. Higher iteration count = more accurate but slower.

Newton methods converge faster than fixed-point iteration.

Typical values: 3-5 for fixed-point, 2-3 for Newton methods.

## Solver Methods (Implicit)

**Fixed-Point Iteration:** Simple substitution method. Creates interesting chaotic artifacts.

**Midpoint Solver:** Predictor-corrector approach. Balanced speed and accuracy.

**Newton (Symbolic):** Uses symbolic Jacobian differentiation. Most accurate, fastest convergence.

**Newton (Finite Diff):** Approximates Jacobian numerically. May create unique visual artifacts.

## When to Use What

**Smooth attractors:** Use RK4 for best quality, Explicit Midpoint for speed.

**Stiff systems:** Use implicit methods (Implicit Midpoint or Implicit RK4).

**Chaos generation:** Use large timesteps with Euler for interesting artifacts.
