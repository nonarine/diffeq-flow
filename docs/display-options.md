# Display Options & UI Controls

General interface controls and display settings for the visualization.

## Theme

Switch between Dark and Light display modes.

**Dark Mode (default):** Black background with white particles and bright UI elements. Classic look for attractor visualization.

**Light Mode:** White background with inverted particles and UI colors. Full CSS inversion creates a clean, paper-like appearance.

Theme persists in localStorage across sessions.

## Preset Management

### Loading Presets

Select from the Preset dropdown to instantly load famous attractors and example systems:

- Lorenz Attractor
- Rössler Attractor
- Van der Pol Oscillator
- And many more...

Loading a preset applies all parameters: vector field, integrator, colors, rendering settings, and view position.

### Saving Custom Presets

1. Configure your system (equations, colors, settings)
2. Enter a name in "Save Current as Preset"
3. Click "Save"

Your custom preset appears in the dropdown and persists in browser localStorage.

### Deleting Presets

Select a custom preset from the dropdown, then click "Delete" to remove it. Built-in presets cannot be deleted.

## Display Options Panel

Located in the top-left controls panel.

### Show Coordinate Grid

Displays a square grid overlay on the canvas to help visualize the coordinate system and scale.

The grid adjusts automatically based on the current zoom level and pan position, maintaining square aspect ratio.

Useful for understanding the physical extents of the phase space and checking coordinate system alignment.

### Default Settings

Resets ALL settings to their default values:

- Vector field equations
- Integrator and timestep
- Color modes and gradients
- Rendering parameters
- Pan/zoom view
- All other controls

**Warning:** This cannot be undone. Save important configurations as presets first.

## View Controls

### Pan/Zoom Panel

A dedicated control panel (top-right) with precise view manipulation:

**Pan Controls:** 3×3 directional grid for 8-direction panning plus center reset
- Arrow buttons move the view in that direction
- Center button resets view to origin

**Zoom Controls:**
- **+** button zooms in (2× closer)
- **-** button zooms out (2× further away)

**Keyboard Alternative:** Use **C** key to clear screen (when not typing in input fields)

### Mouse Controls

**Drag:** Click and drag anywhere on the canvas to pan the view

**Scroll:** Mouse wheel zooms toward the cursor position for intuitive exploration

The view automatically maintains square coordinate grids (circles stay circular) regardless of canvas aspect ratio.

## Sharing & Export

### Share URL

Click "Share URL" to copy a complete configuration link to clipboard.

The URL encodes:
- Vector field equations
- All integration settings
- Color modes and rendering parameters
- Current view position and zoom

Share this link to reproduce exact visualizations. URLs work across browsers and sessions.

### Save Image

Captures the current canvas view as a PNG image file.

**Resolution:** Matches the current canvas rendering resolution (affected by Render Scale setting)

**Tip:** For high-quality exports, temporarily increase Render Scale to 2.0× or 4.0× before saving.

The image includes only the canvas content (no UI controls or panels).

## Performance Monitoring

### FPS Counter

Located in the bottom-right corner, displays:

**Current FPS:** Actual frames per second being rendered

**Step Time:** Time spent computing particle positions each frame (in milliseconds)

Use this to identify performance bottlenecks:
- Low FPS (<30) = need to reduce particle count or resolution
- High step time (>16ms) = integration is slow, try simpler integrator or fewer dimensions

### Frame Limiter

Located next to the FPS counter.

Stops rendering after a specified number of frames. Used for creating strange attractors with consistent brightness.

**How it works:**
- Set a frame count limit (e.g., 10000 frames)
- Rendering automatically stops when that count is reached
- All particles have equal exposure time, creating uniform brightness
- Essential for alpha-blended attractors where brightness builds up over time

**Use cases:**
- Rendering final attractor images with precise brightness control
- Ensuring reproducible visual results
- Preventing over-saturation from infinite accumulation

**Tip:** For dense attractors, try 5000-20000 frames depending on particle count and fade settings.

## HDR Brightness Histogram

Collapsible panel in the bottom-left corner.

Shows a real-time histogram of pixel brightness values in the HDR framebuffer.

**How to Read:**
- **X-axis:** Brightness level (0 = black, higher = brighter)
- **Y-axis:** Number of pixels at that brightness
- **Peak:** Most common brightness value
- **Tail:** Highlight distribution

**Use Cases:**
- Identify clipping (tall bar at far right = too bright)
- Check exposure settings (peak should be in middle range)
- Verify HDR is working (distribution should span wide range)
- Fine-tune tone mapping for optimal brightness distribution

Especially useful when adjusting Exposure, Gamma, and White Point for attractor visualization.

## Tips

**Performance:** If rendering is slow:
1. Reduce particle count
2. Lower resolution scale
3. Use simpler integrator (Euler instead of RK4)
4. Enable frame limiter to reduce heat

**Quality:** For best visual results:
1. Increase particle count (100K-500K)
2. Increase resolution scale (2.0× or higher)
3. Enable SMAA antialiasing
4. Tune exposure and gamma for your system

**Sharing Configurations:**
1. Save complex setups as custom presets for quick access
2. Use Share URL for exact reproduction across devices
3. Export high-res images with Render Scale at 4.0× before saving
