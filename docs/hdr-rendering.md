# HDR & Tone Mapping

High Dynamic Range rendering allows particles to have unbounded brightness values.

## How It Works

1. Particles render to HDR framebuffer (float values, no clamping)
2. Fade shader operates in HDR space
3. Tone mapping converts HDR → display range

This pipeline prevents premature clamping and allows for sophisticated artistic control over the final image.

## Tone Mapping Operators

**Linear:** Pass-through conversion. No compression, mainly for debugging.

**Reinhard:** Simple compression formula `color / (1 + color)`. Natural look, smooth compression.

**Reinhard Extended:** Reinhard with configurable white point for highlight control.

**Filmic (ACES):** Approximation of ACES film emulation curve. Industry-standard look.

**Uncharted 2:** Game-style tone mapping with punchy highlights. Popular for high-contrast scenes.

**Hable:** Enhanced Uncharted 2 variant with improved shadow/highlight balance.

**Luminance Extended:** Preserves perceptual brightness relationships for accurate luminance mapping.

## Controls

### Exposure

Logarithmic scale (0.01 - 10.0)

Overall brightness multiplier applied before tone mapping. Use low values (0.05-0.2) for attractor visualization with high gamma.

### Gamma

Logarithmic scale (0.2 - 10.0)

Power curve for display. Standard = 2.2. Use high values (3.0-10.0) for aggressive shadow lifting in attractors to reveal faint structure.

### Luminance Gamma

Logarithmic scale (0.2 - 10.0)

Adjusts brightness only, preserving hue. Applied after regular gamma. Fine control for luminance without affecting color.

### White Point

Range: 1.0 - 10.0

Brightest value that maps to white. Higher values compress highlights more.

### Depth Occlusion

Use Z-buffer to occlude particles by depth. Creates layered density effect in 3D systems.

Particles further from the camera are rendered behind closer particles, creating a sense of depth and volume.

## Particle Intensity

Logarithmic scale (0.001 - 100.0)

Brightness multiplier for individual particles.

**For strange attractors:** Use very low values (0.01-0.05) to prevent oversaturation in dense regions.

**For traditional systems:** Standard values (0.5-2.0) work well.

## Color Controls

### Color Saturation

Range: 0.0 - 1.0

Overall color saturation. 0.0 = grayscale, 1.0 = full color.

Reduce to 0.3-0.7 for pastel colors ideal for attractor density visualization.

### Brightness Desaturation

Range: 0.0 - 1.0

Desaturates bright regions to prevent fully saturated colors in dense attractor areas. Creates more natural highlights.

### Dynamic Saturation

Range: 0.0 - 1.0

Desaturates dim regions, saturates bright regions. Sparse trails look washed out, dense accumulations pop with full color. Higher values = more aggressive effect.

## Typical Settings

### Strange Attractors from Limit Cycles

When running limit cycle equations with large integration timesteps to generate chaotic strange attractors:

- Particle intensity: 0.01-0.05 (very low)
- Exposure: 0.3-0.7 (low)
- Gamma: 3.0-5.0 (high for shadow lifting)
- Tone mapping: Luminance Extended or Hable
- Color saturation: 0.3-0.6 (pastel)

This combination reveals intricate attractor structure without blown-out highlights.

### Traditional Attractors

For standard continuous systems (Lorenz, Rössler):

- Particle intensity: 0.5-2.0 (standard)
- Exposure: 0.8-1.5 (standard)
- Gamma: 2.2 (standard)
- Tone mapping: ACES or Filmic
