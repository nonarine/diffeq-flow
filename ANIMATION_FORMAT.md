# Animation JSON Format

This document describes the JSON schema for animation scripts used by the de-render animation system.

## Overview

Animation scripts define a **keyframe-based timeline** where settings interpolate smoothly between keyframes. The animation system supports:

- **Time-based expressions** using the `a` variable (alpha, 0.0-1.0)
- **Multiple simultaneous parameter changes** per keyframe
- **Easing functions** for smooth interpolation
- **Per-frame burn-in and accumulation workflow** for clean, reproducible frames

## Basic Structure

```json
{
  "name": "Animation Name",
  "description": "Optional description",
  "fps": 30,
  "baseSettings": { /* Full renderer settings */ },
  "timeline": [ /* Array of keyframes */ ],
  "frameConfig": { /* Frame capture workflow */ }
}
```

## Top-Level Fields

### `name` (string, optional)
Animation name (default: "Untitled Animation")

### `description` (string, optional)
Description of the animation

### `fps` (number, optional)
Frames per second (default: 30)

### `baseSettings` (object, required)
Complete renderer settings object. These are the starting values, which keyframes can override.

See the main CLAUDE.md for the complete settings structure. Common fields:

```json
"baseSettings": {
  "dimensions": 3,
  "expressions": ["10*(y-x)", "x*(28-z)-y", "x*y-8/3*z"],
  "integratorType": "rk4",
  "timestep": 0.01,
  "particleCount": 15000,
  "fadeOpacity": 0.997,
  "dropProbability": 0.002,
  "mapperType": "select",
  "mapperParams": { "dim1": 0, "dim2": 2 },
  "colorMode": "velocity_magnitude",
  "particleIntensity": 1.0,
  "exposure": 1.0,
  "gamma": 2.2,
  "tonemapOperator": "aces",
  "bbox": { "min": [-30, -30], "max": [30, 30] }
}
```

### `timeline` (array, required)
Array of keyframes defining when settings change. **Must have at least 2 keyframes** and be **sorted by time**.

Each keyframe has:

```json
{
  "time": 0.0,              // Time in seconds
  "settings": {},           // Settings to change (partial object)
  "easing": "linear",       // Easing function (optional)
  "convergenceSteps": 0     // Reserved for future use
}
```

**Easing Functions:**
- `linear` (default)
- `easeIn` - Quadratic ease in
- `easeOut` - Quadratic ease out
- `easeInOut` - Quadratic ease in/out
- `easeInCubic` - Cubic ease in
- `easeOutCubic` - Cubic ease out
- `easeInOutCubic` - Cubic ease in/out
- `elastic` - Elastic overshoot
- `bounce` - Bouncing effect

### `frameConfig` (object, optional)
Defines the per-frame rendering workflow:

```json
"frameConfig": {
  "burnInSteps": 5000,         // Integration steps before render
  "clearAfterBurnIn": true,    // Clear canvas after burn-in (keep particles)
  "accumulationSteps": 2000    // Integration steps to build trails
}
```

**Default values:**
- `burnInSteps`: 5000 - Let particles settle into attractor
- `clearAfterBurnIn`: true - Start with clean canvas but settled particles
- `accumulationSteps`: 2000 - Build up trails for final image

## Frame Capture Workflow

For each animation frame, the system:

1. **Interpolate settings** between keyframes based on current time
2. **Set animation alpha** (`a` variable) to normalized time (0.0-1.0)
3. **Apply settings** to renderer (may trigger shader recompilation)
4. **Clear render buffer** and **reset particles** to random positions
5. **Run burn-in steps** (particles settle into attractor)
6. **Optionally clear render buffer** again (keep particles at settled positions)
7. **Run accumulation steps** (build up trails with fade)
8. **Final render pass** for capture
9. **Capture frame** to PNG

This ensures each frame is **clean and reproducible**, independent of previous frames.

## Using the `a` Variable

The `a` variable (alpha) is automatically set to the normalized animation time (0.0 to 1.0) and can be used in **any expression**:

### Example 1: Animate Timestep
```json
"baseSettings": {
  "expressions": ["0.01 + a*0.09", "x"]
}
```
- At time 0s: timestep = 0.01
- At time 10s: timestep = 0.10

### Example 2: Animate System Parameter
```json
"timeline": [
  {
    "time": 0.0,
    "settings": { "expressions": ["y", "x*(1 + a*27) - y"] }
  }
]
```
- Lorenz rho parameter animates from 1 to 28

### Example 3: Driven Oscillator
```json
"expressions": ["y", "x - x*x*x - 0.3*y + 0.35*cos(1.4*a*6.28)"]
```
- Driving frequency based on animation time

## Keyframe Interpolation

Settings are interpolated between keyframes based on the easing function:

**Numeric values**: Linear interpolation with easing applied
```json
"timestep": 0.01  →  0.05  // Smooth transition
```

**Arrays** (like `expressions`, `bbox.min`, `bbox.max`):
- Numeric elements: Interpolated per-element
- String elements: Switch at t > 0.5

**Objects** (like `mapperParams`, `transformParams`):
- Each property interpolated independently
- Missing properties inherited from previous keyframe

**Other types** (strings, booleans):
- Switch at t > 0.5 (no interpolation)

## Complete Examples

### 1. Simple Parameter Sweep
```json
{
  "name": "Timestep Sweep",
  "fps": 30,
  "baseSettings": {
    "dimensions": 2,
    "expressions": ["-y", "x"],
    "integratorType": "rk4",
    "timestep": 0.001,
    "particleCount": 10000
  },
  "timeline": [
    { "time": 0.0, "settings": {}, "easing": "linear" },
    { "time": 10.0, "settings": { "timestep": 0.1 }, "easing": "linear" }
  ],
  "frameConfig": {
    "burnInSteps": 3000,
    "clearAfterBurnIn": true,
    "accumulationSteps": 1500
  }
}
```

### 2. Camera Zoom with Exposure Adjustment
```json
{
  "name": "Lorenz Zoom",
  "fps": 60,
  "baseSettings": {
    "dimensions": 3,
    "expressions": ["10*(y-x)", "x*(28-z)-y", "x*y-8/3*z"],
    "particleCount": 20000,
    "bbox": { "min": [-30, -30], "max": [30, 30] }
  },
  "timeline": [
    {
      "time": 0.0,
      "settings": {},
      "easing": "easeInOut"
    },
    {
      "time": 5.0,
      "settings": {
        "bbox": { "min": [-10, -10], "max": [10, 10] },
        "exposure": 1.5
      },
      "easing": "easeInOut"
    },
    {
      "time": 10.0,
      "settings": {
        "bbox": { "min": [-3, -3], "max": [3, 3] },
        "exposure": 2.0,
        "particleIntensity": 0.3
      },
      "easing": "linear"
    }
  ],
  "frameConfig": {
    "burnInSteps": 10000,
    "clearAfterBurnIn": true,
    "accumulationSteps": 5000
  }
}
```

### 3. Expression Morphing
```json
{
  "name": "Van der Pol to Duffing",
  "fps": 30,
  "baseSettings": {
    "dimensions": 2,
    "timestep": 0.02,
    "particleCount": 15000
  },
  "timeline": [
    {
      "time": 0.0,
      "settings": {
        "expressions": ["y", "1.0*(1-x*x)*y - x"]
      },
      "easing": "easeInOut"
    },
    {
      "time": 10.0,
      "settings": {
        "expressions": ["y", "x - x*x*x - 0.3*y + 0.35*cos(1.4*a*6.28)"]
      },
      "easing": "linear"
    }
  ],
  "frameConfig": {
    "burnInSteps": 5000,
    "clearAfterBurnIn": true,
    "accumulationSteps": 2500
  }
}
```

## Usage

### Browser
1. Open the application in a browser
2. Click the **Animation** panel button
3. Load a JSON animation file
4. Click **Play** to render and preview
5. Click **Download Frames (ZIP)** to export

### Puppeteer (Offline Rendering)
```bash
# Install dependencies
npm install

# Render animation at 1080p
node scripts/render-animation.js animations/lorenz-zoom.json

# Render at 4K
node scripts/render-animation.js animations/lorenz-zoom.json \
  --width 3840 --height 2160 \
  --output ./renders/lorenz-4k

# Create video with ffmpeg
ffmpeg -framerate 30 -i ./renders/lorenz-4k/frame_%06d.png \
  -c:v libx264 -pix_fmt yuv420p -crf 18 lorenz.mp4
```

## Tips for Best Results

### Burn-In Steps
- **Too few**: Particles haven't settled, chaotic motion
- **Too many**: Wasted computation
- **Typical**: 3000-10000 steps for most systems

### Accumulation Steps
- **Short trails**: 500-1000 steps
- **Medium trails**: 2000-3000 steps
- **Long trails**: 5000+ steps

### Clear After Burn-In
- **true**: Clean canvas with settled particles (recommended)
- **false**: Burn-in trails visible in final render

### Frame Rate
- **30 fps**: Standard video
- **60 fps**: Smooth motion
- **24 fps**: Cinematic look

### Easing Functions
- **linear**: Constant speed changes
- **easeInOut**: Smooth start and stop
- **elastic/bounce**: Overshoot for dramatic effect

## Limitations

- Expression morphing uses string switching (no AST interpolation)
- All keyframes must be sorted by time
- Timeline must have at least 2 keyframes
- Maximum dimensions: 6 (x, y, z, w, u, v)

## See Also

- `CLAUDE.md` - Complete settings reference
- `animations/` - Example animation files
- `scripts/render-animation.js` - Puppeteer renderer source
