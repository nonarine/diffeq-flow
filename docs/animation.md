# Animation System

Create smooth parameter animations for video export.

## Animation Panels

Animation controls appear in two locations:

**Display Options Panel:** Located within the main controls panel (left side). Contains basic alpha slider and display options for interactive testing.

**Floating Animation Panel:** Dedicated panel that appears when hovering over the animation icon (🎬). Contains full animation creation and export controls. Can be locked open by clicking the lock button.

Use Display Options for quick testing, use the floating panel for creating animations to export.

## Interactive Testing

The `a` variable ranges from 0.0 to 1.0. Use it in expressions:

```
sin(x + a * 6.28)    # Rotating phase
0.01 + a * 0.09      # Varying timestep
```

Move the alpha slider to test how your system responds to the animation variable in real-time.

## Animatable Controls

Controls with animation support show orange MIN/MAX handles. Drag to set interpolation range.

During playback, the control value smoothly interpolates between MIN and MAX as alpha goes from 0.0 to 1.0.

Click the 🎬 icon on any compatible control to enable animation bounds.

## Animation Speed Control

Located in the floating Animation panel.

Controls how fast the alpha variable changes during interactive testing.

**Range:** 0.0001 to 1.0 (logarithmic scale)

**Low values (0.0001-0.01):** Slow, smooth transitions. Good for observing subtle changes.

**High values (0.1-1.0):** Fast changes. Good for quickly scanning through parameter space.

This only affects interactive testing with the alpha slider, not export frame rate.

## Display Options

### Reset Particles

Reinitialize particle positions when alpha updates. Creates clean transitions between parameter states.

Useful when you want each alpha value to show a fresh system state.

### Freeze Screen

Clear screen and freeze rendering between alpha updates for clean transitions.

Prevents motion blur between parameter states. Each frame is a static snapshot.

### Alpha Step Time Smoothing

Maintain consistent frame time by adding delays to faster alpha steps.

Ensures smooth video playback when some parameter combinations render faster than others.

### Lock Shaders During Playback

When enabled, prevents shader recompilation while animation is playing.

Prevents visual hiccups from parameter changes. Shader updates are queued until playback stops.

## Export Options

Located in the floating Animation panel.

### Understanding Frame Count, Loops, and Steps

These three parameters work together to control animation length and smoothness:

**Frame Count:** Total number of PNG images to capture (final output file count)

**Loops:** Number of complete alpha cycles
- **One-way mode OFF (default):** 1 loop = 0.0 → 1.0 → 0.0 (ping-pong, 2× the frames)
- **One-way mode ON:** 1 loop = 0.0 → 1.0 (linear, half the frames)

**Relationship:**
- Frame Count ÷ Loops = frames per loop
- More loops = animation repeats, good for looping videos
- Fewer loops = longer single sweep through parameter space

**Example:** 300 frames, 1 loop, one-way OFF = alpha goes 0→1→0 over 300 frames

### Steps per Increment

Number of frames to wait at each alpha value before advancing.

**1 step:** Alpha changes every frame (smoothest, fastest parameter sweep)

**10 steps:** Alpha changes every 10 frames (gives particles time to settle at each parameter value)

**100+ steps:** Very slow parameter changes (good for observing transient dynamics)

Higher values are useful for:
- Letting attractors fully form at each parameter value
- Creating "burn-in" time for stable brightness
- Emphasizing discrete parameter jumps rather than smooth transitions

### Clear Particles/Screen

Controls what happens when alpha updates to a new value:

**Clear particles:** Reinitialize all particle positions to random locations

**Clear screen:** Erase the canvas to black

**Both OFF:** Particles continue from previous positions, trails accumulate (creates blended transitions)

**Both ON:** Fresh start at each alpha value (creates discrete, separated frames)

## Export Settings Template

Click "Export Settings Template" to save current configuration as JSON.

This creates a base template for scripted animations with complex keyframe control.

## Video Creation

After downloading the ZIP file containing PNG frames:

```bash
./scripts/create-video.sh animation.zip output.mp4 30
```

This script uses ffmpeg to create an MP4 video at 30 FPS from your frame sequence.

Additional output formats (GIF, looping video) are also supported by the script.
