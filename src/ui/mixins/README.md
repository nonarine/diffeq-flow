# Control Mixins

Reusable behaviors for creating controls compatible with ControlManager.

## Overview

These mixins provide the standard Control interface that ControlManager expects, allowing any class (not just ControlElement) to integrate with the control system.

**Benefits:**
- ✅ Decouples ControlManager integration from specific base classes
- ✅ Makes control interface reusable across different component types
- ✅ Reduces code duplication (~150 lines extracted from ControlElement)
- ✅ Easy to test and maintain
- ✅ Supports composition - mix and match only the behaviors you need

## Available Mixins

### AccordionAwareMixin ⭐ NEW

Automatic accordion resize when control content changes. No manual calls needed!

**Provides:**
- Automatic detection of parent accordion section
- ResizeObserver-based automatic resizing
- `triggerAccordionResize()` - Manual trigger when needed
- Automatic cleanup on disconnect

**How it works:**
- Detects if control is inside `.accordion-section`
- Uses ResizeObserver to watch for size changes
- Automatically adjusts accordion height when content changes
- No manual `resizeAccordion()` calls required!

**Usage:**
```javascript
// Already included in ControlElement - all web components get this automatically!
// For custom controls:
import { AccordionAwareMixin } from './mixins/index.js';

class MyControl extends AccordionAwareMixin(HTMLElement) {
    showHideContent() {
        this.content.style.display = this.expanded ? 'block' : 'none';
        // Accordion will auto-resize via ResizeObserver
        // But you can also trigger manually:
        this.triggerAccordionResize();
    }
}
```

**Benefits:**
- ✅ Zero manual accordion management
- ✅ Works with any content changes (show/hide, add/remove, resize)
- ✅ Automatic cleanup (disconnects observer on element removal)
- ✅ Performance: Debounced resize (50ms)

### ControlMixin

Core ControlManager interface for save/load/apply integration.

**Provides:**
- `attachListeners(callback)` - Attach ControlManager callback
- `triggerChange()` - Trigger onChange and ControlManager callback
- `saveToSettings(settings)` - Save value to settings object
- `restoreFromSettings(settings)` - Restore value from settings object
- `reset()` - Reset to default value
- `initializeControlProperties()` - Read settingsKey and defaultValue from attributes

**Properties:**
- `settingsKey` - Key for settings object (defaults to element id)
- `defaultValue` - Default value for reset
- `onChange` - Optional custom callback
- `_callback` - Reference to ControlManager callback

**Required methods to implement:**
- `getValue()` - Return current control value
- `setValue(value)` - Set control value and update UI

**Usage:**
```javascript
import { ControlMixin } from './mixins/index.js';

class MyControl extends ControlMixin(HTMLElement) {
    connectedCallback() {
        this.initializeControlProperties(); // Read settingsKey, defaultValue

        this.input = this.querySelector('input');
        this.input.addEventListener('input', () => this.triggerChange());
    }

    getValue() {
        return this.input.value;
    }

    setValue(value) {
        this.input.value = value;
    }
}
```

### ButtonActionMixin

Automatic registration and handling of action buttons (+/- buttons, reset, etc.).

**Provides:**
- `registerActionButtons(actions)` - Auto-register buttons with action attributes
- `handleButtonAction(action)` - Handle button clicks (override to customize)

**Usage:**
```javascript
import { ButtonActionMixin } from './mixins/index.js';

class MySlider extends ButtonActionMixin(ControlMixin(HTMLElement)) {
    connectedCallback() {
        this.initializeControlProperties();

        // HTML: <button decrease>-</button> <button increase>+</button>
        this.registerActionButtons(['decrease', 'increase', 'reset']);
    }

    handleButtonAction(action) {
        const current = this.getValue();
        let newValue = current;

        if (action === 'increase') newValue = current + 1;
        if (action === 'decrease') newValue = current - 1;
        if (action === 'reset') newValue = this.defaultValue;

        if (newValue !== current) {
            this.setValue(newValue);
            this.triggerChange();
            return true;
        }
        return false;
    }
}
```

### AttributeHelpersMixin

Convenience methods for reading typed attributes from HTML.

**Provides:**
- `getNumberAttribute(name, defaultValue)` - Read number attribute
- `getBooleanAttribute(name, defaultValue)` - Read boolean attribute

**Usage:**
```javascript
import { AttributeHelpersMixin } from './mixins/index.js';

class MySlider extends AttributeHelpersMixin(HTMLElement) {
    connectedCallback() {
        this.minValue = this.getNumberAttribute('min', 0);
        this.maxValue = this.getNumberAttribute('max', 100);
        this.enabled = this.getBooleanAttribute('enabled', true);
    }
}
```

## Composing Multiple Mixins

### Manual Composition

```javascript
class MyControl extends AttributeHelpersMixin(
    ButtonActionMixin(
        ControlMixin(
            HTMLElement
        )
    )
) {
    // Your implementation
}
```

### Using composeMixins Helper

For better readability:

```javascript
import { composeMixins, ControlMixin, ButtonActionMixin, AttributeHelpersMixin } from './mixins/index.js';

class MyControl extends composeMixins(
    HTMLElement,
    ControlMixin,
    ButtonActionMixin,
    AttributeHelpersMixin
) {
    // Your implementation
}
```

## Complete Example

```javascript
import { composeMixins, ControlMixin, ButtonActionMixin, AttributeHelpersMixin } from './mixins/index.js';

class NumberInput extends composeMixins(
    HTMLElement,
    ControlMixin,
    ButtonActionMixin,
    AttributeHelpersMixin
) {
    constructor() {
        super();
        this.input = null;
        this.minValue = 0;
        this.maxValue = 100;
        this.step = 1;
    }

    connectedCallback() {
        // Initialize control properties (settingsKey, defaultValue)
        this.initializeControlProperties();

        // Read configuration from attributes
        this.minValue = this.getNumberAttribute('min', 0);
        this.maxValue = this.getNumberAttribute('max', 100);
        this.step = this.getNumberAttribute('step', 1);

        // Find input element
        this.input = this.querySelector('input');

        // Attach listeners
        this.input.addEventListener('input', () => this.triggerChange());

        // Register action buttons
        this.registerActionButtons(['decrease', 'increase', 'reset']);
    }

    getValue() {
        return parseFloat(this.input.value);
    }

    setValue(value) {
        this.input.value = value;
    }

    handleButtonAction(action) {
        const current = this.getValue();
        let newValue = current;

        if (action === 'increase') {
            newValue = Math.min(this.maxValue, current + this.step);
        } else if (action === 'decrease') {
            newValue = Math.max(this.minValue, current - this.step);
        } else if (action === 'reset') {
            newValue = this.defaultValue;
        } else {
            return false;
        }

        if (newValue !== current) {
            this.setValue(newValue);
            this.triggerChange();
            return true;
        }
        return false;
    }
}

customElements.define('number-input', NumberInput);
```

**HTML:**
```html
<number-input
    id="my-number"
    settings-key="myNumber"
    default="50"
    min="0"
    max="100"
    step="5">
    <button decrease>-</button>
    <input type="number" value="50">
    <button increase>+</button>
    <button reset>↺</button>
</number-input>
```

**Integration with ControlManager:**
```javascript
import { ControlManager } from './control-base.js';

const manager = new ControlManager({
    storageKey: 'mySettings',
    onApply: (settings) => {
        console.log('Settings changed:', settings);
    }
});

const control = document.getElementById('my-number');
manager.register(control);
control.attachListeners(() => manager.debouncedApply());

// Load saved settings
const savedSettings = manager.loadFromStorage();
if (savedSettings) {
    manager.applySettings(savedSettings);
}
```

## Implementation Details

### How Mixins Work

Mixins use **functional composition** to extend classes:

```javascript
export const MyMixin = (Base) => class extends Base {
    myMethod() {
        // Mixin behavior
    }
};
```

When you apply a mixin:
```javascript
class MyClass extends MyMixin(HTMLElement) { }
```

JavaScript creates this inheritance chain:
```
MyClass → MyMixin → HTMLElement → Object
```

Multiple mixins create a nested chain:
```
MyClass → Mixin3 → Mixin2 → Mixin1 → HTMLElement → Object
```

### Method Override Pattern

Mixins can call `super` to chain behavior:

```javascript
export const LoggingMixin = (Base) => class extends Base {
    connectedCallback() {
        console.log('Element connected');
        super.connectedCallback(); // Call parent's connectedCallback
    }
};
```

### Property Initialization

ControlMixin provides `initializeControlProperties()` which should be called from your `connectedCallback()`:

```javascript
connectedCallback() {
    this.initializeControlProperties(); // Sets settingsKey, defaultValue
    // ... rest of your initialization
}
```

This reads:
- `settings-key` attribute → `this.settingsKey`
- `default` attribute → `this.defaultValue`

## Testing Mixins

Mixins can be tested independently:

```javascript
// test-control-mixin.js
import { ControlMixin } from './mixins/index.js';

class TestControl extends ControlMixin(HTMLElement) {
    getValue() { return this._value; }
    setValue(v) { this._value = v; }
}

const control = new TestControl();
control.id = 'test';
control.initializeControlProperties();

// Test save
const settings = {};
control.setValue(42);
control.saveToSettings(settings);
assert(settings.test === 42);

// Test restore
control.restoreFromSettings({ test: 99 });
assert(control.getValue() === 99);
```

## Best Practices

1. **Always call `initializeControlProperties()`** in `connectedCallback()`
2. **Call `super` methods** when overriding mixin methods
3. **Implement required methods** (`getValue()`, `setValue()`)
4. **Call `triggerChange()`** after value changes
5. **Use `composeMixins` helper** for readable composition
6. **Test mixins independently** before using in components

## Migration from ControlElement

If you're migrating from the old ControlElement base class:

**Before:**
```javascript
import { ControlElement } from './base.js';

class MySlider extends ControlElement {
    // Implementation
}
```

**After (same behavior):**
```javascript
import { ControlElement } from './base.js';

class MySlider extends ControlElement {
    // Implementation - no changes needed!
    // ControlElement already uses mixins internally
}
```

**After (without ControlElement):**
```javascript
import { composeMixins, ControlMixin, ButtonActionMixin } from './mixins/index.js';

class MySlider extends composeMixins(
    HTMLElement,
    ControlMixin,
    ButtonActionMixin
) {
    // Add your own template/binding logic
}
```

## Files

- `control-mixin.js` - All mixin implementations
- `index.js` - Export file
- `README.md` - This file
