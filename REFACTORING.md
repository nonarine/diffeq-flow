# UI Refactoring Progress Tracker

**Goal**: Improve debuggability by creating single-concern modules and eliminating code duplication.

**Status**: Not Started

**Detailed Plan**: See `/home/pfrost/.claude/plans/structured-floating-rose.md`

---

## Archiving Strategy

**Important**: Before refactoring any large file, we archive it to prevent accidentally adding to the monolith.

**Archive Location**: `src/archive/refactoring-2025-11-27/`

**Process**:
1. Copy file to archive before making changes
2. Reference archived file during refactoring
3. Create NEW focused files from archived content
4. Delete or slim down original file (never add to it)

**Benefits**:
- Prevents accidentally adding to monolithic files
- Keeps original as reference
- Makes it clear which code is legacy vs refactored

---

## Quick Reference: What's Wrong Now

- ❌ `controls-v2.js`: 2,058 lines with 10+ responsibilities
- ❌ Z-index values scattered across 3 files (20+ locations)
- ❌ Panel show/hide logic duplicated 3 times (gradient, rendering, mobile)
- ❌ 1,700+ lines of inline CSS in `index.html`
- ❌ Mobile breakpoint (768px) hardcoded in 5+ locations

---

## Phase 1: Foundation - Core Utilities ✅ COMPLETE

**Goal**: Create utilities for the most heavily duplicated code patterns.

### Tasks

- [x] 1.1 Create `src/ui/utils/z-index.js`
  - Centralized z-index constants (eliminates 20+ scattered definitions)
  - `lowerMenuBar()` / `restoreMenuBar()` helpers
  - Added helper functions: `getZIndex()`, `getLayersSorted()`

- [x] 1.2 Create `src/ui/utils/mobile.js`
  - `MOBILE_BREAKPOINT` constant
  - `isMobile()` / `isDesktop()` functions
  - `onBreakpointChange()` helper
  - Added utilities: `executeForViewport()`, `getMobileMediaQuery()`, `getDesktopMediaQuery()`

- [x] 1.3 Create `src/ui/utils/panel-manager.js`
  - `PanelManager` class with full show/hide/toggle logic
  - Unified z-index management (eliminates 42+ duplicate operations)
  - Automatic menu bar lowering on mobile
  - `PanelGroup` class for managing multiple panels
  - Added utilities: `wireCloseButton()`, `destroy()`, `setZIndex()`

- [x] 1.4 Update existing panels to use new utilities
  - Updated gradient panel to use `PanelManager`
  - Updated rendering panel to use `PanelManager`
  - Updated mobile panel manager to use `ZIndex` constants and `renderingPanelManager`
  - Replaced all hardcoded z-index values with `ZIndex` constants
  - Replaced all `window.innerWidth <= 768` checks with centralized constants

### Verification
- [x] All three utility files created and documented
- [x] Gradient panel, rendering panel, and mobile panels updated
- [x] Z-index constants used instead of hardcoded values
- [ ] **Testing Required**: Manual verification needed for panel behavior

**Files Created**: 3/3 ✅
**Code Updated**: Gradient panel, rendering panel, mobile panel manager
**Status**: ✅ Complete (Pending Manual Testing)

---

## Phase 2: CSS Extraction ✅ COMPLETE

**Goal**: Move 1,700+ lines of inline CSS to organized external files.

### Tasks

- [x] 2.0 **Archive original file**
  - [x] Create `src/archive/refactoring-2025-11-27/` directory
  - [x] Copy `index.html` to `src/archive/refactoring-2025-11-27/index.html.bak`
  - [x] Use archived copy as reference during extraction

- [x] 2.1 Create CSS file structure
  - [x] Create `src/ui/styles/` directory
  - [x] `src/ui/styles/z-index.css` - CSS custom properties for z-index (93 lines)
  - [x] `src/ui/styles/theme.css` - Light/dark theme definitions (~250 lines)
  - [x] `src/ui/styles/layout.css` - Canvas, grid, basic layout (~100 lines)
  - [x] `src/ui/styles/controls.css` - Control panels, inputs, sliders (~700 lines)
  - [x] `src/ui/styles/panels.css` - Floating panels, modal, overlays (~450 lines)
  - [x] `src/ui/styles/mobile.css` - Mobile-specific styles, media queries (~330 lines)

- [x] 2.2 Extract styles from `index.html`
  - [x] Copy styles to appropriate CSS files
  - [x] Replace inline `<style>` tag with `<link>` tags
  - [ ] **Testing Required**: Test desktop view
  - [ ] **Testing Required**: Test mobile view
  - [ ] **Testing Required**: Test light theme
  - [ ] **Testing Required**: Test dark theme

- [x] 2.3 Update `floating-panels.css`
  - [x] Replace hardcoded z-index with CSS custom properties
  - [x] Added --z-coordinate-editor, --z-gradient-panel, --z-rendering-panel to z-index.css

### Verification
- [ ] **Testing Required**: All styles apply correctly in desktop view
- [ ] **Testing Required**: All styles apply correctly in mobile view
- [ ] **Testing Required**: Theme switching works correctly
- [ ] **Testing Required**: No visual regressions

**Files Created**: 6/6 ✅
**index.html Reduction**: 1,733 lines removed (from ~1,750 to ~19 lines in <head>)
**Status**: ✅ Complete (Pending Manual Testing)

---

## Phase 3: Split controls-v2.js ✅ COMPLETE

**Goal**: Break 2,058-line monolith into focused, single-concern modules.

### Tasks

- [x] 3.0 **Archive original file**
  - [x] Copy `src/ui/controls-v2.js` to `src/archive/refactoring-2025-11-27/controls-v2.js.bak`
  - [x] Use archived copy as reference during extraction
  - [x] **CRITICAL**: Only create NEW files, never add code to controls-v2.js

- [x] 3.1 Create new module files
  - [x] `src/ui/panel-controllers/` directory
  - [x] `src/ui/panel-controllers/gradient-panel.js` (122 lines)
  - [x] `src/ui/panel-controllers/rendering-panel.js` (100 lines)
  - [x] `src/ui/panel-controllers/mobile-panel-manager.js` (250 lines)
  - [x] `src/ui/preset-manager.js` (413 lines)
  - [x] `src/ui/settings-manager.js` (436 lines)
  - [x] `src/ui/visibility-manager.js` (72 lines)
  - [x] `src/ui/animation-setup.js` (400 lines)
  - [x] `src/ui/controls-registry.js` (781 lines)

- [x] 3.2 Extract and migrate code (from archived copy)
  - [x] Extract gradient panel logic
  - [x] Extract rendering panel logic
  - [x] Extract mobile panel manager
  - [x] Extract preset management
  - [x] Extract settings persistence
  - [x] Extract visibility toggles
  - [x] Extract animation controls
  - [x] Extract control registration

- [x] 3.3 Slim down `controls-v2.js` (or replace entirely)
  - [x] Option C: Delete entirely and update imports ✅ Selected
    - [x] Update main.js to import from controls-registry.js
    - [x] Delete controls-v2.js (no longer needed)
    - [x] Clean up imports throughout codebase

### Verification
- [ ] **Testing Required**: All panels work correctly
- [ ] **Testing Required**: Presets save/load/delete correctly
- [ ] **Testing Required**: Settings persistence works
- [ ] **Testing Required**: Animation controls work
- [ ] **Testing Required**: No JavaScript errors
- [ ] **Testing Required**: All features functional

**Files Created**: 8/8 ✅
**Lines Reduced**: 2,043 → 0 (controls-v2.js deleted entirely!)
**Total Code**: ~2,574 lines across 8 focused modules (organized and maintainable)
**Status**: ✅ Complete (Pending Manual Testing)

---

## Phase 4: Update Panel Usage ⏳ NOT STARTED

**Goal**: Replace all duplicate show/hide logic with `PanelManager`.

### Tasks

- [ ] 4.1 Update gradient panel
  - [ ] Refactor to use `PanelManager`
  - [ ] Remove old show/hide logic
  - [ ] Test on desktop
  - [ ] Test on mobile

- [ ] 4.2 Update rendering panel
  - [ ] Refactor to use `PanelManager`
  - [ ] Remove old show/hide logic
  - [ ] Test on desktop
  - [ ] Test on mobile

- [ ] 4.3 Update mobile panel manager
  - [ ] Refactor to use `PanelManager` for each panel
  - [ ] Remove custom logic
  - [ ] Test all mobile panels

### Verification
- [ ] Gradient panel: Desktop ✓ Mobile ✓
- [ ] Rendering panel: Desktop ✓ Mobile ✓
- [ ] Controls panel: Mobile ✓
- [ ] Z-index hierarchy correct
- [ ] No duplicate code remains

**Duplications Eliminated**: 0/3
**Status**: ⏳ Not Started

---

## Phase 5: Cleanup & Documentation ⏳ NOT STARTED

**Goal**: Remove remaining duplicates and document new structure.

### Tasks

- [ ] 5.1 Remove duplicate code
  - [ ] Delete old show/hide functions
  - [ ] Remove hardcoded z-index values
  - [ ] Remove hardcoded mobile breakpoints

- [ ] 5.2 Update `floating-panels.css`
  - [ ] Use CSS custom properties for all z-index

- [ ] 5.3 Add JSDoc comments
  - [ ] Document `z-index.js`
  - [ ] Document `mobile.js`
  - [ ] Document `panel-manager.js`
  - [ ] Document all new modules

- [ ] 5.4 Update `CLAUDE.md`
  - [ ] Add "UI Code Organization" section
  - [ ] Document new file structure
  - [ ] Add debugging guide

### Verification
- [ ] Full regression test on desktop
- [ ] Full regression test on mobile
- [ ] All features working
- [ ] No console errors
- [ ] Code is well-documented

**Status**: ⏳ Not Started

---

## Success Metrics

### Before Refactoring
- ❌ controls-v2.js: 2,058 lines
- ❌ Z-index: 20+ locations across 3 files
- ❌ Panel show/hide: 3 duplicate implementations
- ❌ Mobile breakpoint: 5+ hardcoded locations
- ❌ CSS: 1,700+ lines inline in index.html

### After Refactoring (Target)
- ✅ Largest file: ~500 lines
- ✅ Z-index: 1 JS file + 1 CSS file
- ✅ Panel logic: 1 `PanelManager` utility
- ✅ Mobile detection: 1 utility
- ✅ CSS: Organized into 6 logical files

### Debuggability Goals
- ✅ Z-index issue? → Check `z-index.js` + `panel-manager.js` only
- ✅ Panel not showing? → Check `panel-controllers/[panel-name].js`
- ✅ Mobile issue? → Check `mobile.js` + `styles/mobile.css`

---

## Time Estimates

| Phase | Estimated Time | Actual Time | Status |
|-------|----------------|-------------|--------|
| Phase 1 | 2-3 hours | ~1 hour | ✅ Complete (Testing Pending) |
| Phase 2 | 3-4 hours | ~1.5 hours | ✅ Complete (Testing Pending) |
| Phase 3 | 4-5 hours | ~1 hour | ✅ Complete (Testing Pending) |
| Phase 4 | 2-3 hours | - | ⏳ Not Started |
| Phase 5 | 1-2 hours | - | ⏳ Not Started |
| **Total** | **12-17 hours** | **~3.5 hours** | **~21% Complete** |

---

## Session Notes

### Session 1 (2025-11-27)
- Investigated z-index stacking issue on mobile (gradient/rendering/controls panels behind menu bar)
- Fixed by adding inline style overrides in JavaScript (temporary solution)
- Identified root cause: z-index scattered across 3 files, panel logic duplicated 3 times
- Ran comprehensive codebase analysis:
  - controls-v2.js: 2,058 lines with 10+ responsibilities
  - Z-index in 20+ locations
  - 1,700+ lines inline CSS
  - Mobile breakpoint hardcoded 5+ times
- Created detailed refactoring plan (5 phases)
- Created this tracking document
- **Implemented Phase 1: Foundation - Core Utilities**
  - Created `src/ui/utils/z-index.js` with centralized z-index constants
  - Created `src/ui/utils/mobile.js` with mobile detection utilities
  - Created `src/ui/utils/panel-manager.js` with unified panel management
  - Updated gradient panel, rendering panel, and mobile panel manager to use new utilities
  - Replaced hardcoded values with constants throughout
- **Added Archiving Strategy**
  - User requested archiving step before refactoring large files
  - Prevents accidentally adding to monolithic files during refactoring
  - Archive location: `src/archive/refactoring-2025-11-27/`
  - Updated Phase 2 and Phase 3 tasks to include archiving steps
- **Implemented Phase 2: CSS Extraction**
  - Archived `index.html` to `src/archive/refactoring-2025-11-27/index.html.bak`
  - Created `src/ui/styles/` directory
  - Extracted 1,733 lines of inline CSS to 6 organized files:
    - `z-index.css` (93 lines) - CSS custom properties for all z-index values
    - `theme.css` (~250 lines) - All light-theme overrides
    - `layout.css` (~100 lines) - Reset, body, canvas, grid, menu bar
    - `controls.css` (~700 lines) - All control panels, inputs, sliders
    - `panels.css` (~450 lines) - Floating panels, modals, overlays
    - `mobile.css` (~330 lines) - Mobile-specific styles and @media query
  - Replaced `<style>` tag in index.html with 6 `<link>` tags
  - Updated `floating-panels.css` to use CSS custom properties for z-index
  - Added `--z-coordinate-editor`, `--z-gradient-panel`, `--z-rendering-panel` to z-index.css
  - Removed all hardcoded z-index values from floating-panels.css
- Status: Phase 2 complete (needs manual testing), ready for Phase 3

### Session 2 (2025-11-27 continued) ✅ COMPLETE
- **Implemented Phase 3: Split controls-v2.js**
  - Archived `controls-v2.js` to `archive/refactoring-2025-11-27/controls-v2.js.bak`
  - Created `src/ui/panel-controllers/` directory
  - Ran comprehensive Task agent analysis of 2,043-line monolith (created REFACTORING_ANALYSIS.md)
  - Extracted 8 modules in recommended order:
    1. ✅ `visibility-manager.js` (72 lines) - Pure UI visibility functions
    2. ✅ `settings-manager.js` (436 lines) - Settings persistence, URL encoding/decoding
    3. ✅ `preset-manager.js` (413 lines) - Built-in + custom preset management
    4. ✅ `panel-controllers/gradient-panel.js` (122 lines) - Gradient editor panel
    5. ✅ `panel-controllers/rendering-panel.js` (100 lines) - Rendering settings panel
    6. ✅ `animation-setup.js` (400 lines) - Animation controls and frame capture
    7. ✅ `panel-controllers/mobile-panel-manager.js` (250 lines) - Mobile overlay panels
    8. ✅ `controls-registry.js` (781 lines) - Main orchestration logic
  - Updated main.js to import directly from controls-registry.js
  - Deleted controls-v2.js entirely (no longer needed)
  - **Result**: 2,043-line monolith → 0 lines, functionality split into 8 focused modules
- Status: Phase 3 complete ✅ (manual testing complete)
- **Testing Results**:
  - ✅ Page loads without errors
  - ✅ Gradient panel opens/closes correctly
  - ✅ Rendering panel opens/closes correctly (including mobile)
  - ✅ Presets load correctly
  - ✅ Settings save/restore works
  - ✅ Animation controls functional
- **Cleanup**:
  - Deleted obsolete `animation-controls.js` (replaced by `animation-setup.js`)
  - Archived analysis docs to `archive/docs/`
  - Updated CLAUDE.md with Phase 3 architecture

**Lessons Learned**:
1. Using Task agents for parallel extraction saved significant time (~3 hours vs estimated 4-5)
2. Archiving strategy prevented accidental additions to monolithic files
3. Extracting functions instead of classes simplified the refactoring
4. Maintaining backward compatibility (same API) allowed incremental testing

---

## Quick Start (Next Session)

1. Read this file to see current progress
2. Check which phase is in progress
3. Pick up from the next unchecked task
4. Update checkboxes as you complete tasks
5. Add session notes at the bottom

**Current Phase**: Phase 3 Complete ✅
**Next Task**: Fix known issues (accordion auto-resize, gradient discontinuity) then proceed to Phase 4
