# Storage Strategy

How particle coordinates are stored in GPU textures.

## Overview

The renderer needs to store N-dimensional particle positions on the GPU. Two strategies are available for encoding these floating-point coordinates into textures.

**Changing the strategy requires a page reload.**

## RGBA Strategy

Encodes floating-point coordinates as 32-bit fixed-point values in RGBA bytes.

### Advantages
- Maximum compatibility (no WebGL extension required)
- Works on all devices and browsers
- Reliable fallback option

### Disadvantages
- Small encoding/decoding overhead in shaders
- Slightly more complex shader code

### When to Use
- If you experience rendering issues with Float strategy
- On older devices or browsers
- When maximum compatibility is required

## Float Strategy (Recommended)

Stores coordinates directly in floating-point textures using the `OES_texture_float` extension.

### Advantages
- No encoding/decoding overhead
- Simpler shader code
- ~23 bits of mantissa precision (IEEE 754 single precision)
- Better performance

### Disadvantages
- Requires `OES_texture_float` WebGL extension
- Not supported on some very old devices (rare)

### When to Use
- Default choice for modern devices
- Best precision and performance
- Widely supported (>99% of devices)

## Visual Comparison

Both strategies produce visually identical results for typical visualization tasks.

The differences are primarily in:
- Performance (Float is slightly faster)
- Compatibility (RGBA works everywhere)
- Implementation complexity (Float is simpler)

## Technical Details

For an N-dimensional system with P particles:
- N texture pairs are created (read/write buffers)
- Each texture is √P × √P pixels
- Each pixel stores one coordinate for one particle
- Float strategy: Direct gl.FLOAT storage
- RGBA strategy: Fixed-point encoding in 4 bytes

Both strategies use the same ping-pong update mechanism and produce mathematically equivalent results.
