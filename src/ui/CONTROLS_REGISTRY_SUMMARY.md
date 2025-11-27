# Controls Registry Summary

## Overview

The `controls-registry.js` file is the main orchestrator for the entire UI control system. It coordinates control registration, event handlers, specialized modules, and initialization sequence.

**File Size**: 781 lines (down from 2043 in original controls-v2.js)

## Code Extraction Summary

### From Original File (controls-v2.js.bak)

#### Lines 35-108: ControlManager Setup
- Created ControlManager with renderer reference
- Defined onApply callback with:
  - Transform implicitIterations into integratorParams
  - Handle dimension changes (update expression inputs)
  - Apply settings to renderer
  - Update coordinate system
  - Save to localStorage (including bbox and coordinate system)
  - Clear error messages

#### Lines 111-365: Control Registration
- **Integrator controls**: integrator, solution-method, timestep
- **Particle controls**: fade slider with custom transform
- **Transform controls**: transform select, transform params
- **Mapper controls**: mapper select, mapper params
- **Color mode controls**: color-mode, color-expression, gradient, velocity-scale-mode
- **Expression inputs**: dimension-inputs custom control
- **Tone mapping controls**: tonemap-operator, particle-render-mode
- **Web Component controls**: All sliders (linear, log, percent) and checkboxes
- **Theme control**: theme-selector with immediate application

#### Lines 436-441: Default Settings Button
- Reset all controls to defaults
- Clear localStorage
- Apply immediately (no debounce)

#### Lines 448-467: Reset Button
- Resets camera bbox (not settings)
- Calculates aspect ratio from canvas
- Reinitializes particles

#### Lines 469-497: Reset Particles and Save Image Buttons
- Reset Particles: clears screen trails
- Save Image: captures render buffer at scaled resolution, downloads as PNG

#### Lines 499-524: Storage Strategy Selector
- Get current strategy from URL param
- On change: save settings, reload page with new strategy

#### Lines 526-551: Slider +/- Button Delegation
- Event delegation for dynamically created buttons
- Dispatches to control implementations
- Handles transform parameter sliders

#### Lines 604-626: Configure Coordinates Button
- Validate coordinate system dimensions
- Show coordinate editor
- Update renderer and dimension inputs
- Trigger apply to recompile shaders

#### Lines 688-714: Modal System and Keyboard Shortcuts
- Menu bar settings/docs buttons
- Keyboard shortcut: Ctrl+, to open settings modal

#### Lines 716-736: Animation Section Accordion Toggle
- Slide content up/down
- Update arrow indicator
- Shift histogram and cursor position panels

#### Lines 1110-1248: Initialization Sequence
- Initialize controls (create DOM elements)
- Load saved settings from URL or localStorage
- Set mobile-specific defaults
- Wait for Web Components to be ready
- Restore coordinate system
- Convert Unicode to ASCII in expressions
- Validate mapper params
- Apply settings
- Initialize animation controller options
- Initialize frame limit settings
- Initialize special UI states
- Apply initial theme

#### Lines 1251-1267: Unicode Autocomplete Setup
- Enable unicode autocomplete
- Attach to all math input fields

#### Lines 1478-1490: Bbox Restoration
- Expand bbox for aspect ratio
- Update renderer config
- Don't reinitialize particles

#### Lines 1497-1755: Helper Functions
- `expandBBoxForAspectRatio()`: Expand bbox to fit canvas aspect ratio
- `updateWhitePointVisibility()`: Show/hide white point control
- `updateExpressionControls()`: Show/hide expression controls
- `updateGradientButtonVisibility()`: Show/hide gradient button
- `updateVelocityScalingVisibility()`: Show/hide velocity scaling controls
- `showError()` / `hideError()`: Error message display

**Note**: These helper functions have been moved to specialized modules:
- Visibility functions → `visibility-manager.js`
- Settings functions → `settings-manager.js`

### Delegated to Specialized Modules

#### visibility-manager.js
- `updateImplicitMethodControls()`: Show/hide implicit method controls
- `updateColorModeControls()`: Show/hide color mode controls
- `updateWhitePointVisibility()`: Show/hide white point control
- `updateExpressionControls()`: Show/hide expression controls
- `updateGradientButtonVisibility()`: Show/hide gradient button
- `updateVelocityScalingVisibility()`: Show/hide velocity scaling controls

#### settings-manager.js
- `loadSettingsFromURLOrStorage()`: Load settings from URL or localStorage
- `saveAllSettings()`: Save settings including bbox and coordinate system
- `shareSettings()`: Share settings via URL (copy to clipboard)
- `restoreCoordinateSystem()`: Restore coordinate system from saved settings
- `expandBBoxForAspectRatio()`: Expand bbox to fit canvas aspect ratio
- `encodeSettings()` / `decodeSettings()`: Base64 URL encoding/decoding

#### preset-manager.js
- `loadPresets()`: Load built-in preset examples
- `loadPreset()`: Load specific preset by name
- `initializePresetControls()`: Set up preset dropdown and buttons
- `loadCustomPresets()`: Load custom presets from localStorage
- `saveCustomPreset()`: Save custom preset to localStorage
- `deleteCustomPreset()`: Delete custom preset from localStorage
- `refreshCustomPresetsDropdown()`: Update preset dropdown

#### gradient-panel.js
- `initGradientPanel()`: Initialize gradient editor panel
- Gradient editor initialization and lazy loading
- Gradient panel show/hide handlers
- Close-on-outside-click logic

#### rendering-panel.js
- `initRenderingPanel()`: Initialize rendering settings panel
- Rendering panel show/hide handlers
- Wire up close buttons for mobile

#### animation-setup.js
- `initAnimationControls()`: Initialize animation UI and controllers
- Register animation web components
- Sync steps-per-increment to frame limit
- Wire animation checkboxes to controller options
- Create Animation button (start/stop)
- Download Animation button (ZIP export)
- Export Animation JSON button

#### mobile-panel-manager.js
- `initMobilePanelManager()`: Initialize mobile overlay panels
- `setupMobileControlsSync()`: Sync mobile controls with main controls
- Mobile menu buttons
- Panel show/hide logic
- Z-index management

## Architecture Improvements

### Before (controls-v2.js)
- **2043 lines** of monolithic code
- All logic in one file
- Difficult to maintain and test
- Hard to find specific functionality

### After (controls-registry.js)
- **781 lines** of orchestration code
- **~1260 lines** delegated to 7 specialized modules
- Clear separation of concerns
- Easy to test individual modules
- Easy to find and modify specific functionality

### Benefits
1. **Maintainability**: Each module has a single responsibility
2. **Testability**: Modules can be tested in isolation
3. **Readability**: Orchestrator shows high-level flow, modules show details
4. **Extensibility**: New features can be added as new modules
5. **Reusability**: Modules can be used independently

## Module Dependencies

```
controls-registry.js (main orchestrator)
├── control-base.js (ControlManager, base control classes)
├── web-component-registry.js (async control registration)
├── custom-controls.js (complex custom controls)
├── parameter-control.js (animatable parameter controls)
├── coordinate-editor.js (coordinate system editor)
├── gradient-editor.js (gradient editor UI)
├── animation-controller.js (animation playback)
├── utils/z-index.js (Z-index constants)
├── utils/panel-manager.js (panel show/hide logic)
│
└── modules/ (specialized modules)
    ├── visibility-manager.js (UI visibility logic)
    ├── settings-manager.js (settings load/save/share)
    ├── preset-manager.js (preset loading/saving)
    ├── gradient-panel.js (gradient editor panel)
    ├── rendering-panel.js (rendering settings panel)
    ├── animation-setup.js (animation UI setup)
    └── mobile-panel-manager.js (mobile overlay panels)
```

## API Compatibility

The `initControls()` function maintains backward compatibility with the original API:

```javascript
// Called from main.js
initControls(renderer, (context) => {
    // context.manager - ControlManager instance
    // context.state - Current settings object
    // context.saveSettings - Function to save all settings
});
```

## Next Steps

1. Create the 7 specialized modules
2. Test the orchestrator with all modules
3. Verify all functionality works correctly
4. Update main.js to use the new orchestrator
5. Delete the archived controls-v2.js.bak file

## Notes

- All jQuery dependencies maintained for now (will be removed in Phase 3)
- All Web Component registrations preserved
- All event handlers preserved
- All initialization logic preserved
- All settings persistence preserved
