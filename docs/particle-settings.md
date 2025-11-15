# Particle Settings

Controls for individual particle appearance and behavior.

## Particle Count

Number of particles in the simulation.

More particles = denser visualization but slower performance.

Typical values:
- 10,000-50,000: Fast, good for exploration
- 100,000-500,000: High quality for attractors
- 1,000,000+: Maximum density for final renders (slower)

## Particle Size

Logarithmic scale: 0.1 - 10.0 (default: 1.0)

Size of rendered particles in pixels.

Larger particles create denser, more overlapped visualizations. Smaller particles reveal finer structure.

**Location:** Rendering Effects panel (click "Rendering Effects" button)

## Particle Render Mode

**Points:** Render each particle as a single point (traditional style).

**Lines:** Render particles as short lines connecting consecutive positions, creating motion trail effects.

Line mode is excellent for visualizing flow direction and velocity field structure.

**Location:** Rendering Effects panel (click "Rendering Effects" button)

## Drop Probability

Probability that a particle gets reinitialized to a random position each frame.

Higher values = more chaotic exploration of phase space, less persistent trails.

Useful for:
- Quickly filling in sparse regions of attractors
- Preventing particles from getting stuck in stable regions
- Creating a "fountain" effect where particles constantly respawn

## Drop Low Velocity Particles

Checkbox option to automatically reinitialize particles moving slower than 2% of maximum speed.

Helps clean up particles that get stuck in stable equilibrium points or near-zero velocity regions.

**When to use:**
- Systems with fixed points where particles accumulate and stop moving
- Attractors with slow-moving stable manifolds that clutter the visualization
- When you want to emphasize fast-moving chaotic regions

**When not to use:**
- Visualizing the full phase space including equilibria
- Studying slow dynamics or stability
- Systems where all velocities are naturally low

## Fade Speed

Controls how quickly trails fade away.

**Logarithmic scale:** Slower fade values preserve trails much longer. The scale is non-linear, so small changes at low values have large effects.

**Zero fade:** Trails never fade (permanent accumulation).

**Fast fade:** Quick refresh, shows current system state only.
