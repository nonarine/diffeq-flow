# Web Components Migration Guide

This guide shows how to incrementally migrate from jQuery-based controls to Web Component-based controls.

## Architecture Overview

### Key Concepts

1. **Custom HTML Elements**: Controls are custom elements like `<my-slider>` instead of plain HTML + jQuery
2. **Reactive Properties**: Class properties (like `value`, `min`, `max`) automatically update bound elements when changed
3. **Template Syntax**: `{{variable}}` for initial values, `bind-*` attributes for reactive updates
4. **bind-* Attributes**: Declare which properties are exposed to the component's innerHTML
5. **Flexible Templates**: Use direct innerHTML, inline `<template>`, or external template references

### Binding Syntax

**In text content:**
- `{{variable}}` - Initial value placeholder, replaced on render

**In attributes:**
- `attribute="{{variable}}"` - Initial value + automatic reactive binding
  - Example: `min="{{min}}"` sets initial value and updates when `min` changes

**Optional explicit bindings:**
- `bind-text="varName"` - Updates element's textContent when variable changes
- `bind-class-foo="varName"` - Toggles class "foo" based on boolean
- `bind-show="varName"` - Shows/hides element based on boolean

**Note:** You don't need `bind-attr-*` anymore! Just use `{{variable}}` directly in attributes.

### Template Modes

The system supports three ways to define control structure:

#### 1. Direct innerHTML (simplest)
```html
<linear-slider id="dim" label="Dimensions" default="2">
    <label>{{label}}: <span bind-text="value">{{value}}</span></label>
    <input type="range" value="{{value}}">
</linear-slider>
```

#### 2. Inline `<template>` tag (clean separation)
```html
<linear-slider id="dim" label="Dimensions" default="2">
    <template>
        <label>{{label}}: <span bind-text="value">{{value}}</span></label>
        <input type="range" value="{{value}}">
    </template>
</linear-slider>
```

#### 3. External template reference (maximum reuse)
```html
<!-- Define once at top of page -->
<template id="standard-slider">
    <label>{{label}}: <span bind-text="value">{{value}}</span></label>
    <input type="range" min="{{min}}" max="{{max}}" value="{{value}}">
</template>

<!-- Use many times -->
<linear-slider id="dim" template="standard-slider" label="Dimensions" default="2"></linear-slider>
<linear-slider id="particles" template="standard-slider" label="Particles" default="1000"></linear-slider>
<linear-slider id="fade" template="standard-slider" label="Fade" default="0.99"></linear-slider>
```

**Recommendation:** Use external templates for consistency, inline templates for custom one-offs, direct innerHTML for quick prototyping.

## Migration Strategy

### Phase 1: Test in Isolation

Use `test-web-components.html` to verify the new system works:

```bash
# Open in browser
open test-web-components.html
```

Test:
1. Slider value updates display
2. Buttons increment/decrement correctly
3. Reset button works
4. ControlManager integration (save/load/reset)
5. Log slider conversion

### Phase 2: Migrate One Control

Let's migrate the "Dimensions" slider as an example.

#### Before (jQuery-based):

```html
<!-- index.html -->
<div>
    <label>Dimensions: <span class="range-value" id="dim-value">2</span></label>
    <div class="slider-control">
        <button class="slider-btn" data-slider="dimensions" data-action="decrease">-</button>
        <input type="range" id="dimensions">
        <button class="slider-btn" data-slider="dimensions" data-action="increase">+</button>
    </div>
</div>
```

```js
// controls-v2.js
const dimensionsControl = manager.register(new SliderControl('dimensions', 2, {
    min: 2,
    max: 6,
    step: 1,
    displayId: 'dim-value',
    displayFormat: v => v.toFixed(0),
    onChange: (value) => { /* ... */ }
}));
```

#### After (Web Component):

```html
<!-- index.html -->
<linear-slider
    id="dimensions"
    label="Dimensions"
    default="2"
    min="2"
    max="6"
    step="1"
    display-format="0"
    bind-label="label"
    bind-value="value"
    bind-min="min"
    bind-max="max">
    <label class="control-label">
        <span>{{label}}</span>: <span class="range-value" bind-text="value">{{value}}</span>
    </label>
    <div class="slider-control">
        <button class="slider-btn btn-decrease">-</button>
        <input type="range" class="slider-input"
            min="{{min}}"
            max="{{max}}"
            step="{{step}}"
            value="{{value}}">
        <button class="slider-btn btn-increase">+</button>
        <button class="slider-btn btn-reset">↺</button>
    </div>
</linear-slider>
```

```js
// controls-v2.js (much simpler!)
const dimensionsControl = document.getElementById('dimensions');
dimensionsControl.onChange = (value) => { /* ... */ };
manager.register(dimensionsControl);
```

### Phase 3: Register Custom Elements

Add to `main.js`:

```js
import { registerControlElements } from './src/ui/web-components/index.js';

// Register custom elements BEFORE initializing controls
registerControlElements();

// Then initialize app as normal
const renderer = new Renderer(canvas, config);
initControls(renderer, () => { /* ... */ });
```

### Phase 4: Coexistence

**Both systems can coexist!** The Web Component controls implement the same interface as jQuery controls:

- `getValue()`
- `setValue(value)`
- `reset()`
- `handleButtonAction(action)`
- `saveToSettings(settings)`
- `restoreFromSettings(settings)`
- `attachListeners(callback)`

So ControlManager works with both types.

## Benefits

### Before: jQuery-based control (30+ lines of code)

```js
// Define default value
const defaultSettings = {
    dimensions: 2,
    // ...
};

// Create control instance
const dimensionsControl = new SliderControl('dimensions', 2, {
    min: 2,
    max: 6,
    step: 1,
    displayId: 'dim-value',
    displayFormat: v => v.toFixed(0),
    onChange: (value) => {
        // Update dependent controls
    }
});

// Register with manager
manager.register(dimensionsControl);

// HTML is separate, minimal, needs manual sync
```

### After: Web Component (cleaner, more declarative)

```html
<!-- Everything in one place - configuration AND structure -->
<linear-slider
    id="dimensions"
    label="Dimensions"
    default="2"
    min="2"
    max="6"
    step="1"
    display-format="0"
    bind-value="value">
    <!-- Custom structure if needed -->
    <label><span>{{label}}</span>: <span bind-text="value">{{value}}</span></label>
    <input type="range" class="slider-input" value="{{value}}">
</linear-slider>
```

```js
// Just register and add onChange if needed
const dimensionsControl = document.getElementById('dimensions');
dimensionsControl.onChange = (value) => { /* ... */ };
manager.register(dimensionsControl);
```

**Reduction:**
- ~80% less JavaScript code
- No separate HTML attribute management
- Single source of truth (HTML element)
- Better encapsulation
- Easier to customize (just change innerHTML)

## Control Types

### Linear Slider: `<linear-slider>`

```html
<linear-slider
    id="fade"
    label="Fade Speed"
    default="0.999"
    min="0"
    max="1"
    step="0.001"
    display-format="3"
    bind-value="value">
    <!-- innerHTML here -->
</linear-slider>
```

### Logarithmic Slider: `<log-slider>`

```html
<log-slider
    id="exposure"
    label="Exposure"
    default="1.0"
    min-value="0.01"
    max-value="10.0"
    display-format="2"
    bind-value="value">
    <!-- innerHTML here -->
</log-slider>
```

### Future: More control types

- `<text-input-control>`
- `<select-control>`
- `<checkbox-control>`
- `<adaptive-slider>`
- `<timestep-control>`

## Customization

Want a different layout? Just change the innerHTML:

```html
<!-- Vertical layout -->
<linear-slider id="custom" bind-value="value">
    <div class="vertical-slider">
        <div bind-text="value">{{value}}</div>
        <input type="range" class="vertical" value="{{value}}">
        <button class="btn-reset">Reset</button>
    </div>
</linear-slider>

<!-- Minimal layout -->
<linear-slider id="minimal" bind-value="value">
    <input type="range" value="{{value}}">
    <span bind-text="value">{{value}}</span>
</linear-slider>
```

## Migration Checklist

- [x] Create Web Component base classes
- [x] Implement LinearSlider
- [x] Implement LogSlider
- [x] Create test page
- [ ] Register elements in main.js
- [ ] Migrate first control (dimensions)
- [ ] Verify ControlManager compatibility
- [ ] Migrate remaining sliders one by one
- [ ] Implement TextInputControl
- [ ] Implement SelectControl
- [ ] Implement CheckboxControl
- [ ] Migrate complex controls (dimension inputs, mapper params, etc.)
- [ ] Remove legacy control-base.js when all controls migrated

## Testing Each Migration

For each control you migrate:

1. **Test in isolation** in test-web-components.html
2. **Add to main app** by updating HTML
3. **Register with ControlManager**
4. **Test functionality**: click, drag, buttons, reset
5. **Test persistence**: save settings, reload page
6. **Test interactions**: ensure dependent controls still work

## Rollback Strategy

If something breaks, just revert the HTML back to the old structure. The old jQuery-based control system remains available as long as you need it.

No need for a "big bang" migration - do it incrementally!
