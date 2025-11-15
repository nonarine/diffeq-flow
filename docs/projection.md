# 2D Projection

Projects N-dimensional systems to 2D for visualization.

## Select Mode

Choose which two dimensions to display (e.g., X and Z from a 4D system).

Simple and intuitive for exploring different 2D slices of high-dimensional phase space.

## Project Mode

Linear projection using a 2×N matrix. Useful for custom views of high-dimensional systems.

Allows you to define weighted combinations of dimensions. For example, project a 4D system using:
- Horizontal = 0.7×X + 0.3×Z
- Vertical = 0.5×Y + 0.5×W

## Custom Mode

Write GLSL code to define any projection function. Has access to all position variables.

Maximum flexibility for non-linear projections or artistic effects.
