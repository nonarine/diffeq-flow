# TODO & Future Work

## Improved Particle Dropping for Point Attractors

**Removed Feature:** "Drop low velocity particles" checkbox (removed 2025-11-26)
- Simple velocity threshold wasn't effective at identifying truly stuck particles
- Dropped particles at limit cycles and other low-velocity regions incorrectly

**Better Approach:**
Implement smarter heuristics to detect particles stuck at point attractors:
- Track particle position history (e.g., last 10-20 positions)
- Calculate position variance over time window
- Drop particles with low position variance AND low velocity (indicates stuck at fixed point)
- OR: Drop particles that haven't moved beyond some epsilon distance in N frames
- OR: Use velocity direction changes to detect circling vs. converging behavior

**Implementation Ideas:**
- Could be done in shader with circular buffer in texture
- Or track subset of particles on CPU side for detection
- Make threshold configurable (position variance, time window)
- Add visualization mode to highlight "stale" particles before dropping

---

## Settings Transformation Architecture
**Current Issue:** Settings transformations (e.g., `implicitIterations` → `integratorParams`) happen in the ControlManager `onApply` callback, which only runs during UI interactions, not during initial load from localStorage. This can cause settings to be incomplete on page refresh.

**Potential Improvements:**
- Extract transformations into separate `transformSettings()` function called in both `onApply` and `loadFromStorage()`
- Consider declarative transformation system (register transformations with ControlManager)
- Add validation on settings load to detect missing required fields and warn/auto-fix
- Better separation between UI state (what controls show) vs renderer config (what gets applied)
- Make transformations bidirectional (both load and save) to maintain consistency

---

## Offline Rendering Refactoring
**Current Issue:** `scripts/render-animation.js` (lines 106-189) duplicates animation logic from `src/animation/animator.js`. The puppeteer script manually implements the frame rendering loop instead of calling `animator.run()`.

**Problems:**
- Changes to `animator.js` workflow don't automatically apply to offline rendering
- Two places to maintain the same logic (interpolation, burn-in, accumulation, capture)
- Risk of divergence between browser and offline rendering results
- 80+ lines of duplicate code

**Proposed Solution:**
Replace duplicate code with:
```javascript
const frames = await page.evaluate(async (animData) => {
    const { Animator } = await import('./src/animation/animator.js');
    const animator = new Animator(window.renderer, window.controlManager);
    animator.loadScript(animData);
    return await animator.run();  // Use existing method!
}, animationData);
```

**Benefits:**
- Single source of truth for animation workflow
- Eliminates 80+ lines of code
- Ensures consistency between browser and offline rendering
- Easier to maintain and extend

---

## Robust Matrix Inversion for Coordinate Systems

**Current Issue:** The coordinate system velocity transform requires inverting the Jacobian matrix of the forward transform. Currently using Nerdamer's symbolic matrix inversion, which has limitations:

**Current Approach (Symbolic via Nerdamer):**
- ✅ Produces exact symbolic expressions
- ✅ Works for 2×2, 3×3, 4×4 matrices
- ❌ Can produce very complex/messy expressions
- ❌ Relies on Nerdamer's matrix operations
- ❌ No fallback if symbolic inversion fails
- ❌ Nerdamer has known consistency issues (see jacobian.js:51-54)

**Future Improvements:**

### 1. Symbolic Inversion (Enhanced)
- Use multiple symbolic math backends (SymPy via Pyodide, Algebrite, math.js)
- Implement direct closed-form formulas for 2×2 and 3×3 matrices
- Add symbolic simplification passes to reduce expression complexity
- Cache inverted Jacobians to avoid recomputation

**2×2 Matrix Closed Form:**
```javascript
// For J = [[a, b], [c, d]]
// J^-1 = (1/det) * [[d, -b], [-c, a]]
// det = a*d - b*c
```

**3×3 Matrix Closed Form:**
```javascript
// Use cofactor expansion (more complex but deterministic)
```

### 2. Numerical Inversion (Fallback)
When symbolic inversion fails or produces overly complex expressions:

**LU Decomposition (GLSL):**
```glsl
// Decompose J = LU, then solve L(Ux) = v
mat2 invertNumerical(mat2 J) {
    // Gaussian elimination in shader
}
```

**Benefits:**
- Always works (numerically stable for well-conditioned matrices)
- Simpler GLSL code than complex symbolic expressions
- Can handle edge cases (singularities near origin for polar coords)

**Challenges:**
- Numerical precision in WebGL (float32)
- Singularities in coordinate transforms (e.g., r=0 in polar)
- Performance cost per particle

### 3. Hybrid Approach (Recommended)
- Try symbolic inversion first with timeout/complexity limit
- If symbolic result is too complex (>500 chars), use numerical
- For known coordinate systems (polar, spherical), use pre-computed closed-form inverses
- Provide manual override for custom systems

**Example Implementation:**
```javascript
generateVelocityTransformGLSL(cartesianVars, parseFunc) {
    const jacobian = computeSymbolicJacobian(this.forwardTransforms, this.dimensions);

    // Try symbolic inversion
    let inverseJacobian = invertJacobian(jacobian);

    // Check if result is too complex
    const complexity = inverseJacobian.flat().join('').length;
    if (complexity > 500) {
        logger.warn(`Symbolic inverse too complex (${complexity} chars), using numerical fallback`);
        return this.generateNumericalInverseGLSL(jacobian, cartesianVars);
    }

    return this.generateSymbolicInverseGLSL(inverseJacobian, cartesianVars);
}
```

### 4. Precomputed Inverses for Common Systems
For well-known coordinate systems, manually provide the inverse Jacobian:

**Polar 2D:**
```javascript
// Forward: r = sqrt(x²+y²), θ = atan2(y,x)
// J_forward = [[x/r, y/r], [-y/r², x/r²]]
// J_inverse = [[x/r, -y], [y/r, x]]  // Cleaner!
```

**Spherical 3D:**
```javascript
// Precompute and store simplified inverse Jacobian
// Avoids Nerdamer complexity
```

### 5. Singularity Handling
Coordinate transforms often have singularities (e.g., r=0 for polar):

**Approaches:**
- Add small epsilon to denominators: `r + 1e-6`
- Detect singularities and clamp velocity
- Use regularized transforms near singularities
- Warn user if particles cluster near singularities

**GLSL Example:**
```glsl
// Polar coordinate transform with singularity protection
vec2 transformVelocityToCartesian(vec2 vel_native, vec2 pos) {
    float r = length(pos);
    if (r < 1e-4) {
        // Near origin: velocity is undefined, clamp to zero
        return vec2(0.0);
    }
    // Regular transform
    // ...
}
```

### 6. Validation & Testing
- Unit tests for known Jacobian inverses (polar, spherical)
- Numerical tests: verify `J * J^-1 ≈ I` in GLSL
- Visual tests: circular flows in polar coords should stay circular
- Stability tests: particles near singularities shouldn't explode

---

---

## Faster Shader Testing with headless-gl

**Status:** Future enhancement (not currently implemented)

**Current Testing Approach:** Puppeteer + Chrome (DIY GPGPU)
- ✅ Uses existing infrastructure (Puppeteer already in package.json)
- ✅ No new dependencies
- ✅ Real browser WebGL implementation (catches browser-specific bugs)
- ✅ Can run headless or with visible browser for debugging
- ❌ Slower execution (~1-2 seconds per test due to browser startup)
- ❌ Heavier resource usage (full Chrome process per test run)
- ❌ Cannot run tests in parallel easily

**Proposed Approach:** headless-gl
- Native WebGL context in Node.js (via ANGLE)
- ~10x faster test execution (no browser startup)
- Lightweight (direct WebGL calls, no DOM)
- Perfect for CI/CD pipelines
- Can run multiple tests in parallel
- Full Khronos ARB conformance suite

**Installation:**
```bash
npm install gl  # or: npm install headless-gl
```

**Example Usage:**
```javascript
const createContext = require('gl');
const gl = createContext(256, 256);  // Create WebGL context

// Compile shaders, set uniforms, draw
// ... (same WebGL API as browser)

// Read pixels
const pixels = new Float32Array(4);
gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, pixels);

// Assert
assertApproxEqual(pixels[0], expected.vx, 0.001);
```

**Migration Path:**

1. **Phase 1 (Current):** DIY GPGPU with Puppeteer
   - File: `test/unit/coordinate-jacobian-numerical.cjs`
   - Use for integration testing (full system validation)
   - Keep for debugging (can run non-headless to see visual output)

2. **Phase 2 (Future):** Add headless-gl for unit tests
   - Create: `test/unit/shader-unit-tests.cjs`
   - Use for fast unit-level shader validation
   - Run in CI for quick feedback

3. **Phase 3:** Optimize test suite
   - Puppeteer: Integration tests only (1-2 key tests)
   - headless-gl: Unit tests (10+ fast tests)
   - Total test time: <5 seconds instead of >30 seconds

**Challenges:**
- Requires native compilation (C++ dependencies via node-gyp)
- May have platform-specific installation issues
- Behavior might differ slightly from real browsers

**When to Migrate:**
- When shader tests become a bottleneck (>10 seconds total)
- When adding many new coordinate systems or transforms
- When setting up CI/CD pipeline for automated testing

**References:**
- npm: https://www.npmjs.com/package/gl
- GitHub: https://github.com/stackgl/headless-gl
- Built on ANGLE (same backend as Chrome on Windows)

---

## Other Future Enhancements

### Coordinate Systems
- Export/import custom coordinate system presets
- Coordinate system templates for common systems (bipolar, parabolic, elliptic)
- Visual coordinate grid overlay (show r, θ grid lines)
- Automatic coordinate system suggestion based on equations
- Variable-radius spherical coordinates (r as function of θ, φ)
- Time-dependent coordinate transformations

### Rendering
- Complete bloom effect tuning
- Add more tone mapping operators (Tony McMapface, AgX, Khronos PBR Neutral)
- Support for custom tone mapping curves
- Screen-space ambient occlusion for particle density
- Temporal anti-aliasing (TAA)

### Performance
- WebGL 2.0 support for transform feedback
- Compute shader support (WebGPU)
- Particle system LOD (fewer particles when zoomed out)
- Spatial hashing for collision detection

### Interactivity
- Mouse interaction (attract/repel particles)
- Real-time parameter tweening
- Preset morphing (smooth transition between systems)
- Audio-reactive parameters
