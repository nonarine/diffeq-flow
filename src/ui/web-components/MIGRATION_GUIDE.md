# Web Component Migration Guide

## Overview

This guide shows how to migrate existing controls to Web Components using the `WebComponentControlRegistry` helper.

**Status (2025-11-20):** Phase 1 complete - 23/25 sliders migrated to Web Components.

See [FUTURE_MIGRATIONS.md](./FUTURE_MIGRATIONS.md) for:
- Current migration status
- Remaining sliders (fade, timestep)
- Phase 2: Mixin-based architecture refactoring plan

## Quick Example

### 1. Update HTML

**Before:**
```html
<div class="control-group">
    <label>Exposure: <span class="range-value" id="exposure-value">1.00</span></label>
    <div class="slider-control">
        <button class="slider-btn" data-slider="exposure" data-action="decrease">-</button>
        <input type="range" id="exposure">
        <button class="slider-btn" data-slider="exposure" data-action="increase">+</button>
        <button class="slider-btn" data-slider="exposure" data-action="reset">↺</button>
    </div>
</div>
```

**After:**
```html
<div class="control-group">
    <log-slider
        id="exposure"
        label="Exposure"
        default="1.0"
        min-value="0.0001"
        max-value="10.0"
        display-format="4">
        <label>
            <span>{{label}}</span>: <span class="range-value" bind-text="value">{{value}}</span>
        </label>
        <div class="slider-control">
            <button class="slider-btn" decrease>-</button>
            <input type="range" min="0" max="100" step="0.1">
            <button class="slider-btn" increase>+</button>
            <button class="slider-btn" reset>↺</button>
        </div>
    </log-slider>
</div>
```

### 2. Update JavaScript

**Before:**
```javascript
const exposureControl = manager.register(new LogSliderControl('exposure', 1.0, {
    minValue: 0.0001,
    maxValue: 10.0,
    displayId: 'exposure-value',
    displayFormat: v => v.toFixed(4)
}));
```

**After:**
```javascript
// Just one line!
webComponentRegistry.register('log-slider', 'exposure');
```

## Benefits

### Code Reduction
- **Before**: ~30 lines (HTML + JS)
- **After**: ~15 lines (declarative HTML only)
- **Savings**: 50% less code

### Automatic Handling
The `WebComponentControlRegistry` automatically handles:
- ✅ Waiting for custom element to be defined
- ✅ Waiting for element to be initialized
- ✅ Registering with ControlManager
- ✅ Attaching change listeners
- ✅ Restoring saved settings
- ✅ Preventing flash on load
- ✅ Preset loading
- ✅ Settings persistence

### No Manual Async Code
All the async registration, initialization, and settings restoration is handled automatically.

## Available Web Components

- `<linear-slider>` - Linear sliders
- `<log-slider>` - Logarithmic sliders

## How It Works

### 1. Registry Creation
```javascript
const webComponentRegistry = new WebComponentControlRegistry(manager);
manager.webComponentRegistry = webComponentRegistry; // Store for loadPreset()
```

### 2. Component Registration
```javascript
webComponentRegistry.register('log-slider', 'exposure');
```

This returns a Promise that resolves when the component is ready.

### 3. Settings Application
```javascript
// Automatically waits for all components before applying
webComponentRegistry.applyWhenReady(savedSettings);
```

The registry:
1. Waits for all registered Web Components to be ready
2. Applies settings to ControlManager
3. Restores Web Component values from settings
4. Triggers final apply to renderer

## Migration Checklist

For each control you migrate:

- [ ] Create HTML with Web Component syntax
- [ ] Replace JavaScript control instantiation with `webComponentRegistry.register()`
- [ ] Test that it works (changes apply)
- [ ] Test that it loads saved settings correctly
- [ ] Test that it works with presets
- [ ] Delete old JavaScript control code

## Common Patterns

### Linear Slider
```javascript
webComponentRegistry.register('linear-slider', 'particle-count');
```

### Logarithmic Slider
```javascript
webComponentRegistry.register('log-slider', 'exposure');
```

## Troubleshooting

### Component not applying changes
- Make sure `webComponentRegistry` is created before `manager.initializeControls()`
- Check that the component's `id` matches the registration call

### Settings not loading
- Verify that `webComponentRegistry.applyWhenReady()` is called after loading settings
- Check that the component's `settingsKey` matches the settings object key

### Component not found
- Ensure the HTML element exists in the DOM
- Check that the component is wrapped in the correct parent element
- Verify that `customElements.define()` was called (should happen automatically via `registerControlElements()`)

---

## Current Status & Known Issues

### Phase 1 Results (2025-11-20)

**✅ Successfully Migrated:** 23 sliders to Web Components
- 6 linear sliders
- 2 linear sliders with transform
- 8 log sliders
- 7 percent sliders

**Code Reduction:**
- Deleted 268+ lines of old control code
- ~40% reduction in HTML verbosity
- Single-line registration pattern established

### Known Issues

**Animation Controls (animation-alpha, animation-speed):**
- ⚠️ Require late registration (after `manager.initializeControls()`)
- ⚠️ HTML is dynamically injected
- ⚠️ Require manual `attachListeners()` and `updateDisplay()` calls
- ⚠️ Timing-dependent initialization

**Root Cause:** Tight coupling between Control classes and ControlManager/Renderer.

### Next Steps: Phase 2

See [FUTURE_MIGRATIONS.md](./FUTURE_MIGRATIONS.md#phase-2-mixin-based-architecture-refactoring) for the complete plan to address these issues using composition-based mixins.

**Goals:**
- Decouple controls from application code
- Eliminate repetitive boilerplate
- Make controls truly reusable
- Fix animation control timing issues

**Estimated Effort:** ~6 hours
