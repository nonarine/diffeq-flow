# Color Modes

Color modes determine how particles are rendered.

## Available Modes

**Solid White:** Classic monochrome look.

**Velocity Magnitude:** Color based on particle speed. Uses gradient mapping.

**Velocity Angle:** Color based on velocity direction in 2D projection.

**Velocity Combined:** Hue from angle, saturation from magnitude.

**Expression:** Custom GLSL expression with gradient mapping.

## Velocity Scaling

Controls what velocity maps to full color saturation. Two modes available:

**Percentile Mode:** Ignores outliers for better color distribution. Maps colors based on the statistical distribution of velocities across all particles.

**Maximum Mode:** Uses the absolute maximum velocity value. More sensitive to outliers, but provides absolute scaling.

## Logarithmic Velocity Scale

Maps velocity using log scale for better visualization when velocity range is very large.

Useful for systems with velocities spanning multiple orders of magnitude (e.g., 0.001 to 100.0).

## Expression Mode

Write custom GLSL expressions that evaluate to [0, 1] range.

**Available variables:**
- Position: `x`, `y`, `z`, `w` (for dimensions 0-3)
- Velocity: `dx`, `dy`, `dz`, `dw` (derivatives)

**Examples:**
```
sin(x*y)
length(pos)
dx*dy
```

## Custom Gradients

Click the gradient preview to open the editor. Add, remove, and reorder color stops.

Enable "Apply to preset color modes" to use your gradient with velocity modes.
