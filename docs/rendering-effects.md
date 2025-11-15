# Rendering Effects

Advanced post-processing effects for visual quality and artistic control.

## Render Scale

Resolution multiplier: 0.5× - 4.0×

Controls the internal rendering resolution relative to canvas size.

**< 1.0×:** Lower resolution for better performance. 0.5× = quarter the pixels (2× faster).

**> 1.0×:** Higher resolution for better quality. 2.0× = 4× the pixels (supersampling antialiasing).

Useful for:
- Performance optimization on slower devices (0.5×-0.75×)
- High-quality screenshots and videos (2.0×-4.0×)
- Balancing quality vs performance

## SMAA Antialiasing

Pattern-based antialiasing with better edge preservation than FXAA.

Uses edge detection and pattern recognition to identify and smooth jagged edges without blurring the entire image.

### Blend Strength

Range: 0.0 - 1.0 (default: 0.75)

Controls how much smoothing is applied to detected edges.

Higher values = stronger antialiasing effect, but may soften details slightly.

### Edge Threshold

Range: 0.0 - 0.5 (default: 0.10)

Edge detection sensitivity.

**Lower values:** Detect more edges (more aggressive antialiasing, may smooth too much)

**Higher values:** Only detect strong edges (conservative antialiasing, preserve fine details)

## Bilateral Filter

Edge-preserving blur that smooths flat/sparse areas while preserving sharp edges and particle trails.

Excellent for reducing noise in sparse particle regions while maintaining crisp attractor structure.

### Blur Radius

Range: 0.5 - 5.0 (default: 4.0)

Size of the blur kernel. Higher values = stronger smoothing effect.

### Edge Threshold

Range: 0.01 - 0.5 (default: 0.20)

Controls edge preservation.

**Lower values:** Preserve more edges, less blurring across boundaries

**Higher values:** Blur more aggressively across edges

## Tips

- Combine render scale 0.5× with SMAA for good performance and quality on slower hardware
- Bilateral filter works exceptionally well for attractor visualization, reducing sparse particle noise
- Use render scale 2.0× for final video exports to eliminate aliasing artifacts
