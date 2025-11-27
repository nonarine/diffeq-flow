# Known Issues and Future Work

## Bugs to Fix

### 1. Accordion Auto-Resize Not Working Correctly ⚠️ HIGH PRIORITY
**Issue**: Accordion sections don't automatically resize when content changes (controls show/hide, animation bounds appear/disappear, etc.). This has been attempted to fix ~10 times but keeps breaking.

**Current Status**:
- ✅ `AccordionAwareMixin` already exists at `src/ui/mixins/accordion-aware-mixin.js`
- ✅ Uses ResizeObserver for automatic detection
- ❌ **Problem**: Not all controls are using the mixin
- ❌ Manual `resizeAccordion()` calls still scattered throughout codebase

**Symptoms**:
- Controls get clipped/hidden when they appear
- Accordion sections don't expand to fit new content
- Inconsistent behavior across different controls

**Root Cause**:
The mixin exists but isn't being applied consistently. Some controls use it, some don't. The manual fallback calls aren't reliable.

**Proposed Solution**:
**Apply AccordionAwareMixin to ALL dynamic controls**:
1. Audit all web components to see which need the mixin
2. Apply mixin to: AnimatableSlider, AnimatableTimestep, SelectControl, CheckBox, etc.
3. Remove all manual `resizeAccordion()` calls from controls-registry.js and other files
4. Test each accordion section to ensure auto-resize works

**Alternative Solution (if mixin doesn't work)**:
Create a dedicated `<accordion-section>` web component with built-in MutationObserver that watches all child changes, not just ResizeObserver.

**Files to Update**:
- `src/ui/web-components/*.js` - Add AccordionAwareMixin to all dynamic controls
- `src/ui/controls-registry.js` - Remove manual `resizeAccordion()` calls
- `src/ui/custom-controls.js` - Remove manual `resizeAccordion()` calls

**Effort**: ~2-3 hours
**Priority**: HIGH (affects user experience significantly)

---

### 2. Gradient Color Interpolation Discontinuity at 360° 🎨
**Issue**: When using gradients for velocity angle coloring, there's a visible discontinuity/seam at 360° (which wraps to 0°). Even with a continuous gradient, the interpolation creates a visible break.

**Expected Behavior**: Smooth color transition from 359° → 0° (red → red in HSV wheel)

**Current Behavior**: Visible color jump/discontinuity at the boundary

**Possible Causes**:
1. Linear interpolation in RGB space instead of HSV space
2. Gradient not wrapping correctly (last stop at 360° should equal first stop at 0°)
3. Angle normalization issue in shader code
4. Gradient stops don't form a proper color wheel

**Files to Investigate**:
- `src/math/gradients.js` - Gradient generation and GLSL code
- `src/math/colors.js` - Velocity angle color mode implementation
- `src/webgl/shaders.js` - Draw shader color computation

**Proposed Fix**:
1. For velocity angle mode, ensure gradient wraps: last color stop = first color stop
2. Use modulo arithmetic in shader to handle 360° → 0° wrap
3. Consider HSV interpolation instead of RGB for angle-based gradients
4. Or: duplicate first color stop at position 1.0 to force wrap

**Effort**: ~1-2 hours
**Priority**: MEDIUM (cosmetic issue, doesn't affect functionality)

---

## Refactoring Completed ✅

### Phase 3: Split controls-v2.js (2025-11-27)
- ✅ 2,043-line monolith split into 8 focused modules
- ✅ controls-v2.js deleted entirely (now imports from controls-registry.js)
- ✅ Clear separation of concerns
- ✅ All functionality preserved
- ✅ No breaking changes to API

**Files Created**:
1. `src/ui/controls-registry.js` (781 lines) - Main orchestrator
2. `src/ui/visibility-manager.js` (72 lines) - UI visibility logic
3. `src/ui/settings-manager.js` (436 lines) - Settings persistence
4. `src/ui/preset-manager.js` (413 lines) - Preset management
5. `src/ui/animation-setup.js` (400 lines) - Animation controls
6. `src/ui/panel-controllers/gradient-panel.js` (122 lines)
7. `src/ui/panel-controllers/rendering-panel.js` (100 lines)
8. `src/ui/panel-controllers/mobile-panel-manager.js` (250 lines)

**Total**: ~2,574 lines across 8 well-organized modules (vs 2,043 in monolith)

---

## Next Steps

### Immediate Tasks
- [ ] Test all functionality after Phase 3 refactoring
  - [ ] Gradient panel opens/closes correctly
  - [ ] Rendering panel opens/closes correctly
  - [ ] Preset loading (built-in and custom)
  - [ ] Settings save/restore from localStorage
  - [ ] Animation controls and frame capture

### Priority Fixes
1. **Fix accordion auto-resize** - Apply AccordionAwareMixin universally
2. **Fix gradient 360° discontinuity** - Ensure proper color wrapping

### Future Refactoring (Phases 4-5)
- Phase 4: Update remaining panel usage patterns
- Phase 5: Cleanup and documentation
