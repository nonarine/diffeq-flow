# N-Dimensional Vector Field Flow Renderer

A WebGL-based visualization tool for exploring n-dimensional dynamical systems through particle flow rendering. Built with vanilla JavaScript (no build tools required), inspired by [fieldplay](https://github.com/anvaka/fieldplay) but extended to support arbitrary dimensions and pluggable integrators/mappers.

## Features

- **N-Dimensional Vector Fields**: Support for 2D, 3D, 4D, 5D, 6D systems
- **Math Expression Parser**: Write vector fields using familiar math syntax (no GLSL required)
- **Multiple Integrators**: Euler, Runge-Kutta 2, Runge-Kutta 4, with support for custom integrators
- **Flexible 2D Projection**: Multiple methods to visualize high-dimensional systems on 2D screens
- **GPU-Accelerated**: All particle position updates computed on GPU via WebGL
- **Interactive**: Pan, zoom, and adjust parameters in real-time
- **No Build Step**: Just open `index.html` in a modern browser

## Quick Start

1. Clone this repository
2. Open `index.html` in a modern browser (Chrome, Firefox, Edge recommended)
3. Modify the vector field equations in the UI
4. Changes apply automatically after 300ms (auto-apply with debouncing)

That's it! No npm install, no build process.

## Usage

### Defining Vector Fields

Enter math expressions for each dimension of your system. Available variables depend on the number of dimensions:

- 2D: `x`, `y`
- 3D: `x`, `y`, `z`
- 4D: `x`, `y`, `z`, `w`
- 5D: `x`, `y`, `z`, `w`, `u`
- 6D: `x`, `y`, `z`, `w`, `u`, `v`

**Supported Functions:**
- Trigonometric: `sin`, `cos`, `tan`, `asin`, `acos`, `atan`
- Hyperbolic: `sinh`, `cosh`, `tanh`
- Exponential/Logarithmic: `exp`, `log`, `log2`, `sqrt`
- Other: `abs`, `floor`, `ceil`, `fract`, `sign`, `min`, `max`, `pow`, `mod`
- Constants: `pi`, `e`, `PI`, `E`

**Example 2D System** (Simple rotation):
```
dx/dt = -y
dy/dt = x
```

**Example 3D System** (Lorenz attractor):
```
dx/dt = 10*(y - x)
dy/dt = x*(28 - z) - y
dz/dt = x*y - 2.67*z
```

### Integrators

Choose how particle positions are updated:

- **Euler**: Simplest, 1st order accurate
- **RK2 (Midpoint)**: 2nd order accurate
- **RK4**: 4th order accurate (default, good balance)

### 2D Projection Mappers

For dimensions > 2, choose how to project to 2D:

- **Select**: Display two specific dimensions (e.g., show x and z from a 4D system)
- **Linear Projection**: Apply a 2×N projection matrix
- More projection methods available in higher dimensions

### Controls

- **Mouse Drag**: Pan the view
- **Mouse Wheel**: Zoom in/out
- **Touch**: Pan with one finger, pinch to zoom
- **Reset View**: Reset to default bounding box

### Parameters

- **Time Step**: Integration step size (smaller = more accurate but slower)
- **Particle Count**: Number of particles to render
- **Fade Speed**: How quickly trails fade (higher = longer trails)
- **Drop Probability**: How often particles reset to random positions

## Presets

Try built-in examples from the browser console:

```javascript
loadPreset('2d_rotation')       // Simple rotation
loadPreset('2d_vortex')          // Vortex flow
loadPreset('2d_vanderpol')       // Van der Pol oscillator
loadPreset('3d_lorenz')          // Lorenz attractor
loadPreset('3d_rossler')         // Rössler attractor
loadPreset('4d_hypersphere')     // 4D rotation
```

## Technical Architecture

### GPU-Accelerated Computation

Particle positions are stored in textures (one texture per dimension). On each frame:

1. Read current positions from textures
2. Compute velocity from vector field equations
3. Apply numerical integrator to update positions
4. Write new positions to output textures
5. Swap read/write textures (ping-pong)
6. Render particles to screen

This approach allows updating 100,000+ particles at 60 FPS.

### Float Packing

Since WebGL doesn't guarantee floating point texture support, we encode each position value into RGBA bytes (32 bits). This provides high precision across all devices, including mobile.

### Expression Parsing

User expressions are tokenized, parsed into an AST, and compiled to GLSL code. This allows writing `sin(x) + y*z` instead of GLSL code directly.

## Project Structure

```
index.html                 # Main HTML page with UI
src/
  main.js                  # Entry point, initialization, pan/zoom
  math/
    parser.js              # Math expression → GLSL compiler
    integrators.js         # Numerical integration methods
    mappers.js             # 2D projection strategies
  webgl/
    renderer.js            # Main WebGL renderer
    shaders.js             # Shader generation and compilation
    textures.js            # Texture ping-pong manager
  particles/
    system.js              # Particle data management
  ui/
    controls.js            # UI event handlers
  utils/
    float-packing.js       # Float ↔ RGBA encoding
```

## Browser Compatibility

Requires WebGL support. Tested on:
- Chrome 90+
- Firefox 88+
- Edge 90+
- Safari 14+

Mobile browsers also supported.

## Inspiration

This project was inspired by:
- [fieldplay](https://github.com/anvaka/fieldplay) by Andrei Kashcha
- [How I built a wind map with WebGL](https://blog.mapbox.com/how-i-built-a-wind-map-with-webgl-b63022b5537f) by Vladimir Agafonkin

## License

MIT License - feel free to use, modify, and distribute.

## Examples

### 2D Van der Pol Oscillator
```
dx/dt = y
dy/dt = (1 - x*x)*y - x
```

### 3D Lorenz Attractor
```
dx/dt = 10*(y - x)
dy/dt = x*(28 - z) - y
dz/dt = x*y - 2.67*z
```

### 3D Rössler Attractor
```
dx/dt = -y - z
dy/dt = x + 0.2*y
dz/dt = 0.2 + z*(x - 5.7)
```

### 4D Hypersphere Rotation
```
dx/dt = -y
dy/dt = x
dz/dt = -w
dw/dt = z
```

## Tips

- Start with 2D systems to get familiar with the controls
- Use RK4 integrator for most systems
- Adjust time step if particles move too fast or too slow
- Increase fade speed to see longer particle trails
- Try different particle counts to balance quality and performance
- Use console to load presets: `loadPreset('3d_lorenz')`

## Recent Enhancements

**Implemented Features:**
- ✅ Custom integrators via UI (GLSL and custom expressions)
- ✅ Export/import configurations (localStorage persistence, shareable URLs, user presets)
- ✅ Video recording (animation system with frame capture, see `animations/README.md`)
- ✅ Color modes (velocity magnitude, direction, combined, expression-based, gradient editor)
- ✅ Implicit integrators with multiple solver methods (Fixed-Point, Midpoint, Newton's Method)
- ✅ Domain transforms (logarithmic, exponential, tanh, etc.)
- ✅ HDR rendering with tone mapping (ACES, Reinhard, Uncharted 2, etc.)
- ✅ Animation system with parameter interpolation (see `ANIMATION_FORMAT.md`)
- ✅ Custom mathematical functions in GLSL

**Future Possibilities:**
- More projection methods (PCA, t-SNE, UMAP)
- Poincaré sections for periodic orbits
- Bifurcation diagrams
- Real-time Lyapunov exponent visualization
- Phase portraits with nullclines

**Documentation:**
- Animation guide: See [animations/README.md](./animations/README.md)
- All docs: See [DOCUMENTATION.md](./DOCUMENTATION.md)

Enjoy exploring the beauty of dynamical systems!
