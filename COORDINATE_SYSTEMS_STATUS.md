# Alternate Coordinate Systems Implementation Status

**Date**: 2025-11-14
**Status**: Core Implementation Complete, UI Integration Pending

## Overview

Implementing support for alternate coordinate systems (polar, spherical, cylindrical, etc.) to allow users to define differential equations in their natural coordinate representation. The system automatically converts between user-defined coordinates and Cartesian coordinates for integration.

## Architecture

**Flow**:
1. User defines vector field in alternate coordinates (e.g., `dr/dt = r*(1-r)`, `dθ/dt = 1`)
2. System transforms position from Cartesian to native coordinates
3. Evaluates user's velocity expressions in native coordinates
4. Transforms velocity back to Cartesian using auto-computed Jacobian
5. Integration happens in Cartesian space (all existing integrators work unchanged)

**Key Design Decisions**:
- Coordinate transforms are preprocessing layer (not domain transforms)
- Jacobians are auto-computed symbolically via existing Nerdamer integration
- Unicode autocomplete for Greek letters (theta → θ, phi → φ)
- Per-dimension coordinate definitions (label + transform expression)
- Math parser used for all transformations (no raw GLSL required)

---

## ✅ Completed Components

### 1. Unicode Autocomplete System
**File**: `src/ui/unicode-autocomplete.js`

**Features**:
- Automatic replacement of ASCII names with Unicode symbols
- Global enable/disable toggle
- Symbol map: alpha→α, beta→β, theta→θ, phi→φ, etc.
- Bidirectional conversion (Unicode ↔ ASCII) for parsing
- Attaches to any text input element

**Status**: ✅ Complete

---

### 2. Coordinate Systems Module
**File**: `src/math/coordinate-systems.js`

**Features**:
- `CoordinateSystem` base class with:
  - Variable names and display labels
  - Forward transform expressions (Cartesian → Native)
  - GLSL code generation for transforms
  - GLSL code generation for Jacobian velocity transforms
  - JSON serialization for storage

**Preset Systems**:
- **2D**: Cartesian, Polar (r, θ)
- **3D**: Cartesian, Cylindrical (ρ, φ, z), Spherical (r, θ, φ)
- **4D**: Cartesian, Hyperspherical (r, θ, φ, ψ)

**Example - Polar 2D**:
```javascript
{
  name: "Polar 2D",
  dimensions: 2,
  variables: [
    { label: "r", displayLabel: "r" },
    { label: "theta", displayLabel: "θ" }
  ],
  forwardTransforms: [
    "sqrt(x^2 + y^2)",  // r = √(x² + y²)
    "atan(y, x)"        // θ = atan2(y, x)
  ]
}
```

**Status**: ✅ Complete

---

### 3. Symbolic Jacobian Computation
**File**: `src/math/jacobian.js` (pre-existing)

**Features**:
- Uses Nerdamer for symbolic differentiation
- Computes full Jacobian matrix
- Expression optimization (replaces `pow(x,2)` with `x*x`)
- Used by coordinate systems to auto-generate velocity transforms

**Status**: ✅ Already existed, reused

---

### 4. Parser Updates
**File**: `src/math/parser.js`

**Changes**:
- `parseExpression(expr, dimensions, customVariables = null)`
- `parseVectorField(expressions, customVariables = null)`
- `createVelocityEvaluators(expressions, customVariables = null)`
- Backward compatible (defaults to `['x', 'y', 'z', 'w', ...]`)

**Status**: ✅ Complete

---

### 5. Shader Generation Updates
**File**: `src/webgl/shaders.js`

**Changes**:
- `generateUpdateFragmentShader(..., coordinateSystemCode = null)`
- `generateDrawVertexShader(..., coordinateSystemCode = null)`

**Generated Code Structure** (when coordinate system active):
```glsl
// Forward transform: Cartesian → Native
vec2 transformToNative(vec2 pos) { ... }

// Velocity transform: Native → Cartesian via Jacobian
vec2 transformVelocityToCartesian(vec2 vel_native, vec2 pos) { ... }

// User velocity in native coordinates
vec2 get_velocity_native(vec2 pos_native) {
    vec2 result;
    result.x = r * (1.0 - r);  // dr/dt
    result.y = 1.0;             // dθ/dt
    return result;
}

// Velocity in Cartesian (used by integrator)
vec2 get_velocity(vec2 pos_cartesian) {
    vec2 pos_native = transformToNative(pos_cartesian);
    vec2 vel_native = get_velocity_native(pos_native);
    return transformVelocityToCartesian(vel_native, pos_cartesian);
}
```

**Status**: ✅ Complete

---

### 6. Renderer Integration
**File**: `src/webgl/renderer.js`

**Changes**:
- Added `this.coordinateSystem` property (defaults to Cartesian)
- Import `getCartesianSystem` from coordinate-systems module
- `compileShaders()` method:
  - Gets coordinate variable names from system
  - Passes custom variables to parser
  - Generates coordinate transform GLSL code
  - Passes coordinate code to shader generators
- Updated velocity evaluator creation to use coordinate variables

**Status**: ✅ Complete

---

### 7. Coordinate Editor UI
**File**: `src/ui/coordinate-editor.js`

**Features**:
- Floating panel interface (matches gradient-editor.js pattern)
- Preset dropdown (Cartesian, Polar, Spherical, etc.)
- Per-dimension coordinate definition rows:
  - Label input (display name, e.g., "θ")
  - Transform expression input (e.g., "atan(y, x)")
- Unicode autocomplete on all inputs
- Apply/Cancel buttons
- Drag-to-move panel
- Automatic preset selection for current dimensions

**Status**: ✅ Complete (not yet wired to UI)

---

## 🔄 Remaining Work

### 1. Add Coordinate System Button to UI
**File**: `index.html` + `src/ui/controls-v2.js`

**Tasks**:
- Add "Configure Coordinates" button in "Display & Projection" accordion
- Wire button to call `showCoordinateEditor()` from coordinate-editor.js
- Pass current dimensions, coordinate system, and callback

**Estimated Effort**: 30 minutes

---

### 2. Update DimensionInputsControl
**File**: `src/ui/custom-controls.js`

**Tasks**:
- Update dimension input labels to use coordinate system variable names
- Change `dx/dt =` to `dr/dt =`, `dθ/dt =`, etc. based on current system
- Update info text to show current coordinate variables

**Example**:
```javascript
// Current: "dx/dt = ...", "dy/dt = ..."
// New:     "dr/dt = ...", "dθ/dt = ..." (when polar coordinates active)
```

**Estimated Effort**: 20 minutes

---

### 3. Settings Persistence
**File**: `src/ui/controls-v2.js` (ControlManager)

**Tasks**:
- Add coordinate system to settings save/restore
- Serialize `CoordinateSystem` to JSON
- Deserialize from JSON on load
- Call `renderer.updateConfig({ coordinateSystem: ... })` on restore

**Storage Format**:
```javascript
{
  coordinateSystem: {
    name: "Polar 2D",
    dimensions: 2,
    variables: [...],
    forwardTransforms: [...]
  }
}
```

**Estimated Effort**: 30 minutes

---

### 4. Include New Modules in index.html
**File**: `index.html`

**Tasks**:
- Add `<script type="module" src="src/ui/unicode-autocomplete.js"></script>`
- Add `<script type="module" src="src/math/coordinate-systems.js"></script>`
- Add `<script type="module" src="src/ui/coordinate-editor.js"></script>`
- Ensure modules are loaded before main.js

**Note**: Files are already ES6 modules with exports

**Estimated Effort**: 10 minutes

---

### 5. Enable Unicode Autocomplete Globally
**File**: `src/ui/controls-v2.js` or `src/main.js`

**Tasks**:
- Initialize `unicodeAutocomplete.setEnabled(true)` on page load
- Add checkbox in settings panel to toggle autocomplete
- Attach autocomplete to all math input fields:
  - Vector field expressions
  - Custom mapper expressions
  - Color expressions
  - Coordinate transform expressions

**Estimated Effort**: 20 minutes

---

### 6. Handle Coordinate System Changes
**File**: `src/ui/coordinate-editor.js` + `src/ui/controls-v2.js`

**Tasks**:
- When user applies new coordinate system:
  - Call `renderer.updateConfig({ coordinateSystem: newSystem })`
  - Trigger shader recompilation
  - Update DimensionInputsControl labels
  - Save to settings
- Handle dimension changes:
  - Reset to Cartesian when dimensions change
  - Or preserve coordinate type and remap (e.g., 2D Polar → 3D Cylindrical)

**Estimated Effort**: 30 minutes

---

### 7. Testing & Validation

**Test Cases**:

1. **2D Polar Limit Cycle**:
   - Coordinate System: Polar 2D (r, θ)
   - Equations: `dr/dt = r*(1-r)`, `dθ/dt = 1`
   - Expected: Circular limit cycle at radius r=1

2. **3D Spherical Attractor**:
   - Coordinate System: Spherical 3D (r, θ, φ)
   - Equations: `dr/dt = 1-r`, `dθ/dt = 1`, `dφ/dt = 0.5`
   - Expected: Spiral on unit sphere

3. **Integrator Compatibility**:
   - Test Euler, RK2, RK4, Implicit methods
   - All should work unchanged (integration in Cartesian)

4. **Domain Transform Compatibility**:
   - Enable coordinate system + domain transform simultaneously
   - Verify correct layering (coord transform → integrate → domain transform)

5. **Preset Loading**:
   - Load Lorenz attractor preset
   - Switch to spherical coordinates
   - Verify expressions reinterpret correctly

**Estimated Effort**: 1-2 hours

---

## Technical Notes

### Coordinate Transform Order
```
User Equations (Native Coords)
    ↓
Transform to Cartesian (via Jacobian)
    ↓
Domain Transform (optional, for stiff systems)
    ↓
Integration (all methods work)
    ↓
Inverse Domain Transform (optional)
    ↓
Storage (Cartesian)
```

### Variable Name Aliasing
- Parser accepts both "theta" and "θ" (via unicode autocomplete)
- Display uses Unicode symbols
- Internal storage uses ASCII names for compatibility
- GLSL generation uses exact labels from coordinate system

### Jacobian Computation
- Automatic via `computeSymbolicJacobian()` from jacobian.js
- Uses Nerdamer for differentiation
- Cached during shader compilation
- Example (Polar 2D):
  ```
  J = [∂r/∂x   ∂r/∂y  ]   [x/r      y/r     ]
      [∂θ/∂x   ∂θ/∂y  ] = [-y/r²    x/r²    ]

  vel_cartesian = J * vel_native
  ```

### Error Handling
- Invalid coordinate expressions → fallback to Cartesian
- Jacobian computation failure → warning + identity transform
- Parser errors → show user-friendly error message
- Dimension mismatch → auto-reset to Cartesian for new dimension

---

## File Manifest

### New Files Created:
- ✅ `src/ui/unicode-autocomplete.js` (180 lines)
- ✅ `src/math/coordinate-systems.js` (290 lines)
- ✅ `src/ui/coordinate-editor.js` (280 lines)

### Modified Files:
- ✅ `src/math/parser.js` (3 functions updated for custom variables)
- ✅ `src/webgl/shaders.js` (2 shader generators updated)
- ✅ `src/webgl/renderer.js` (constructor + compileShaders updated)

### Files To Modify:
- 🔄 `index.html` (add module imports)
- 🔄 `src/ui/controls-v2.js` (settings persistence, UI button)
- 🔄 `src/ui/custom-controls.js` (DimensionInputsControl labels)

### Pre-existing Files Used:
- ✅ `src/math/jacobian.js` (Nerdamer integration for auto-differentiation)

---

## Next Steps

**Recommended Order**:

1. **Update index.html** (10 min)
   - Add module imports for new files
   - Quick verification that modules load

2. **Add UI Button** (30 min)
   - "Configure Coordinates" button in Display & Projection section
   - Wire to showCoordinateEditor()
   - Test panel opens/closes

3. **Update DimensionInputsControl** (20 min)
   - Dynamic labels based on coordinate system
   - Test label updates

4. **Settings Persistence** (30 min)
   - Save/restore coordinate system
   - Test across page reloads

5. **Enable Unicode Autocomplete** (20 min)
   - Global toggle checkbox
   - Attach to all math inputs
   - Test autocomplete works

6. **Integration Testing** (1-2 hours)
   - Test all presets
   - Test custom coordinates
   - Test with different integrators
   - Verify domain transforms still work

**Total Estimated Time**: 3-4 hours

---

## Success Criteria

- [ ] User can select coordinate system from preset dropdown
- [ ] User can define custom coordinate systems
- [ ] Polar coordinates produce correct circular limit cycle
- [ ] Spherical coordinates work in 3D
- [ ] All integrators work with coordinate systems
- [ ] Domain transforms and coordinate systems work together
- [ ] Settings persist across page reloads
- [ ] Unicode autocomplete works (theta → θ)
- [ ] Dimension labels update based on coordinate system
- [ ] No breaking changes to existing functionality

---

## Future Enhancements (Out of Scope)

- Export/import custom coordinate system presets
- Coordinate system templates for common systems (bipolar, parabolic, etc.)
- Visual coordinate grid overlay (show r, θ grid lines)
- Automatic coordinate system suggestion based on equations
- Variable-radius spherical coordinates (r as function of θ, φ)
- Time-dependent coordinate transformations

---

**Status**: Ready for UI integration and testing phase. Core functionality is complete and follows the existing architectural patterns.
