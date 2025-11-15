# Coordinate Systems

Define custom coordinate systems with transformations between spaces.

## How It Works

**Forward Transform:** Converts from your coordinate system to Cartesian.

**Vector Field:** Defined in your coordinate system (e.g., polar).

**Integration:** Happens in Cartesian space for numerical stability.

The system automatically computes the Jacobian matrix to correctly transform your vector field between coordinate systems.

## Built-in Systems

**Cartesian:** Standard x, y, z coordinates.

**Polar (2D):** r (radius), θ (angle).

**Cylindrical (3D):** r, θ, z.

**Spherical (3D):** r, θ (azimuthal), φ (polar).

## Custom Systems

Define your own transformations. The system automatically computes the Jacobian for correct vector field transformation.

Useful for systems that are naturally expressed in non-Cartesian coordinates (e.g., orbital mechanics in polar coordinates).
