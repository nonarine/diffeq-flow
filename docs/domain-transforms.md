# Domain Transforms

Transform the phase space before integration to create spatially-varying effective timestep.

## Use Cases

- Visualize systems that span multiple scales
- Improve stability of stiff systems
- Create artistic flow effects

## How It Works

Applies a coordinate transformation to the phase space before evaluating the vector field and integrating. The Jacobian of the transform is automatically computed and applied to maintain mathematical correctness.

This creates regions where particles move faster or slower, while preserving the convergence properties of the integrator.

## Available Transforms

**Identity:** No transformation (standard integration).

**Logarithmic:** Stretch near zero, compress far from origin.

**Exponential:** Compress near zero, expand far from origin.

**Power:** Configurable power-law transformation.

**Soft-sign:** Bounded compression to [-1, 1], simple formula.

**Tanh:** Bounded compression to [-1, 1] with smooth S-curve.

**Sigmoid:** Logistic sigmoid compression to [-1, 1].

**Rational:** Bounded compression with bell-shaped Jacobian.

**Sine:** Periodic speed bumps (creates interesting flow patterns).

**Radial Power:** Distance-based transformation from origin.

**Custom:** User-defined GLSL transform function.

## Tips

- Logarithmic transform is excellent for visualizing attractors that span many orders of magnitude
- Sine transform creates periodic "speed bumps" that produce interesting visual patterns
- Custom transforms allow complete creative control
