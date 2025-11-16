# Coordinate Systems

Define custom coordinate systems with transformations between spaces.

## How It Works

**Forward Transform:** Converts from your coordinate system to Cartesian.

**Vector Field:** Defined in your coordinate system (e.g., polar).

**Velocity Transform:** Uses the **inverse Jacobian** to convert velocities from your coordinates back to Cartesian.

**Integration:** Happens in Cartesian space for numerical stability.

The system automatically computes the Jacobian matrix and its inverse to correctly transform your vector field between coordinate systems.

### Mathematical Details

When you define a vector field in polar coordinates like `dr/dt = r*(1-r)`, `dθ/dt = 1`, the system:

1. Transforms particle positions from Cartesian (x, y) to polar (r, θ)
2. Evaluates your velocity expressions to get `(dr/dt, dθ/dt)`
3. Transforms velocities back to Cartesian using the **inverse Jacobian**:
   ```
   [vx]   [[ cos(θ),  -r·sin(θ)]   [dr/dt]
   [vy] = [ sin(θ),   r·cos(θ) ]] · [dθ/dt]
   ```
4. Integrates in Cartesian space using your chosen integrator

This ensures that angular motion `dθ/dt = 1` produces circular orbits, radial motion `dr/dt = constant` moves along rays from the origin, etc.

## Built-in Systems

**Cartesian:** Standard x, y, z coordinates.

**Polar (2D):** r (radius), θ (angle).

**Cylindrical (3D):** r, θ, z.

**Spherical (3D):** r, θ (azimuthal), φ (polar).

## Custom Systems

Define your own transformations. The system automatically computes the Jacobian for correct vector field transformation.

Useful for systems that are naturally expressed in non-Cartesian coordinates (e.g., orbital mechanics in polar coordinates).

## Important Notes

### Coordinate Singularities

Many coordinate systems have singularities where the transformation becomes undefined:

- **Polar/Cylindrical:** Singular at r=0 (the origin)
- **Spherical:** Singular at r=0 and at the poles (θ=0, θ=π)

If particles cluster near these points, you may see:
- Division by zero warnings in console
- Undefined velocities (NaN)
- Visual artifacts

**Workaround:** Avoid placing fixed points exactly at coordinate singularities. For example, in polar coordinates, use `dr/dt = r*(1-r) + 0.01` instead of `dr/dt = r*(1-r)` to prevent particles from getting stuck exactly at r=0.

### Velocity Transform Implementation

The velocity transform uses the **inverse Jacobian** (not the forward Jacobian). This is mathematically required by the chain rule. If you see unexpected particle motion, check that your forward transform expressions are correct—the inverse Jacobian is computed automatically from them.
