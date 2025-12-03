# Shader Architecture Documentation

## Table of Contents

1. [Overview](#overview)
2. [Pipeline Architecture](#pipeline-architecture)
3. [Data Flow & Texture Ping-Pong](#data-flow--texture-ping-pong)
4. [Dynamic Shader Generation](#dynamic-shader-generation)
5. [Coordinate Storage Strategies](#coordinate-storage-strategies)
6. [Projection System](#projection-system)
7. [Color System Architecture](#color-system-architecture)
8. [Texture Management](#texture-management)
9. [HDR Rendering Pipeline](#hdr-rendering-pipeline)
10. [Performance Optimizations](#performance-optimizations)
11. [Code Reference](#code-reference)

---

## Overview

The n-dimensional vector field flow renderer uses a sophisticated WebGL shader pipeline that performs **all particle computation on the GPU**. This architecture achieves extreme flexibility (arbitrary dimensions, integrators, projections, color modes) while maintaining high performance through pure GPU compute with minimal CPU↔GPU data transfer.

### Core Design Philosophy

**GPU-Centric Computation**: Particle positions are stored in textures and updated entirely on the GPU via framebuffer rendering. The CPU never touches individual particle data after initialization.

**Dynamic Code Generation**: Shaders are compiled at runtime from user expressions, allowing arbitrary mathematical systems without hardcoded limits.

**Strategy Pattern**: Coordinate storage methods are abstracted, allowing float textures (preferred) or RGBA byte encoding (legacy) without duplicating shader logic.

**Dual Projection**: Both positions AND velocities are projected from N-D to 2D, ensuring color modes correctly reflect visual flow direction.

### Key Statistics

- **6 shader programs**: Update (1 pair), Draw (1 pair), Fade (1 pair), Tonemap
- **N texture pairs** for N-dimensional systems (e.g., 8 textures for 4D)
- **Pure GPU pipeline**: Zero CPU particle updates after initialization
- **HDR rendering**: Unbounded color accumulation with tone mapping

---

## Pipeline Architecture

The rendering system uses six distinct shader programs organized into three functional categories:

### 1. Position Update Pipeline

**Purpose**: Numerically integrate the vector field to compute new particle positions.

**Shaders**:
- `updateVertexShader` - Passthrough quad vertex shader
- `updateFragmentShader` - Integration computation

**Files**: `src/webgl/shaders.js:66-318`

The update shader is the computational heart of the system. It:
1. Reads current position from N textures
2. Evaluates the velocity field at that position
3. Applies numerical integration (Euler, RK4, etc.)
4. Writes new position to output texture
5. Handles particle respawning (bounds checking, low-velocity culling)

**Critical Detail**: Runs **N times per frame** (once per dimension), with the `u_out_coordinate` uniform selecting which dimension to output.

### 2. Particle Rendering Pipeline

**Purpose**: Draw particles as colored points or lines on screen.

**Shaders**:
- `drawVertexShader` - Position/velocity projection and screen mapping
- `drawFragmentShader` - Color computation

**Files**: `src/webgl/shaders.js:323-472` (vertex), `src/webgl/shaders.js:494-543` (fragment)

The draw shader:
1. Reads N position textures
2. Computes full N-dimensional velocity
3. Projects position to 2D/3D screen space
4. Projects velocity to 2D (for angle-based colors)
5. Passes both velocities to fragment shader
6. Fragment shader computes color based on position/velocity

### 3. Screen Composition Pipeline

**Purpose**: Create motion trails, tone map HDR to LDR

**Shaders**:
- `fadeShader` - Motion trail effect (multiply previous frame)
- `tonemapShader` - HDR→LDR conversion with artistic controls

**Files**: `src/webgl/shaders.js:545-705`

These shaders operate on full-screen quads, processing the accumulated particle render.

### Shader Program Summary

```
┌─────────────────────────────────────────────────────────┐
│                    FRAME N PIPELINE                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. UPDATE SHADERS (run N times)                        │
│     ├─ Read: u_pos_0, u_pos_1, ..., u_pos_N-1          │
│     ├─ Compute: new_pos = integrate(pos, velocity, dt)  │
│     └─ Write: dimension selected by u_out_coordinate    │
│                                                          │
│  2. SWAP read↔write textures                            │
│                                                          │
│  3. FADE SHADER (optional motion trails)                │
│     ├─ Read: previous HDR buffer                        │
│     └─ Write: buffer * fadeOpacity                      │
│                                                          │
│  4. DRAW SHADERS                                         │
│     ├─ Read: u_pos_0, u_pos_1, ..., u_pos_N-1          │
│     ├─ Vertex: Project N-D → 2D, compute velocities    │
│     ├─ Fragment: Compute color from position/velocity   │
│     └─ Write: HDR buffer (additive blending)            │
│                                                          │
│  5. TONEMAP SHADER                                       │
│     ├─ Read: HDR buffer                                 │
│     ├─ Apply: tone mapping operator + gamma             │
│     └─ Write: LDR buffer → canvas                       │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Data Flow & Texture Ping-Pong

### Texture Ping-Pong Architecture

Particle positions are stored in **texture pairs** that swap roles each frame:

```
Frame N:
  ┌──────────┐                                    ┌──────────┐
  │ Read     │  →  Update Shader  →  Render  →   │ Write    │
  │ Textures │     (Integration)                  │ Textures │
  └──────────┘                                    └──────────┘
       ↓                                                ↓
       └─────────────────── SWAP ←──────────────────────┘

Frame N+1:
  ┌──────────┐                                    ┌──────────┐
  │ Read     │  ←  (now contain new positions)    │ Write    │
  │ Textures │                                    │ Textures │
  └──────────┘                                    └──────────┘
```

**Implementation** (`src/webgl/textures.js:150-170`):

```javascript
swap() {
    if (this.lineMode) {
        // Triple buffer rotation for line mode
        const temp = this.prevTextures;
        this.prevTextures = this.readTextures;
        this.readTextures = this.writeTextures;
        this.writeTextures = temp;
    } else {
        // Standard dual buffer swap
        const temp = this.readTextures;
        this.readTextures = this.writeTextures;
        this.writeTextures = temp;
    }
}
```

### Multi-Dimensional Texture Layout

For an N-dimensional system, we create **N separate texture pairs**:

```
3D System Example (10,000 particles):

  Read Textures:          Write Textures:
  ┌──────────────┐       ┌──────────────┐
  │ u_pos_0      │       │ writeTarget0 │  ← Dimension 0 (x)
  │ (100×100 px) │       │ (100×100 px) │
  └──────────────┘       └──────────────┘

  ┌──────────────┐       ┌──────────────┐
  │ u_pos_1      │       │ writeTarget1 │  ← Dimension 1 (y)
  │ (100×100 px) │       │ (100×100 px) │
  └──────────────┘       └──────────────┘

  ┌──────────────┐       ┌──────────────┐
  │ u_pos_2      │       │ writeTarget2 │  ← Dimension 2 (z)
  │ (100×100 px) │       │ (100×100 px) │
  └──────────────┘       └──────────────┘
```

**Why Separate Textures?**
1. **Maximum Precision**: Each dimension gets full texture precision (no packing losses)
2. **Simpler Encoding**: FloatStrategy stores value directly in red channel
3. **Flexible Ranges**: Each dimension can have independent normalization ranges

### Age Tracking

Particle age (for fade-in effect) is stored in the **alpha channel of dimension 0**:

```glsl
// Update shader output (dimension 0)
gl_FragColor = encodeFloat(normalized_x);
gl_FragColor.a = new_age; // 0.0 = newborn, 1.0 = mature

// Draw vertex shader
float age = texture2D(u_pos_0, texcoord).a;
if (age < 1.0) {
    gl_Position = vec4(10.0, 10.0, 10.0, 1.0); // Off-screen
}
```

This eliminates the need for a separate age texture.

### Line Mode (Triple Buffering)

For rendering particles as lines (motion blur effect), a third set of textures stores previous positions:

```
Line Mode Rotation:
  ┌──────┐     ┌──────┐     ┌──────┐
  │ Prev │ ←── │ Read │ ←── │Write │
  └──────┘     └──────┘     └──────┘
      ↓                          ↑
      └──────────────────────────┘
           (circular rotation)
```

Draw shader samples both current and previous positions to create line segments:

```glsl
// Vertex shader (line mode)
if (is_current) {
    pos = texture2D(u_pos_0, texcoord);  // Current position
} else {
    pos = texture2D(u_prev_pos_0, texcoord);  // Previous position
}
```

**Vertex Layout**: Index buffer contains `[0,0, 1,1, 2,2, ...]`, vertex ID buffer contains `[0,1, 0,1, 0,1, ...]`, rendering as `GL_LINES`.

---

## Dynamic Shader Generation

All GLSL shader code is **generated at runtime** based on user configuration. This is the core abstraction enabling arbitrary mathematical systems without hardcoded limits.

### Code Generation Pipeline

**Location**: `src/webgl/renderer.js:450-550`

```javascript
compileShaders() {
    // 1. Parse user expressions to GLSL
    const velocityGLSL = parseVectorField(this.expressions, this.dimensions);

    // 2. Get integrator GLSL code
    const integrator = getIntegrator(this.integrator, this.dimensions, this.integratorParams);

    // 3. Get mapper projection code
    const mapper = getMapper(this.mapperType, this.dimensions, this.mapperParams);

    // 4. Get transform code (optional)
    const transform = this.transform !== 'identity' ?
        getTransform(this.transform, this.transformParams) : null;

    // 5. Get color mode code
    const colorMode = getColorMode(this.colorMode, this.dimensions);

    // 6. Generate complete shaders
    const updateFragShader = generateUpdateFragmentShader(
        this.dimensions,
        velocityGLSL,
        integrator.code,
        this.strategy,
        transform
    );

    const drawVertShader = generateDrawVertexShader(
        this.dimensions,
        mapper.code,
        velocityGLSL,
        this.strategy
    );

    const drawFragShader = generateDrawFragmentShader(
        this.dimensions,
        colorMode.code,
        colorMode.usesMaxVelocity
    );
}
```

### Update Shader Code Injection

The update fragment shader assembles GLSL from multiple sources:

**Template Structure** (`src/webgl/shaders.js:86-318`):

```glsl
precision highp float;

// 1. STRATEGY-SPECIFIC FUNCTIONS (injected)
${strategy.getGLSLConstants()}
${strategy.getGLSLDecodeFunction()}
${strategy.getGLSLEncodeFunction()}

// 2. MATH FUNCTION LIBRARY (injected)
${getGLSLFunctionDeclarations()}

// 3. UNIFORMS
uniform sampler2D u_pos_0;
uniform sampler2D u_pos_1;
// ... (N textures)
uniform float u_h;           // Timestep
uniform int u_out_coordinate; // Which dimension to output
uniform vec2 u_min;          // Viewport bounds
uniform vec2 u_max;

varying vec2 v_texcoord;

// 4. VELOCITY FIELD (user expressions → GLSL)
vec3 get_velocity(vec3 pos) {
    vec3 result;
    float x = pos.x;
    float y = pos.y;
    float z = pos.z;

    result.x = ${expressionGLSL[0]};  // e.g., "10.0 * (y - x)"
    result.y = ${expressionGLSL[1]};  // e.g., "x * (28.0 - z) - y"
    result.z = ${expressionGLSL[2]};  // e.g., "x * y - 2.666 * z"

    return result;
}

// 5. INTEGRATION METHOD (Euler, RK4, etc.)
${integratorCode}
// e.g., for RK4:
// vec3 integrate(vec3 pos, float h) {
//     vec3 k1 = get_velocity(pos);
//     vec3 k2 = get_velocity(pos + k1 * h * 0.5);
//     vec3 k3 = get_velocity(pos + k2 * h * 0.5);
//     vec3 k4 = get_velocity(pos + k3 * h);
//     return pos + (k1 + 2.0*k2 + 2.0*k3 + k4) * h / 6.0;
// }

// 6. TRANSFORM (optional)
${transformCode?.forward}
${transformCode?.inverse}
${transformCode?.jacobian}

// 7. MAIN INTEGRATION LOOP
void main() {
    vec2 texcoord = v_texcoord;

    // Read current position from N textures
    vec3 pos;
    pos.x = denormalize(decodeFloat(texture2D(u_pos_0, texcoord)), u_min.x, u_max.x);
    pos.y = denormalize(decodeFloat(texture2D(u_pos_1, texcoord)), u_min.y, u_max.y);
    pos.z = denormalize(decodeFloat(texture2D(u_pos_2, texcoord)), -10.0, 10.0);

    // Apply transform (if enabled)
    vec3 new_pos;
    if (${hasTransform}) {
        vec3 transformed = transform_forward(pos);
        vec3 new_transformed = integrate(transformed, u_h);
        new_pos = transform_inverse(new_transformed);
    } else {
        new_pos = integrate(pos, u_h);
    }

    // Particle respawning logic
    vec3 velocity = get_velocity(new_pos);
    bool outside = /* bounds check */;
    bool too_slow = /* velocity threshold check */;
    bool random_drop = /* probability check */;

    if (outside || too_slow || random_drop) {
        new_pos = /* random position */;
        new_age = 0.0;
    } else {
        new_age = min(current_age + 0.5, 1.0);
    }

    // Output selected dimension
    if (u_out_coordinate == 0) {
        gl_FragColor = encodeFloat(normalize(new_pos.x, u_min.x, u_max.x));
        gl_FragColor.a = new_age;  // Age stored in alpha of dimension 0
    } else if (u_out_coordinate == 1) {
        gl_FragColor = encodeFloat(normalize(new_pos.y, u_min.y, u_max.y));
    } else if (u_out_coordinate == 2) {
        gl_FragColor = encodeFloat(normalize(new_pos.z, -10.0, 10.0));
    }
}
```

**Key Observation**: The update shader runs **N times** per frame with different `u_out_coordinate` values, writing each dimension to a separate framebuffer target.

### Expression Parser

**Location**: `src/math/parser.js`

User expressions like `"sin(x) + y*z"` are parsed to GLSL:

```javascript
parseExpression("sin(x) + y*z", dimensions=3)

// Tokenize → Parse to AST → Compile to GLSL
// Result: "sin(pos.x) + pos.y * pos.z"
```

**Supported Operations**:
- Math functions: `sin, cos, tan, exp, log, sqrt, abs, pow, min, max, atan, atan2`
- Variables: `x, y, z, w, u, v` (mapped to dimension indices)
- Operators: `+, -, *, /, ^` (exponentiation)
- Animation variable: `a` (0.0 to 1.0 during animation)

### Integrator Code Generation

**Location**: `src/math/integrators.js`

Each integrator returns an object with GLSL code:

```javascript
getIntegrator('rk4', dimensions=3, params={})

// Returns:
{
    name: 'RK4 (4th order)',
    costFactor: 4,  // For fair timestep comparison
    code: `
        vec3 integrate(vec3 pos, float h) {
            vec3 k1 = get_velocity(pos);
            vec3 k2 = get_velocity(pos + k1 * h * 0.5);
            vec3 k3 = get_velocity(pos + k2 * h * 0.5);
            vec3 k4 = get_velocity(pos + k3 * h);
            return pos + (k1 + 2.0*k2 + 2.0*k3 + k4) * h / 6.0;
        }
    `
}
```

**Implicit Methods** use iterative solvers:

```glsl
// Implicit Euler with fixed-point iteration
vec3 integrate(vec3 pos, float h) {
    vec3 next = pos;  // Initial guess
    for (int i = 0; i < ${iterations}; i++) {
        next = pos + h * get_velocity(next);
    }
    return next;
}
```

**Newton's Method** requires symbolic Jacobian computation via Nerdamer library (`src/math/jacobian.js`).

### Draw Shader Code Injection

**Vertex Shader** (`src/webgl/shaders.js:323-472`):

```glsl
precision highp float;

// Strategy functions
${strategy.getGLSLDecodeFunction()}
${strategy.getGLSLDenormalizeFunction()}

// Math library
${getGLSLFunctionDeclarations()}

// Attributes
attribute float a_index;

// Uniforms
uniform sampler2D u_pos_0;
uniform sampler2D u_pos_1;
uniform sampler2D u_pos_2;
uniform float u_particles_res;
uniform vec2 u_min;
uniform vec2 u_max;

// Varyings
varying vec3 v_pos;                  // Full N-D position
varying vec3 v_velocity;             // Full N-D velocity
varying vec3 v_velocity_projected;   // Projected 2D velocity

// Mapper code (injected)
${mapperCode}
// e.g., for select mapper:
// vec2 project_to_2d(vec3 pos) {
//     return vec2(pos[0], pos[2]);  // Display x and z
// }
// vec3 project_to_3d(vec3 pos) {
//     return vec3(pos[0], pos[2], pos[1]);  // x, z, y for depth
// }

// Velocity field (same as update shader)
vec3 get_velocity(vec3 pos) {
    /* ... user expressions ... */
}

void main() {
    // Calculate texture coordinate from particle index
    vec2 texcoord = vec2(
        (mod(a_index, u_particles_res) + 0.5) / u_particles_res,
        (floor(a_index / u_particles_res) + 0.5) / u_particles_res
    );

    // Read age
    float age = texture2D(u_pos_0, texcoord).a;

    // Read and decode position
    vec3 pos;
    pos.x = denormalize(decodeFloat(texture2D(u_pos_0, texcoord)), u_min.x, u_max.x);
    pos.y = denormalize(decodeFloat(texture2D(u_pos_1, texcoord)), u_min.y, u_max.y);
    pos.z = denormalize(decodeFloat(texture2D(u_pos_2, texcoord)), -10.0, 10.0);

    // Compute velocity
    vec3 velocity = get_velocity(pos);

    // Pass full N-D data to fragment shader
    v_pos = pos;
    v_velocity = velocity;

    // Skip newborn particles
    if (age < 1.0) {
        gl_Position = vec4(10.0, 10.0, 10.0, 1.0);
        gl_PointSize = 0.0;
        v_velocity_projected = velocity;  // Won't be used
    } else {
        // Project position to screen
        vec3 pos_3d = project_to_3d(pos);

        // Project velocity to 2D (important for angle-based colors!)
        vec2 velocity_2d = project_to_2d(velocity);

        // Pad to match varying dimensions
        vec3 velocity_projected;
        velocity_projected.x = velocity_2d.x;
        velocity_projected.y = velocity_2d.y;
        velocity_projected.z = 0.0;

        v_velocity_projected = velocity_projected;

        // Map to clip space
        vec2 normalized = (pos_3d.xy - u_min) / (u_max - u_min);
        gl_Position = vec4(normalized * 2.0 - 1.0, depth, 1.0);
        gl_PointSize = u_particle_size;
    }
}
```

**Fragment Shader** (`src/webgl/shaders.js:494-543`):

```glsl
precision highp float;

varying vec3 v_pos;
varying vec3 v_velocity;
varying vec3 v_velocity_projected;

uniform float u_max_velocity;      // (if color mode uses it)
uniform float u_particle_intensity;
uniform float u_color_saturation;

// Color function (injected based on mode)
${colorCode}
// e.g., for velocity angle:
// vec3 getColor(vec3 pos, vec3 velocity, vec3 velocity_proj) {
//     float angle = atan(velocity_proj.y, velocity_proj.x);
//     float hue = (angle + PI) / (2.0 * PI);
//     return hsv_to_rgb(hue, 1.0, 1.0);
// }

void main() {
    // Compute color
    vec3 color = getColor(v_pos, v_velocity, v_velocity_projected);

    // Apply saturation adjustment
    if (u_color_saturation < 1.0) {
        float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
        color = mix(vec3(luminance), color, u_color_saturation);
    }

    // Apply intensity multiplier (for HDR)
    color *= u_particle_intensity;

    // Circular point shape with soft edges
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    float alpha = smoothstep(0.5, 0.3, dist) * u_alpha;

    gl_FragColor = vec4(color, alpha);
}
```

---

## Coordinate Storage Strategies

The Strategy Pattern allows different coordinate encoding methods without duplicating shader code.

### Strategy Interface

**Base Class** (`src/webgl/coordinate-strategy.js:7-48`):

```javascript
class CoordinateStrategy {
    // Texture format configuration
    getTextureFormat() {
        return {
            internalFormat: gl.RGBA,
            format: gl.RGBA,
            type: gl.UNSIGNED_BYTE  // or gl.FLOAT
        };
    }

    // JavaScript encoding/decoding
    encodeValue(worldCoord, min, max) { /* ... */ }
    decodeValue(bufferValue, min, max) { /* ... */ }

    // GLSL code injection
    getGLSLConstants() { return ''; }
    getGLSLEncodeFunction() { return '/* GLSL */'; }
    getGLSLDecodeFunction() { return '/* GLSL */'; }
    getGLSLNormalizeFunction() { return '/* GLSL */'; }
    getGLSLDenormalizeFunction() { return '/* GLSL */'; }
}
```

### FloatStrategy (Recommended)

**Location**: `src/webgl/strategies/float-strategy.js`

**Storage**: Direct float value in red channel, other channels unused.

**Requirements**: WebGL extension `OES_texture_float` and `WEBGL_color_buffer_float`

**GLSL Encoding**:
```glsl
vec4 encodeFloat(float value) {
    return vec4(value, 0.0, 0.0, 1.0);
}
```

**GLSL Decoding**:
```glsl
float decodeFloat(vec4 rgba) {
    return rgba.r;
}
```

**Precision**: 23-bit mantissa (IEEE 754 single precision) = ~7 decimal digits

**Advantages**:
- Zero encoding overhead
- Maximum precision
- Perfect for circular orbits and stable attractors
- Simpler shader code

**Disadvantages**:
- Requires WebGL extensions (not available on very old devices)
- 4× memory usage vs RGBA bytes

### RGBAStrategy

**Location**: `src/webgl/strategies/rgba-strategy.js`

**Storage**: 32-bit fixed-point value packed across RGBA bytes.

**GLSL Encoding**:
```glsl
vec4 encodeFloat(float value) {
    // Normalize to [0, 1]
    float normalized = value;

    // Pack into 32-bit integer across 4 bytes
    float intValue = normalized * 4294967295.0;
    vec4 bytes = vec4(0.0);
    bytes.a = floor(intValue / 16777216.0);
    bytes.b = floor((intValue - bytes.a * 16777216.0) / 65536.0);
    bytes.g = floor((intValue - bytes.a * 16777216.0 - bytes.b * 65536.0) / 256.0);
    bytes.r = mod(intValue, 256.0);

    return bytes / 255.0;
}
```

**GLSL Decoding**:
```glsl
float decodeFloat(vec4 rgba) {
    vec4 bytes = rgba * 255.0;
    float intValue = bytes.a * 16777216.0 +
                     bytes.b * 65536.0 +
                     bytes.g * 256.0 +
                     bytes.r;
    return intValue / 4294967295.0;
}
```

**Precision**: Approximately 32 bits of fixed-point precision per coordinate

**Characteristics**:
- Small encoding/decoding overhead in shaders
- Maximum compatibility (no WebGL extension required)
- Very minor quantization artifacts may appear in extreme zoom scenarios
- Produces visually identical results to FloatStrategy for typical use cases

**Use Cases**: Maximum device compatibility; recommended when float texture support is unavailable.

### Strategy Selection

**In Renderer** (`src/webgl/renderer.js:160-170`):

```javascript
constructor(canvas, options = {}) {
    // Check for float texture support
    const floatExt = gl.getExtension('OES_texture_float');
    const floatLinearExt = gl.getExtension('OES_texture_float_linear');

    if (floatExt && floatLinearExt) {
        this.strategy = new FloatStrategy();
        logger.info('Using FloatStrategy (recommended)');
    } else {
        this.strategy = new RGBAStrategy();
        logger.warn('Float textures not supported, using RGBAStrategy (lower precision)');
    }
}
```

User can override via URL parameter: `?storage=rgba` or `?storage=float`

---

## Projection System

The system projects **both positions AND velocities** from N-D to 2D. This dual projection is critical for correct color visualization.

### Why Project Velocities?

**Problem**: For N-dimensional systems (N > 2), velocity has N components. Color modes like "velocity angle" need a 2D velocity direction to compute hue.

**Naive Approach** (INCORRECT):
```glsl
// Always use x,y components regardless of projection
float angle = atan(velocity.y, velocity.x);
```

This breaks when the user views dimensions 0 and 2 (x and z). The color would still show x-y angle, not x-z angle!

**Correct Approach**:
```glsl
// Project velocity using the same mapper as position
vec2 velocity_2d = project_to_2d(velocity);
float angle = atan(velocity_2d.y, velocity_2d.x);
```

Now the color correctly reflects the **visual flow direction** in the projected 2D plane.

### Mathematical Justification

Velocity is a **tangent vector** in the phase space. When we project position using function `f: ℝⁿ → ℝ²`, the corresponding velocity projection is the differential `Df(v)`.

For **linear projections** (matrix multiplication), this is exact:
```
x_2d = M * x_nd    (2×N matrix)
v_2d = M * v_nd    (same matrix!)
```

For **non-linear projections** (spherical, stereographic), this is an approximation using the Jacobian.

### Implementation

**Vertex Shader** (`src/webgl/shaders.js:460-474`):

```glsl
// Compute full N-D velocity
vec3 velocity = get_velocity(pos);

// Pass full velocity for expression mode
v_velocity = velocity;

// Project position to screen
vec3 pos_3d = project_to_3d(pos);

// Project velocity to 2D (same mapper)
vec2 velocity_2d = project_to_2d(velocity);

// Pad to match varying dimensions
vec3 velocity_projected;
velocity_projected.x = velocity_2d.x;
velocity_projected.y = velocity_2d.y;
velocity_projected.z = 0.0;

// Pass projected velocity for angle-based colors
v_velocity_projected = velocity_projected;
```

### Mapper Types

All mappers provide two functions:
- `vec2 project_to_2d(vecN pos)` - 2D projection
- `vec3 project_to_3d(vecN pos)` - 3D projection with depth

#### Select Mapper

**Location**: `src/math/mappers.js:14-37`

Picks two dimensions to display:

```glsl
// Select dimensions 0 and 2 for display
vec2 project_to_2d(vec3 pos) {
    return vec2(pos[0], pos[2]);  // x and z
}

vec3 project_to_3d(vec3 pos) {
    return vec3(pos[0], pos[2], pos[1]);  // x, z, (y as depth)
}
```

**Use Case**: Viewing specific dimensions of a high-D system.

#### Linear Projection Mapper

**Location**: `src/math/mappers.js:44-71`

Applies a 2×N or 3×N projection matrix:

```glsl
// Example: Project 3D to 2D using PCA matrix
vec2 project_to_2d(vec3 pos) {
    return vec2(
        0.707107 * pos[0] + 0.707107 * pos[1] + 0.000000 * pos[2],
        -0.408248 * pos[0] + 0.408248 * pos[1] + 0.816497 * pos[2]
    );
}
```

**Use Case**: PCA visualization, custom orthogonal projections.

#### Spherical Projection

**Location**: `src/math/mappers.js:104-131`

Projects 3D position to (θ, φ) angles:

```glsl
vec2 project_to_2d(vec3 pos) {
    float r = length(pos);
    if (r < 0.001) return vec2(0.0, 0.0);

    float theta = atan(pos.y, pos.x);          // Azimuth
    float phi = acos(pos.z / r);                // Polar angle

    return vec2(theta, phi);
}
```

**Use Case**: Visualizing attractors on sphere surface.

**Note**: Non-linear projections don't correctly transform velocity vectors (Jacobian required).

---

## Color System Architecture

The color system uses a **three-velocity architecture** to support different use cases.

### Three Velocity Vectors

**Fragment Shader Varyings**:

```glsl
varying vec3 v_pos;                  // Full N-D position
varying vec3 v_velocity;             // Full N-D velocity
varying vec3 v_velocity_projected;   // Projected 2D velocity
```

**Design Rationale**:

1. **v_pos**: Position in phase space (for expression-based colors)
2. **v_velocity**: True N-D velocity magnitude and derivative variables (dx, dy, dz, ...)
3. **v_velocity_projected**: Velocity direction in the visible 2D plane

### Color Mode Signature

All color modes have this signature:

```glsl
vec3 getColor(vecN pos, vecN velocity, vecN velocity_proj)
```

**Example Usage**:

```glsl
// Magnitude mode: Uses full N-D velocity for speed
vec3 getColor(vec3 pos, vec3 velocity, vec3 velocity_proj) {
    float speed = length(velocity);  // N-D magnitude
    float t = speed / u_max_velocity;
    return gradient(t);
}

// Angle mode: Uses projected 2D velocity for direction
vec3 getColor(vec3 pos, vec3 velocity, vec3 velocity_proj) {
    float angle = atan(velocity_proj.y, velocity_proj.x);  // 2D angle
    float hue = (angle + PI) / (2.0 * PI);
    return hsv_to_rgb(hue, 1.0, 1.0);
}

// Expression mode: Uses full velocity for derivative variables
vec3 getColor(vec3 pos, vec3 velocity, vec3 velocity_proj) {
    float x = pos.x, y = pos.y, z = pos.z;
    float dx = velocity.x, dy = velocity.y, dz = velocity.z;
    float value = sin(dx * dy);  // User expression with derivatives
    return gradient(value);
}
```

### Preset Color Modes

**Location**: `src/math/colors.js:8-113`

#### White

Simple solid color:
```glsl
vec3 getColor(vec3 pos, vec3 velocity, vec3 velocity_proj) {
    return vec3(1.0, 1.0, 1.0);
}
```

#### Velocity Magnitude

Hardcoded gradient mapped to speed:
```glsl
vec3 getColor(vec3 pos, vec3 velocity, vec3 velocity_proj) {
    float speed = length(velocity);  // Full N-D magnitude!
    float t = clamp(speed / u_max_velocity, 0.0, 1.0);

    // Hardcoded gradient: blue → cyan → green → yellow → red
    if (t < 0.25) {
        return mix(vec3(0,0,1), vec3(0,1,1), t * 4.0);
    } else if (t < 0.5) {
        return mix(vec3(0,1,1), vec3(0,1,0), (t - 0.25) * 4.0);
    } else if (t < 0.75) {
        return mix(vec3(0,1,0), vec3(1,1,0), (t - 0.5) * 4.0);
    } else {
        return mix(vec3(1,1,0), vec3(1,0,0), (t - 0.75) * 4.0);
    }
}
```

#### Velocity Angle

HSV color wheel based on projected direction:
```glsl
vec3 getColor(vec3 pos, vec3 velocity, vec3 velocity_proj) {
    // Use PROJECTED velocity for angle!
    float angle = atan(velocity_proj.y, velocity_proj.x);
    float hue = (angle + 3.14159265) / (2.0 * 3.14159265);

    // HSV to RGB conversion (S=1, V=1)
    float h = hue * 6.0;
    float x = 1.0 - abs(mod(h, 2.0) - 1.0);

    vec3 color;
    if (h < 1.0) color = vec3(1.0, x, 0.0);       // Red → Yellow
    else if (h < 2.0) color = vec3(x, 1.0, 0.0);   // Yellow → Green
    else if (h < 3.0) color = vec3(0.0, 1.0, x);   // Green → Cyan
    else if (h < 4.0) color = vec3(0.0, x, 1.0);   // Cyan → Blue
    else if (h < 5.0) color = vec3(x, 0.0, 1.0);   // Blue → Magenta
    else color = vec3(1.0, 0.0, x);                 // Magenta → Red

    return color;
}
```

**Critical Detail**: Uses `velocity_proj`, not `velocity`, ensuring color matches visual flow direction!

#### Velocity Combined

Hue from projected angle, saturation from full magnitude:
```glsl
vec3 getColor(vec3 pos, vec3 velocity, vec3 velocity_proj) {
    float speed = length(velocity);  // Full N-D speed
    float angle = atan(velocity_proj.y, velocity_proj.x);  // Projected angle

    float hue = (angle + PI) / (2.0 * PI);
    float saturation = clamp(speed / u_max_velocity, 0.0, 1.0);

    // HSV to RGB with variable saturation
    vec3 full_color = hsv_to_rgb(hue, 1.0, 1.0);
    vec3 grey = vec3(0.5);

    // Slow particles → grey, fast → vibrant
    return mix(grey, full_color, saturation);
}
```

### Custom Gradient Modes

**Location**: `src/math/colors.js:185-248`

Users can apply custom gradients to preset modes:

```javascript
generateGradientColorMode('velocity_magnitude', dimensions, gradientGLSL)
```

**Generated Code**:

```glsl
// Piecewise linear gradient interpolation
vec3 evaluateGradient(float t) {
    t = clamp(t, 0.0, 1.0);

    // Color stops: [(0.0, red), (0.5, green), (1.0, blue)]
    if (t <= 0.5) {
        float segmentT = (t - 0.0) / 0.5;
        return mix(vec3(1,0,0), vec3(0,1,0), segmentT);
    } else {
        float segmentT = (t - 0.5) / 0.5;
        return mix(vec3(0,1,0), vec3(0,0,1), segmentT);
    }
}

vec3 getColor(vec3 pos, vec3 velocity, vec3 velocity_proj) {
    float speed = length(velocity);

    // Linear or logarithmic scaling
    float t;
    if (u_velocity_log_scale > 0.5) {
        t = log(1.0 + speed) / log(1.0 + u_max_velocity);
    } else {
        t = speed / u_max_velocity;
    }

    return evaluateGradient(clamp(t, 0.0, 1.0));
}
```

### Expression Color Mode

**Location**: `src/math/colors.js:149-176`

Users write custom expressions with position and velocity variables:

```javascript
generateExpressionColorMode(dimensions, expressionGLSL, gradientGLSL)
```

**Example**: User expression `"sqrt(dx*dx + dy*dy)"`

**Generated Code**:

```glsl
vec3 evaluateGradient(float t) {
    // ... piecewise linear interpolation ...
}

vec3 getColor(vec3 pos, vec3 velocity, vec3 velocity_proj) {
    // Unpack FULL N-D velocity for derivative variables
    float x = pos.x;
    float y = pos.y;
    float z = pos.z;
    float dx = velocity.x;  // Uses FULL velocity!
    float dy = velocity.y;
    float dz = velocity.z;

    // Evaluate user expression
    float value = sqrt(dx*dx + dy*dy);  // Parsed to GLSL

    // Map through gradient
    return evaluateGradient(value);
}
```

**Critical Detail**: Uses `velocity` (full N-D), NOT `velocity_proj`, so derivative variables work correctly!

### Gradient GLSL Generation

**Location**: `src/math/gradients.js:30-80`

Converts color stop array to piecewise linear GLSL:

```javascript
const stops = [
    { position: 0.0, color: [1, 0, 0] },   // Red at 0%
    { position: 0.3, color: [1, 1, 0] },   // Yellow at 30%
    { position: 0.7, color: [0, 1, 0] },   // Green at 70%
    { position: 1.0, color: [0, 0, 1] }    // Blue at 100%
];

generateGradientGLSL(stops);
```

**Generated GLSL**:

```glsl
vec3 evaluateGradient(float t) {
    t = clamp(t, 0.0, 1.0);

    if (t <= 0.3) {
        float segmentT = (t - 0.0) / 0.3;
        return mix(vec3(1.0,0.0,0.0), vec3(1.0,1.0,0.0), segmentT);
    } else if (t <= 0.7) {
        float segmentT = (t - 0.3) / 0.4;
        return mix(vec3(1.0,1.0,0.0), vec3(0.0,1.0,0.0), segmentT);
    } else {
        float segmentT = (t - 0.7) / 0.3;
        return mix(vec3(0.0,1.0,0.0), vec3(0.0,0.0,1.0), segmentT);
    }
}
```

**Performance**: All branches are compile-time constant, GPU branch prediction is excellent.

### Adaptive Velocity Scaling

**Location**: `src/webgl/renderer.js:820-890`

**Problem**: Max velocity changes during runtime as attractors evolve.

**Solution**: GPU-based velocity sampling with exponential moving average:

```javascript
// Sample every N frames
if (frameCount % velocitySampleInterval === 0) {
    // Read velocity data from GPU
    const stats = velocityStatsManager.compute(readTextures);

    // Asymmetric EMA: track increases quickly, decreases slowly
    const alpha = stats.max > maxVelocity ? 0.2 : 0.1;
    maxVelocity = alpha * stats.max + (1 - alpha) * maxVelocity;

    // Adapt sample frequency based on rate of change
    const relativeChange = Math.abs(stats.max - prevMax) / prevMax;
    if (relativeChange > 0.05) {
        velocitySampleInterval = 5;   // Sample often during transitions
    } else if (relativeChange < 0.01) {
        velocitySampleInterval = 60;  // Sample rarely when stable
    }

    // Update shader uniform
    gl.uniform1f(u_max_velocity, maxVelocity);
}
```

This ensures color scaling stays relevant without constant GPU→CPU readbacks.

---

## Texture Management

### TextureManager Class

**Location**: `src/webgl/textures.js`

**Responsibilities**:
1. Create N texture pairs (read/write) for N-dimensional systems
2. Initialize textures with particle data
3. Bind textures to shader uniforms
4. Swap textures for ping-pong buffering
5. Support dual-buffer (points) and triple-buffer (lines) modes

### Texture Creation

**Code** (`src/webgl/textures.js:60-95`):

```javascript
createTextures(particleCount, dimensions) {
    const resolution = Math.ceil(Math.sqrt(particleCount));  // √10000 = 100

    const format = this.strategy.getTextureFormat();
    // e.g., { internalFormat: gl.RGBA, format: gl.RGBA, type: gl.FLOAT }

    for (let d = 0; d < dimensions; d++) {
        // Create read texture
        this.readTextures[d] = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.readTextures[d]);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            format.internalFormat,  // gl.RGBA
            resolution,             // 100
            resolution,             // 100
            0,
            format.format,          // gl.RGBA
            format.type,            // gl.FLOAT or gl.UNSIGNED_BYTE
            null                    // Allocate but don't initialize
        );

        // Create write texture (identical)
        this.writeTextures[d] = /* ... same ... */;

        // Create previous texture for line mode (if enabled)
        if (lineMode) {
            this.prevTextures[d] = /* ... same ... */;
        }
    }
}
```

**Important Details**:
- `NEAREST` filtering (no interpolation between particles)
- `CLAMP_TO_EDGE` wrapping (no texture repeat)
- Square texture: √P × √P pixels for P particles
- Initial data = null (filled later by particle initialization)

### Particle Data Initialization

**Code** (`src/webgl/textures.js:110-150`):

```javascript
initializePositions(particleCount, dimensions, bbox) {
    const resolution = Math.ceil(Math.sqrt(particleCount));
    const ArrayType = this.strategy.getArrayType();  // Float32Array or Uint8Array

    for (let d = 0; d < dimensions; d++) {
        // Create CPU-side buffer
        const data = new ArrayType(resolution * resolution * 4);  // RGBA

        for (let i = 0; i < particleCount; i++) {
            // Random world position in bbox
            const worldPos = d < 2 ?
                bbox.min[d] + Math.random() * (bbox.max[d] - bbox.min[d]) :
                -10 + Math.random() * 20;

            // Normalize to [0, 1]
            const normalized = /* ... normalize ... */;

            // Encode using strategy
            const encoded = this.strategy.encodeValue(normalized);

            // Write to RGBA channels
            const idx = i * 4;
            data[idx + 0] = encoded.r;
            data[idx + 1] = encoded.g;
            data[idx + 2] = encoded.b;
            data[idx + 3] = encoded.a;

            // Dimension 0: Store age in alpha channel
            if (d === 0) {
                data[idx + 3] = 0.0;  // Newborn particles
            }
        }

        // Upload to GPU
        gl.bindTexture(gl.TEXTURE_2D, this.readTextures[d]);
        gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            0, 0,
            resolution, resolution,
            format.format,
            format.type,
            data
        );
    }
}
```

### Texture Binding

**Code** (`src/webgl/textures.js:170-190`):

```javascript
bindReadTextures(program) {
    for (let i = 0; i < this.dimensions; i++) {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, this.readTextures[i]);
        gl.uniform1i(
            gl.getUniformLocation(program, `u_pos_${i}`),
            i  // Texture unit number
        );
    }
}

bindWriteFramebuffer(dimension) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        this.writeTextures[dimension],
        0
    );
}
```

### Ping-Pong Swap

**Code** (`src/webgl/textures.js:200-220`):

```javascript
swap() {
    if (this.lineMode) {
        // Triple buffer rotation: prev ← read ← write ← prev
        const temp = this.prevTextures;
        this.prevTextures = this.readTextures;
        this.readTextures = this.writeTextures;
        this.writeTextures = temp;
    } else {
        // Dual buffer swap: read ↔ write
        const temp = this.readTextures;
        this.readTextures = this.writeTextures;
        this.writeTextures = temp;
    }
}
```

**Usage**:
```javascript
// Each frame:
for (let d = 0; d < dimensions; d++) {
    bindReadTextures(updateProgram);
    bindWriteFramebuffer(d);
    gl.uniform1i(u_out_coordinate, d);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);  // Fullscreen quad
}
textureManager.swap();  // Swap for next frame
```

### Texel Coordinate Mapping

For particle index → texture coordinate:

```glsl
// Vertex shader
float particle_index = a_index;  // 0, 1, 2, ..., 9999

// Calculate texture coordinate (add 0.5 to sample texel centers!)
vec2 texcoord = vec2(
    (mod(particle_index, u_particles_res) + 0.5) / u_particles_res,
    (floor(particle_index / u_particles_res) + 0.5) / u_particles_res
);

// Example: particle 0 → texcoord (0.5/100, 0.5/100) = (0.005, 0.005)
//          particle 99 → texcoord (99.5/100, 0.5/100) = (0.995, 0.005)
```

**Critical**: The `+0.5` ensures we sample from the **center** of texels, not edges.

---

## HDR Rendering Pipeline

The renderer uses High Dynamic Range (HDR) rendering with tone mapping for realistic particle accumulation.

### Pipeline Flow

```
┌─────────────────────────────────────────────────────────┐
│                  HDR RENDERING PIPELINE                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. FADE SHADER (optional)                              │
│     ├─ Read: HDR buffer (previous frame)                │
│     ├─ Multiply: color * fadeOpacity                    │
│     └─ Write: HDR buffer (dimmed)                       │
│                                                          │
│  2. DRAW PARTICLES                                       │
│     ├─ Blending: SRC_ALPHA + ONE (additive)             │
│     ├─ Color: RGB * intensity (unbounded values)        │
│     └─ Write: HDR buffer (accumulated)                  │
│                                                          │
│  4. TONEMAP SHADER                                       │
│     ├─ Read: HDR buffer (float values, possibly > 1.0)  │
│     ├─ Apply: Tone mapping operator (Reinhard, ACES...) │
│     ├─ Apply: Exposure, gamma correction                │
│     └─ Write: Canvas (LDR, clamped to [0,1])            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### HDR Framebuffer Setup

**Location**: `src/webgl/framebuffer.js:20-80`

```javascript
createHDRFramebuffer(width, height) {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);

    // Try RGBA32F first (full precision)
    let internalFormat = gl.RGBA32F || 0x8814;
    let texture = createFloatTexture(width, height, internalFormat);

    if (!checkFramebufferComplete()) {
        // Fallback to RGBA16F (half precision)
        internalFormat = gl.RGBA16F || 0x881A;
        texture = createFloatTexture(width, height, internalFormat);
    }

    if (!checkFramebufferComplete()) {
        // Fallback to LDR (RGBA8)
        logger.warn('HDR not supported, using LDR');
        internalFormat = gl.RGBA;
        texture = createByteTexture(width, height);
    }

    gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0
    );

    return { framebuffer: fb, texture: texture, format: internalFormat };
}
```

**Extensions Required**:
- `WEBGL_color_buffer_float` or `EXT_color_buffer_half_float`
- `OES_texture_float_linear` (for filtering)

### Additive Blending

**Code** (`src/webgl/renderer.js:650-660`):

```javascript
// Draw particles with additive blending
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE);  // dest = src*alpha + dest*1

// Particle fragment shader outputs unbounded RGB
gl_FragColor = vec4(color * intensity, alpha);
// e.g., vec4(10.0, 5.0, 2.0, 0.2) is valid in HDR!
```

**Effect**: Overlapping particles create bright cores (values > 1.0).

### Fade Shader

**Code** (`src/webgl/shaders.js:545-570`):

```glsl
precision highp float;

uniform sampler2D u_texture;
uniform float u_fade;
varying vec2 v_texcoord;

void main() {
    vec4 color = texture2D(u_texture, v_texcoord);
    gl_FragColor = color * u_fade;  // Multiply in HDR space!
}
```

**Usage**:
```javascript
// Disable blending for fade (direct write)
gl.disable(gl.BLEND);
gl.uniform1f(u_fade, Math.pow(1.0 - fadeSpeed, 2));  // Non-linear
renderFullscreenQuad();
```

### Tone Mapping Shader

**Location**: `src/webgl/shaders.js:575-650`, `src/math/tonemapping.js`

**Operators**:

1. **Linear**: `color * exposure`
2. **Reinhard**: `color / (1 + color)`
3. **Reinhard Extended**: `color * (1 + color/white²) / (1 + color)`
4. **Filmic (ACES)**: Industry-standard film emulation
5. **Uncharted 2**: Game-style punchy highlights
6. **Hable**: Enhanced Uncharted 2
7. **Luminance Extended**: Preserves luminance relationships

**Shader Template**:

```glsl
precision highp float;

uniform sampler2D u_texture;
uniform float u_exposure;
uniform float u_gamma;
uniform float u_white_point;       // For extended operators
uniform float u_color_saturation;  // Global saturation
uniform float u_desaturation;      // Brightness-based

varying vec2 v_texcoord;

${tonemapOperatorGLSL}  // Injected function

void main() {
    // Read HDR color
    vec3 hdr = texture2D(u_texture, v_texcoord).rgb;

    // Apply exposure
    hdr *= u_exposure;

    // Tone map
    vec3 ldr = tonemap(hdr);  // Injected function

    // Apply saturation
    if (u_color_saturation < 1.0) {
        float luminance = dot(ldr, vec3(0.2126, 0.7152, 0.0722));
        ldr = mix(vec3(luminance), ldr, u_color_saturation);
    }

    // Brightness-based desaturation (prevents oversaturation)
    float brightness = max(ldr.r, max(ldr.g, ldr.b));
    if (u_desaturation > 0.0 && brightness > 0.5) {
        float desatFactor = (brightness - 0.5) * 2.0 * u_desaturation;
        float luminance = dot(ldr, vec3(0.2126, 0.7152, 0.0722));
        ldr = mix(ldr, vec3(luminance), desatFactor);
    }

    // Gamma correction
    ldr = pow(ldr, vec3(1.0 / u_gamma));

    gl_FragColor = vec4(ldr, 1.0);
}
```

**Example Operator** (ACES Filmic):

```glsl
vec3 tonemap(vec3 x) {
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
```

**Pipeline**:

```
1. Bright Pass:
   HDR Buffer → Extract pixels > threshold → Bright Buffer

2. Gaussian Blur:
   Bright Buffer → Horizontal Blur → Temp Buffer
   Temp Buffer → Vertical Blur → Bloom Buffer

3. Combine:
   HDR Buffer + Bloom Buffer * intensity → Final HDR
```

**Separable Gaussian** (2 passes instead of NxN):

```glsl
// Horizontal pass
for (int i = -radius; i <= radius; i++) {
    color += texture2D(u_texture, texcoord + vec2(i * pixelSize, 0)) * weights[i];
}

// Vertical pass
for (int i = -radius; i <= radius; i++) {
    color += texture2D(u_texture, texcoord + vec2(0, i * pixelSize)) * weights[i];
}
```

**Why Disabled**: Requires extensive parameter tuning for aesthetic quality.

---

## Performance Optimizations

### 1. GPU-Only Particle Updates

**Benefit**: Zero CPU→GPU bandwidth for particle data after initialization.

**Technique**: All position updates via render-to-texture. CPU never touches particle arrays.

**Savings**: For 100k particles at 60fps:
- Without: 100k × 12 bytes × 60 fps = 72 MB/s upload
- With: 0 MB/s (only uniform updates)

### 2. Adaptive Velocity Sampling

**Problem**: Reading GPU data is expensive (forces pipeline stall).

**Solution**: Adaptive sampling frequency based on rate of change.

```javascript
// Sample often during rapid changes
if (relativeChange > 5%) {
    sampleInterval = 5;  // Every 5 frames
}
// Sample rarely when stable
else if (relativeChange < 1%) {
    sampleInterval = 60;  // Every 60 frames
}
```

**Savings**: 60/5 = 12× fewer GPU readbacks during stable periods.

### 3. Texture Format Selection

**Float textures** (32-bit):
- Pros: Maximum precision, zero encoding cost
- Cons: 4× memory vs bytes, requires extensions

**RGBA bytes** (8-bit):
- Pros: Universal support, 1/4 memory
- Cons: Quantization errors, encoding cost

**Decision**: Use float if available, else RGBA.

### 4. Shader Compilation Locking

**Problem**: Changing parameters can trigger shader recompilation mid-animation.

**Solution**: Lock shader recompilation during animation.

```javascript
if (animationRunning && lockShaders) {
    return;  // Skip updateConfig that would trigger recompile
}
```

**Benefit**: Smooth animation without stutter.

### 5. Multi-Pass Update Shader

**Technique**: Run update shader N times (once per dimension) instead of encoding N outputs in one pass.

**Trade-off**:
- Pros: Simpler shader, maximizes precision per dimension
- Cons: N render calls per frame

**Decision**: Precision wins for scientific visualization.

### 6. Debounced Settings Apply

**Problem**: Rapid UI changes cause excessive shader recompilation.

**Solution**: 300ms debounce on settings changes.

```javascript
let debounceTimer;
onChange(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        applySettings();
    }, 300);
});
```

**Benefit**: Only compiles once after user stops adjusting sliders.

### 7. Efficient Gradient Interpolation

**Technique**: Piecewise linear gradients compiled to GLSL (not texture lookups).

**Comparison**:
- Texture lookup: `texture2D(u_gradient, vec2(t, 0.5))`
- Compiled: `if (t < 0.5) return mix(...)`

**Benefit**: No texture bandwidth, better cache locality.

### 8. Texel Center Sampling

**Critical Detail**: Always add 0.5 to particle index before texture lookup.

```glsl
// WRONG: Samples texel edges, causes interpolation artifacts
vec2 tc = vec2(index / resolution, floor(index / resolution) / resolution);

// CORRECT: Samples texel centers
vec2 tc = vec2(
    (mod(index, resolution) + 0.5) / resolution,
    (floor(index / resolution) + 0.5) / resolution
);
```

**Benefit**: Correct data retrieval with NEAREST filtering.

---

## Code Reference

### Primary Shader Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/webgl/shaders.js` | 705 | All shader generation functions |
| `src/webgl/renderer.js` | 1200+ | Renderer class, shader compilation, render loop |
| `src/webgl/textures.js` | 250 | Texture manager, ping-pong buffering |
| `src/webgl/framebuffer.js` | 150 | HDR framebuffer management |

### Math & Code Generation

| File | Lines | Purpose |
|------|-------|---------|
| `src/math/parser.js` | 400 | Expression parsing, GLSL code generation |
| `src/math/integrators.js` | 600 | Integration methods (Euler, RK4, implicit) |
| `src/math/mappers.js` | 200 | 2D projection strategies |
| `src/math/colors.js` | 250 | Color mode definitions and generators |
| `src/math/gradients.js` | 150 | Gradient GLSL code generation |
| `src/math/tonemapping.js` | 200 | Tone mapping operators |
| `src/math/transforms.js` | 400 | Domain transformations |

### Coordinate Storage

| File | Lines | Purpose |
|------|-------|---------|
| `src/webgl/coordinate-strategy.js` | 50 | Base strategy class |
| `src/webgl/strategies/float-strategy.js` | 80 | Float texture storage (recommended) |
| `src/webgl/strategies/rgba-strategy.js` | 150 | RGBA byte encoding (legacy) |

### Key Functions

**Shader Generation**:
- `generateUpdateFragmentShader()` - src/webgl/shaders.js:86
- `generateDrawVertexShader()` - src/webgl/shaders.js:323
- `generateDrawFragmentShader()` - src/webgl/shaders.js:494
- `generateTonemapFragmentShader()` - src/webgl/shaders.js:575

**Code Generators**:
- `getIntegrator()` - src/math/integrators.js:20
- `getMapper()` - src/math/mappers.js:10
- `getColorMode()` - src/math/colors.js:5
- `generateExpressionColorMode()` - src/math/colors.js:149
- `generateGradientGLSL()` - src/math/gradients.js:30

**Rendering**:
- `Renderer.compileShaders()` - src/webgl/renderer.js:450
- `Renderer.render()` - src/webgl/renderer.js:700
- `Renderer.updateParticles()` - src/webgl/renderer.js:620
- `Renderer.drawParticles()` - src/webgl/renderer.js:680

**Texture Management**:
- `TextureManager.createTextures()` - src/webgl/textures.js:60
- `TextureManager.swap()` - src/webgl/textures.js:200
- `TextureManager.bindReadTextures()` - src/webgl/textures.js:170

---

## Summary

The shader architecture achieves **maximum flexibility** through:

1. **Runtime Code Generation**: Arbitrary math expressions → GLSL
2. **Strategy Pattern**: Abstract coordinate storage without code duplication
3. **Dual Projection**: Both positions and velocities projected for correct colors
4. **Three-Velocity Architecture**: Full N-D, projected 2D, and position for color modes
5. **HDR Pipeline**: Realistic accumulation with tone mapping
6. **GPU-Centric Design**: Zero CPU particle updates after initialization

**Trade-offs**:
- Complexity: Shader code is generated, not written
- Debugging: Must log generated GLSL to inspect
- Compatibility: Float textures require WebGL extensions

**Benefits**:
- Performance: Pure GPU compute, minimal data transfer
- Flexibility: Arbitrary dimensions, integrators, projections, colors
- Precision: One texture per dimension, no packing losses
- Scalability: 100k+ particles at 60fps on modern GPUs

This architecture enables scientific visualization of complex dynamical systems without sacrificing performance or flexibility.

