# Web Components

This directory contains the Web Component-based control system implementation.

## Structure

```
web-components/
├── index.js          - Main export, registers all components
├── base.js           - ControlElement base class with reactive binding
├── slider.js         - MySlider component (linear slider)
├── log-slider.js     - MyLogSlider component (logarithmic slider)
└── README.md         - This file
```

## Usage

### Quick Start

```javascript
// Import and register all components
import { registerControlElements } from './src/ui/web-components/index.js';

// Register components (call once at app startup)
registerControlElements();
```

### Using Components in HTML

```html
<!-- Linear slider -->
<linear-slider
    id="dimensions"
    label="Dimensions"
    default="2"
    min="0"
    max="6"
    step="1"
    display-format="0">
    <label>
        <span>{{label}}</span>: <span bind-text="value">{{value}}</span>
    </label>
    <button decrease>-</button>
    <input type="range" min="{{min}}" max="{{max}}" value="{{value}}">
    <button increase>+</button>
    <button reset>↺</button>
</linear-slider>

<!-- Logarithmic slider -->
<log-slider
    id="exposure"
    label="Exposure"
    default="1.0"
    min-value="0.01"
    max-value="100.0"
    display-format="3">
    <label>
        <span>{{label}}</span>: <span bind-text="value">{{value}}</span>
    </label>
    <input type="range" class="slider-input" min="0" max="100" step="0.1">
</log-slider>
```

### Using with ControlManager

```javascript
import { ControlManager } from './src/ui/control-base.js';

const manager = new ControlManager({
    storageKey: 'mySettings',
    onApply: (settings) => {
        console.log('Settings:', settings);
    }
});

// Web components implement the same interface as jQuery controls
const slider = document.getElementById('dimensions');
manager.register(slider);
manager.initializeControls();
```

## Template Modes

### 1. Direct innerHTML

```html
<linear-slider id="dim" default="2" min="0" max="10">
    <button decrease>-</button>
    <input type="range" value="{{value}}">
    <button increase>+</button>
    <span bind-text="value">{{value}}</span>
</linear-slider>
```

### 2. Inline template

```html
<linear-slider id="dim" default="2" min="0" max="10">
    <template>
        <button decrease>-</button>
        <input type="range" value="{{value}}">
        <button increase>+</button>
        <span bind-text="value">{{value}}</span>
    </template>
</linear-slider>
```

### 3. External template

```html
<template id="slider-template">
    <button decrease>-</button>
    <input type="range" min="{{min}}" max="{{max}}" value="{{value}}">
    <button increase>+</button>
    <span bind-text="value">{{value}}</span>
</template>

<linear-slider id="dim" template="slider-template" default="2" min="0" max="10"></linear-slider>
```

## Binding Syntax

### Placeholders (initial value)
- `{{variable}}` in text content
- `attribute="{{variable}}"` in attributes

### Reactive bindings (updates on change)
- `bind-text="varName"` - Updates textContent
- `bind-class-foo="varName"` - Toggles class "foo"
- `bind-show="varName"` - Shows/hides element
- Attributes with `{{variable}}` automatically get reactive updates

## Data Attributes for Component Logic

Components use **data attributes** instead of CSS classes for functionality. This decouples logic from styling:

### Slider Input
```html
<!-- Option 1: Explicit with data-role -->
<input type="range" data-role="slider" value="{{value}}">

<!-- Option 2: Implicit (any <input type="range">) -->
<input type="range" value="{{value}}">
```

### Action Buttons
Use **boolean attributes** to specify button behavior:
```html
<button decrease>-</button>
<button increase>+</button>
<button decrease-large>--</button>
<button increase-large>++</button>
<button reset>↺</button>
```

**Benefits:**
- ✅ **No CSS coupling** - Use any CSS classes you want for styling
- ✅ **Ultra-clean syntax** - `<button reset>` is cleaner than `data-action="reset"` or `class="btn-reset"`
- ✅ **Self-documenting** - The attribute name IS the action
- ✅ **Flexible** - Multiple buttons can have the same action
- ✅ **HTML5 compliant** - Boolean attributes are standard HTML5

## Creating New Components - Before & After

### Before (Without Helpers) - ~90 lines
```javascript
export class LinearSlider extends ControlElement {
    constructor() {
        super();
        this._label = 'Value';
        this._value = 50;
        this._min = 0;
        this._max = 100;
        this._step = 1;
        this.sliderInput = null;
    }

    // Manual getters/setters (5 properties × 6 lines each = 30 lines)
    get label() { return this._label; }
    set label(value) { this._label = value; this.updateBindings('label', value); }

    get value() { return this._value; }
    set value(v) { this._value = v; this.updateBindings('value', v); }
    // ... 3 more properties ...

    attachInternalListeners() {
        // Manual element finding
        this.sliderInput = this.querySelector('[data-role="slider"]') ||
                          this.querySelector('input[type="range"]');
        if (!this.sliderInput) return;

        // Manual listener
        this.sliderInput.addEventListener('input', () => {
            this.value = parseFloat(this.sliderInput.value);
            this.triggerChange();
        });

        // Manual button binding (15 lines)
        const actions = ['decrease', 'increase', 'reset'];
        for (const action of actions) {
            const buttons = this.querySelectorAll(`[${action}]`);
            for (const button of buttons) {
                button.addEventListener('click', () => {
                    this.handleButtonAction(action);
                });
            }
        }
    }
    // ... getValue, setValue, handleButtonAction ...
}
```

### After (With Helpers) - ~40 lines
```javascript
export class LinearSlider extends ControlElement {
    constructor() {
        super();

        // One-liner for all reactive properties!
        this.createReactiveProperties({
            label: 'Value', value: 50, min: 0, max: 100, step: 1
        });

        this.sliderInput = null;
    }

    attachInternalListeners() {
        // One-liner to find input
        this.sliderInput = this.findByRole('slider', 'input[type="range"]');
        if (!this.sliderInput) return;

        // One-liner to add listener
        this.addInputListener(this.sliderInput, () => {
            this.value = parseFloat(this.sliderInput.value);
            this.triggerChange();
        });

        // One-liner to register all buttons!
        this.registerActionButtons(['decrease', 'increase', 'reset']);
    }
    // ... getValue, setValue, handleButtonAction ...
}
```

**Result: 55% less code, much cleaner, easier to read!**

## Adding New Components

1. Create a new file (e.g., `checkbox.js`)
2. Extend `ControlElement` base class
3. Use helper methods to simplify implementation:
   - `createReactiveProperties()` - Create reactive properties
   - `findByRole()` / `findInput()` - Find elements
   - `registerActionButtons()` - Register action buttons
   - `addInputListener()` - Add input listeners
4. Implement required methods:
   - `initializeProperties()` - Read attributes
   - `attachInternalListeners()` - Set up event handlers
   - `getValue()` - Return current value
   - `setValue(value)` - Set value and update UI
   - Optional: `handleButtonAction(action)` - Handle +/- buttons

5. Export from `index.js`:
```javascript
export { CheckboxControl } from './checkbox.js';
import { CheckboxControl } from './checkbox.js';

export function registerControlElements() {
    // ... existing registrations
    if (!customElements.get('checkbox-control')) {
        customElements.define('checkbox-control', CheckboxControl);
    }
}
```

## Base Class API

All components inherit from `ControlElement` which provides:

### Control Interface (ControlManager compatible)
- `getValue()` - Get current value
- `setValue(value)` - Set value
- `reset()` - Reset to default
- `handleButtonAction(action)` - Handle button clicks
- `saveToSettings(settings)` - Save to settings object
- `restoreFromSettings(settings)` - Load from settings object
- `attachListeners(callback)` - Attach change callback

### Helper Methods (NEW!)

#### Reactive Properties
**Automatically create properties with reactive bindings:**

```javascript
// Old way (manual getters/setters):
constructor() {
    super();
    this._value = 50;
}
get value() { return this._value; }
set value(v) {
    this._value = v;
    this.updateBindings('value', v);
}

// New way (automatic):
constructor() {
    super();
    this.createReactiveProperty('value', 50);
}

// Even better (multiple properties):
constructor() {
    super();
    this.createReactiveProperties({
        label: 'Value',
        value: 50,
        min: 0,
        max: 100
    });
}
```

#### Finding Elements
```javascript
// Find input by role (with fallback)
this.findByRole('slider', 'input[type="range"]');

// Find all elements by role
this.findAllByRole('option');

// Find input with smart fallback
this.findInput('range', 'slider'); // Looks for data-role="slider" or input[type="range"]
```

#### Action Buttons
```javascript
// Old way (manual loop):
const actions = ['decrease', 'increase', 'reset'];
for (const action of actions) {
    const buttons = this.querySelectorAll(`[${action}]`);
    for (const button of buttons) {
        button.addEventListener('click', () => {
            this.handleButtonAction(action);
        });
    }
}

// New way (one line):
this.registerActionButtons(['decrease', 'increase', 'reset']);
```

#### Input Listeners
```javascript
// Add listener with optional debouncing
this.addInputListener(element, callback, 300); // 300ms debounce
this.addInputListener(element, callback); // No debounce
```

### Attribute Helpers
- `getNumberAttribute(name, default)` - Read number from attribute
- `getBooleanAttribute(name, default)` - Read boolean from attribute

### Other Utilities
- `formatValue(value)` - Format value for display
- `triggerChange()` - Trigger onChange and ControlManager callbacks

## Testing

Open `test-web-components.html` in a browser to see all components in action.

Tests include:
- Direct innerHTML mode
- Inline template mode
- External template mode
- Logarithmic slider
- ControlManager integration (save/load/reset)
