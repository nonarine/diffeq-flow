# Vector Fields

Vector fields define how particles move through space. Enter mathematical expressions for each dimension.

## Expression Syntax

Use standard math operators: `+`, `-`, `*`, `/`, `^`

Available variables: `x`, `y`, `z`, `w`, `u`, `v` (for dimensions 0-5)

Animation variable: `a` (ranges 0.0 to 1.0 during animation playback)

## Built-in Functions

`sin`, `cos`, `tan`, `asin`, `acos`, `atan`

`exp`, `log`, `sqrt`, `abs`, `sign`

`floor`, `ceil`, `fract`, `mod`

`min`, `max`, `clamp`, `mix`

## Examples

**Simple Rotation (2D):**
```
dx/dt = -y
dy/dt = x
```

**Lorenz Attractor (3D):**
```
dx/dt = 10 * (y - x)
dy/dt = x * (28 - z) - y
dz/dt = x * y - 8/3 * z
```
