# Intermediate Results Buffer Architecture

> **⚠️ STATUS: NOT YET IMPLEMENTED**
> This document describes a proposed future architecture.
> Current implementation uses per-dimension shaders without intermediate buffers.
> Last updated: 2025-11-13

---

## Problem Statement

Current architecture splits particle updates across N separate shaders (one per dimension), but advanced methods require expensive computations that should be shared:

- **Halley's Method**: Needs Jacobian (n²) + Hessian (n³)
- **Full Implicit RK4**: Needs coupled stage solving with (2n)×(2n) Jacobian
- **Newton's Method**: Currently recomputes Jacobian N times (once per dimension)

## Proposed Solution: Two-Pass Architecture

### Pass 1: Intermediate Results Shader
Compute and store shared data in intermediate texture(s):
- Current position (read from all dimension textures)
- Jacobian matrix elements: n² values
- Hessian tensor elements: n³ values (for Halley's)
- Intermediate stage values: k₁, k₂, ... (for implicit RK4)

### Pass 2: Dimension Update Shaders
For each dimension d ∈ [0, n-1]:
- Read intermediate results from Pass 1
- Use precomputed Jacobian/Hessian to update dimension d
- Write to dimension d's output texture

## Storage Requirements Analysis

### For P particles with texture size √P × √P:

**Newton's Method** (current waste):
- Jacobian: n² floats per particle
- Currently computed N times → wastes N×n² computations
- With intermediate buffer: compute once, use N times
- **Savings**: (N-1)×n² computations per particle

**Halley's Method** (currently impossible):
- Jacobian: n² floats
- Hessian: n³ floats
- Total: n² + n³ floats per particle
- Example: 3D = 9 + 27 = 36 floats = 9 RGBA pixels
- Example: 4D = 16 + 64 = 80 floats = 20 RGBA pixels

**Full Implicit RK4** (currently simplified):
- Stage values: 2n floats (k₁, k₂ for 2-stage Gauss-Legendre)
- Coupled Jacobian: (2n)² = 4n² floats
- Total: 2n + 4n² floats
- Example: 3D = 6 + 36 = 42 floats = 11 RGBA pixels
- Example: 4D = 8 + 64 = 72 floats = 18 RGBA pixels

## Texture Packing Strategies

### Strategy A: Multiple Intermediate Textures
For 3D system with 10,000 particles (100×100):
- Texture 1 (100×100 RGBA): First 4 Jacobian elements per particle
- Texture 2 (100×100 RGBA): Next 4 Jacobian elements per particle
- Texture 3 (100×100 RGBA): Last 1 Jacobian element + 3 Hessian elements
- ... etc.

**Pros**: Simple indexing (same UV coordinates across all textures)
**Cons**: Many texture binds/unbinds

### Strategy B: Single Larger Texture
For 3D system, pack all intermediate data into one texture:
- Width: √P
- Height: √P × ⌈(n² + n³)/4⌉
- Example: 3D needs 9 RGBA pixels → 100×900 texture

**Pros**: Single texture bind
**Cons**: More complex UV arithmetic

### Strategy C: Efficient Packing (Recommended)
Use multiple textures but minimize count:
- Texture 1: Jacobian matrix (⌈n²/4⌉ RGBA values per particle)
- Texture 2: Hessian tensor (⌈n³/4⌉ RGBA values per particle) [only if needed]
- Texture 3: Stage values (⌈2n/4⌉ RGBA values per particle) [only if needed]

For 3D:
- Jacobian texture: 100×100×⌈9/4⌉ = 100×300 (or 3× 100×100 textures)
- Hessian texture: 100×100×⌈27/4⌉ = 100×700 (or 7× 100×100 textures)

## Implementation Roadmap

### Phase 1: Basic Infrastructure (No Algorithm Changes)
- [ ] Create `IntermediateBufferManager` class
- [ ] Allocate intermediate textures based on solver needs
- [ ] Modify render loop to add intermediate pass
- [ ] Test performance overhead with empty intermediate shader

### Phase 2: Newton's Method Optimization
- [ ] Move Jacobian computation to intermediate pass
- [ ] Modify dimension shaders to read precomputed Jacobian
- [ ] Measure performance improvement (should be ~N× faster for implicit solvers)

### Phase 3: Full Implicit RK4
- [ ] Implement coupled 2n×2n Newton's method
- [ ] Solve both stages simultaneously
- [ ] Compare accuracy vs. current Gauss-Seidel approach

### Phase 4: Halley's Method
- [ ] Add Hessian computation to jacobian.js
- [ ] Generate Hessian GLSL code
- [ ] Implement multidimensional Halley solver
- [ ] Test convergence properties and visual artifacts

## Performance Analysis

### Memory Cost:
- Newton (3D): 9 floats = 2.25× RGBA pixels per particle
- Newton (4D): 16 floats = 4× RGBA pixels per particle
- Halley (3D): 36 floats = 9× RGBA pixels per particle
- Halley (4D): 80 floats = 20× RGBA pixels per particle

For 100k particles (316×316):
- Newton 3D: ~710 KB additional texture memory
- Newton 4D: ~1.25 MB additional texture memory
- Halley 3D: ~2.8 MB additional texture memory
- Halley 4D: ~6.3 MB additional texture memory

**Verdict**: Very reasonable for modern GPUs (typical have 4-8 GB VRAM)

### Computational Cost:
Current (Newton's method, per frame):
- N dimension shaders, each computing Jacobian = N×n² derivatives
- Total: N²×n derivatives

Proposed (Newton's method, per frame):
- 1 intermediate shader computing Jacobian = n² derivatives
- N dimension shaders reading Jacobian = 0 additional derivatives
- Total: n² derivatives

**Savings**: N²×n → n² (factor of N² improvement!)

For 4D system: 4²×4 = 64 derivatives → 16 derivatives (4× speedup!)

## Questions to Answer

1. **How much slower is the intermediate pass?**
   - Need to benchmark: current N passes vs. 1 intermediate + N dimension passes
   - Hypothesis: Intermediate pass is cheaper than N repeated Jacobian computations

2. **Does shared Jacobian enable new visual effects?**
   - Full implicit RK4 might have different stability properties
   - Halley's method might converge differently, creating unique patterns

3. **Memory bandwidth concerns?**
   - Reading intermediate textures N times might be bottleneck
   - But: Modern GPU texture caches should handle this well
   - Alternative: Compute everything in one unified shader (but see note below)

4. **Why not use one unified shader for all dimensions?**
   - We tried this before! Packing N coordinates into interleaved texture was messy
   - Current separate-texture architecture is cleaner for most operations
   - Intermediate buffer gives us "best of both worlds"

## Decision Points

Before implementing, we should decide:

1. **Start with Newton optimization or jump to Halley?**
   - Newton: Proves the architecture works, immediate performance gains
   - Halley: More exciting mathematically, but higher risk

2. **Texture packing strategy?**
   - Multiple square textures (simpler indexing)
   - Single tall texture (fewer binds)
   - Hybrid (separate textures for Jacobian vs. Hessian)

3. **Fallback behavior?**
   - If intermediate buffer fails to allocate, fall back to current approach
   - Need to detect and handle gracefully

## Conclusion

**The intermediate buffer approach solves our problems!**

✅ Enables Halley's method (Jacobian + Hessian shared)
✅ Enables full implicit RK4 (coupled stages)
✅ Improves Newton's method performance (factor of N speedup)
✅ Memory cost is reasonable (< 10 MB even for 100k particles in 4D)
✅ Preserves current clean separation of dimension textures

**Recommended path forward:**
1. Implement basic intermediate buffer infrastructure
2. Move Newton's Jacobian to intermediate pass (prove it works)
3. Add Halley's method (exciting new capability)
4. Consider full implicit RK4 (if time permits)
