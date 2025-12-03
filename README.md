# N-Dimensional Vector Field Flow Renderer

A WebGL-based visualization tool for exploring n-dimensional dynamical systems through particle flow rendering. Built with vanilla JavaScript with optional build system, inspired by [fieldplay](https://github.com/anvaka/fieldplay) but extended to support arbitrary dimensions, non-Cartesian coordinate systems, implicit integrators, and HDR rendering with tone mapping.

Written with Claude Code mainly because I wanted to play with strange attractors that appear from integrator instability and explore chaotic systems in non-Cartesian coordinates. This is a toy project, so software provided as is, etc etc

## Features

- **N-Dimensional Vector Fields**: Support for 2D, 3D, 4D, 5D, 6D systems
- **Non-Cartesian Coordinate Systems**: Polar, cylindrical, spherical, and custom coordinate systems
- **Math Expression Parser**: Write vector fields using familiar math syntax (no GLSL required)
- **Explicit & Implicit Integrators**: Euler, RK2, RK4, Implicit Euler, Implicit Midpoint, Trapezoidal, Implicit RK4
  - Multiple solver methods: Fixed-Point, Midpoint, Newton's Method (symbolic & finite difference)
- **Domain Transforms**: Logarithmic, exponential, tanh, and more for spatially-varying timesteps
- **HDR Rendering**: High dynamic range particle rendering with multiple tone mapping operators
  - ACES, Reinhard, Uncharted 2, Luminance Extended, and more
- **Color Modes**: Velocity magnitude, angle, combined, expression-based, custom gradients
- **Flexible 2D Projection**: Select dimensions, linear projection, or custom GLSL mappers
- **GPU-Accelerated**: All particle updates computed on GPU via WebGL (100k+ particles at 60 FPS)
- **Interactive**: Pan, zoom, and adjust parameters in real-time with auto-apply
- **Animation System**: Interpolate parameters over time, export frames to video

## Quick Start

### Static page at https://nonarine.github.io/

### Development (No Build)
1. Clone this repository
2. Serve the files:
   ```bash
   python3 -m http.server 8000
   # or for HTTPS (required for some features):
   python3 https-server.py [port]
   ```
3. Open `http://localhost:8000` in your browser
4. Modify vector field equations in the UI
5. Changes apply automatically after 300ms (auto-apply with debouncing)

### Production Build
1. Install dependencies: `npm install`
2. Build minified bundle: `npm run build`
3. Serve build directory: `npm run serve:build`
4. Open `http://localhost:8000`

The build bundles all JavaScript into a single minified file (`build/app.min.js`) with source maps.

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

**Explicit Methods** (fast, simple):
- **Euler**: Simplest, 1st order accurate
- **Explicit Midpoint (RK2)**: 2nd order accurate
- **Heun (Explicit Trapezoidal)**: 2nd order accurate
- **RK4**: 4th order accurate (default for smooth systems)

**Implicit Methods** (A-stable, excellent for stiff/chaotic systems):
- **Implicit Euler**: 1st order, very stable
- **Implicit Midpoint**: 2nd order, A-stable
- **Trapezoidal**: 2nd order, A-stable
- **Implicit RK4**: 4th order, excellent stability

**Solver Methods** (for implicit integrators):
- **Fixed-Point Iteration**: Simple, creates interesting artifacts
- **Midpoint Solver**: Faster convergence
- **Newton's Method (Symbolic)**: Quadratic convergence via Nerdamer
- **Newton's Method (Finite Diff)**: Numerical Jacobian approximation

All integrators are normalized by cost factor for fair visual comparison.

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

Built-in examples showcase different system types:

- **Simple Rotation (2D)**: Basic circular motion with velocity angle coloring
- **Vortex (2D)**: Spiral attractor with custom bbox
- **Van der Pol Oscillator (2D)**: Classic limit cycle system
- **Fluid Transport with Stirring (2D)**: Chaotic mixing flow
- **Strange Attractor (2D Chaotic)**: Chaotic limit cycle from implicit Euler instability
  - Demonstrates HDR rendering with tone mapping, bilateral filtering, 2x supersampling
  - Uses large timestep (0.472) with fixed-point iteration to create beautiful strange attractor
- **Lorenz Attractor (3D)**: Iconic butterfly-shaped chaotic attractor
- **Rössler Attractor (3D)**: Simpler chaotic system with single loop
- **4D Hypersphere Rotation**: Two-plane rotation in 4D space
- **Double Pendulum (4D Chaotic)**: Chaotic mechanical system with custom projection

Try loading a preset and tweaking parameters to explore variations!

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

### Coordinate Storage

Two strategies for storing particle positions:

- **Float Textures** (default): Direct float storage using `OES_texture_float` extension
  - No encoding overhead, ~23 bits mantissa precision (IEEE 754 single precision)
  - Widely supported on modern devices
- **RGBA Encoding** (fallback): 32-bit fixed-point encoding in RGBA bytes
  - Maximum compatibility without WebGL extensions
  - Small encoding/decoding overhead in shaders
  - Both strategies produce visually identical results

The system automatically uses float textures when available and falls back to RGBA encoding if needed.

### Expression Parsing

User expressions are tokenized, parsed into an AST, and compiled to GLSL code. This allows writing `sin(x) + y*z` instead of GLSL code directly.

## Project Structure

```
index.html                      # Main HTML page with UI
build.js                        # esbuild bundler configuration
src/
  main.js                       # Entry point, initialization
  math/
    parser.js                   # Math expression → GLSL compiler
    integrators.js              # Explicit & implicit integration methods
    mappers.js                  # 2D projection strategies
    colors.js                   # Color mode definitions
    gradients.js                # Gradient generation & GLSL code
    transforms.js               # Domain transforms
    tonemapping.js              # Tone mapping operators
    coordinate-systems.js       # Non-Cartesian coordinate systems
  webgl/
    renderer.js                 # Main WebGL renderer (2300+ lines)
    shaders.js                  # Dynamic shader generation
    textures.js                 # Texture ping-pong manager
    framebuffer.js              # HDR render target management
    coordinate-strategy.js      # Base class for storage strategies
    strategies/
      float-strategy.js         # Float texture storage (default)
      rgba-strategy.js          # RGBA encoding (fallback)
  particles/
    system.js                   # Particle initialization & management
  ui/
    control-base.js             # Base control classes & ControlManager
    controls-v2.js              # Production control system (500 lines)
    custom-controls.js          # Complex control implementations
    parameter-control.js        # Generic parameter controls
    animatable-slider.js        # Animation bounds UI
    gradient-editor.js          # Interactive gradient editor
    coordinate-editor.js        # Coordinate system editor
  utils/
    float-packing.js            # Float ↔ RGBA encoding (legacy)
    debug-logger.js             # Multi-level logging
docs/                           # Feature documentation
animations/                     # Animation export directory
```

## Browser Compatibility

Requires WebGL 1.0 with extensions:
- `OES_texture_float` (recommended, for float textures)
- `WEBGL_color_buffer_float` or `EXT_color_buffer_half_float` (for HDR rendering)

Tested on:
- Chrome 90+ (recommended)
- Firefox 88+

Falls back gracefully when extensions are unavailable.

## Inspiration

This project was inspired by:
- [fieldplay](https://github.com/anvaka/fieldplay) by Andrei Kashcha
- [How I built a wind map with WebGL](https://blog.mapbox.com/how-i-built-a-wind-map-with-webgl-b63022b5537f) by Vladimir Agafonkin

## License

MIT License -
Copyright 2025

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


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

**Getting Started:**
- Start with 2D systems and presets to get familiar with the controls
- Try velocity angle color mode for beautiful flow visualization
- Use RK4 integrator for smooth, accurate systems

**Exploring Strange Attractors:**
- Use implicit Euler with fixed-point iteration and large timesteps (0.3-0.6)
- Set iteration count to 1-3 for interesting chaotic artifacts
- Increase particle count (500k-1M) and fade opacity (0.999+) for dense attractors

**Performance:**
- Reduce particle count or supersampling for better FPS
- Disable bilateral filtering for speed
- Use RK2 instead of RK4 for faster updates

**Visual Quality:**
- Enable 2x supersampling for smooth edges
- Use bilateral filtering to reduce noise in dense regions
- Experiment with tone mapping operators for different aesthetics
- Adjust color saturation and brightness desaturation for highlight control

**Non-Cartesian Coordinates:**
- Try polar coordinates for radial flows
- Use spherical coordinates for 3D rotational systems
- Custom coordinate systems let you explore exotic geometries

## Recent Enhancements

**Major Features (2024-2025):**
- ✅ **Non-Cartesian Coordinate Systems**: Polar, cylindrical, spherical, custom
- ✅ **Implicit Integrators**: Full parity with explicit methods + multiple solver strategies
- ✅ **HDR Rendering Pipeline**: Float framebuffers, tone mapping
- ✅ **Advanced Rendering**: Bilateral filtering, SMAA, supersampling
- ✅ **Animation System**: Parameter interpolation, frame capture, video export
- ✅ **Domain Transforms**: Spatially-varying timesteps for multi-scale systems
- ✅ **Color System**: Velocity-based coloring, custom gradients, expression modes
- ✅ **Build System**: esbuild bundler for production deployment
- ✅ **Control System Refactor**: Composable architecture, automatic save/restore
- ✅ **Custom Presets**: Save/load/export user configurations to JSON

**Architecture Improvements:**
- Strategy pattern for coordinate storage (Float vs RGBA)
- Modular control system with ControlManager
- Data-driven parameter controls
- HDR tone mapping with 7+ operators
- Adaptive velocity tracking for color scaling

**Future Possibilities:**
- Advanced projection methods (PCA, t-SNE)
- Poincaré sections for periodic orbits
- Bifurcation diagrams
- Lyapunov exponent visualization
- Phase portraits with nullclines
- WebGPU backend for better performance

**Documentation:**
- Feature docs: See [docs/](./docs/)
- Animation guide: [animations/README.md](./animations/README.md)
- All documentation: [DOCUMENTATION.md](./DOCUMENTATION.md)

## Credits

Most of the code in this project was written with [Claude Code](https://claude.ai/code), an AI-powered development tool. The ideas, architecture decisions, mathematical insights, and extensive debugging came from the author.

Enjoy exploring the beauty of dynamical systems!
