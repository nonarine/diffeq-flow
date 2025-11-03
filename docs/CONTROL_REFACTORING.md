# Control System Refactoring Guide

## Problem Statement

The current `controls.js` has grown to **1200+ lines** with significant code duplication and maintenance issues:

### Issues with Current Implementation

1. **Repetitive Code**: Every new control requires updates in ~7 different locations:
   - `defaultSettings` object (line 38)
   - `state` initialization (line 68)
   - Event listener setup (scattered throughout)
   - `getCurrentSettings()` (line 380)
   - `saveSettings()` (line 454)
   - `loadSettings()` (line 488)
   - `default-settings` button handler (line 1028)

2. **Easy to Forget Steps**: Missing any of the above steps causes bugs:
   - Settings not persisting to localStorage
   - Settings not restoring on page load
   - Reset button not working for that control
   - URL sharing missing the setting

3. **Logarithmic Scale Duplication**: Same `linearToLog`/`logToLinear` code repeated multiple times

4. **No Type Safety**: Settings are untyped dictionaries, easy to typo keys

5. **Difficult to Test**: Tightly coupled to jQuery and DOM, hard to unit test

## Solution: Composable Control Classes

New architecture in `src/ui/control-base.js`:

```
Control (base class)
├── SliderControl (linear sliders)
├── LogSliderControl (logarithmic sliders)
├── TextControl (text inputs)
├── SelectControl (dropdowns)
└── CheckboxControl (checkboxes)

ControlManager
├── Manages collection of controls
├── Automatic save/restore to localStorage
├── Debounced apply with error handling
└── Centralized settings management
```

## Benefits

### 1. **DRY Principle** - Define Once, Works Everywhere

**Before** (repeated ~7 times per control):
```javascript
// In defaultSettings:
fadeOpacity: 0.999,

// In state:
state.fadeOpacity = ...

// In getCurrentSettings:
fadeOpacity: state.fadeOpacity,

// In saveSettings:
fadeOpacity: settings.fadeOpacity,

// In loadSettings:
if (settings.fadeOpacity !== undefined) {
    state.fadeOpacity = settings.fadeOpacity;
    $('#fade').val(logToLinear(settings.fadeOpacity, 0.9, 0.9999));
}

// In default-settings button:
state.fadeOpacity = defaultSettings.fadeOpacity;
$('#fade').val(logToLinear(defaultSettings.fadeOpacity, 0.9, 0.9999));

// Event listener:
$('#fade').on('input', function() {
    const sliderValue = parseFloat($(this).val());
    state.fadeOpacity = linearToLog(sliderValue, 0.9, 0.9999);
    $('#fade-value').text(state.fadeOpacity.toFixed(4));
    debouncedApply();
});
```

**After** (1 line):
```javascript
manager.register(new LogSliderControl('fade', 0.999, {
    settingsKey: 'fadeOpacity',
    minValue: 0.9,
    maxValue: 0.9999,
    displayId: 'fade-value',
    displayFormat: v => v.toFixed(4)
}));
```

### 2. **Automatic Save/Restore**

```javascript
// Save all controls to localStorage
manager.saveToStorage();

// Load all controls from localStorage
manager.loadFromStorage();

// Reset all controls to defaults
manager.resetAll();

// Get current settings as object
const settings = manager.getSettings();
```

### 3. **Type-Safe Settings Keys**

Each control declares its `settingsKey`, preventing typos:
```javascript
manager.register(new SliderControl('white-point', 2.0, {
    settingsKey: 'whitePoint'  // Explicitly declared
}));
```

### 4. **Centralized Debounced Apply**

The manager handles debouncing for all controls:
```javascript
const manager = new ControlManager({
    debounceTime: 300,
    onApply: (settings) => {
        try {
            renderer.updateConfig(buildConfig(settings));
            manager.saveToStorage();
        } catch (error) {
            showError(error.message);
        }
    }
});
```

### 5. **Custom Callbacks per Control**

```javascript
manager.register(new SelectControl('color-mode', 'white', {
    onChange: (value) => {
        // Custom logic when color mode changes
        updateColorModeUI(value);
    }
}));
```

### 6. **Easier Testing**

Controls can be tested in isolation:
```javascript
const control = new LogSliderControl('test', 1.0, {
    minValue: 0.1,
    maxValue: 10.0
});

// Mock jQuery element
global.$ = (selector) => ({
    val: () => 50,  // Slider at middle position
    on: () => {}
});

assert.equal(control.getValue(), 1.0);  // ≈ geometric mean of 0.1 and 10.0
```

## Migration Strategy

### Phase 1: Side-by-Side (Low Risk)

1. Keep existing `controls.js` working
2. Create new file `controls-v2.js` using the new system
3. Add a feature flag to switch between old/new
4. Test thoroughly with new system
5. Once stable, delete old implementation

### Phase 2: Gradual Migration

Migrate controls in groups:

**Group 1: Simple Sliders** (low risk)
- `timestep`, `particles`, `drop`, `white-point`

**Group 2: Log Sliders** (medium risk)
- `fade`, `exposure`, `gamma`, `particle-intensity`

**Group 3: Checkboxes & Selects** (low risk)
- `use-hdr`, `drop-low-velocity`, `theme-selector`, `color-mode`

**Group 4: Complex Controls** (high risk)
- Dimension inputs (dynamically generated)
- Mapper controls (conditional rendering)
- Gradient editor integration

### Phase 3: Cleanup

1. Remove old helper functions (`linearToLog`, `logToLinear`)
2. Consolidate settings storage logic
3. Remove `state` object (use `manager.getSettings()` instead)
4. Update documentation

## Usage Examples

### Basic Linear Slider

```javascript
manager.register(new SliderControl('particles', 1000, {
    min: 100,
    max: 10000,
    step: 100,
    displayId: 'particles-value',
    displayFormat: v => v.toFixed(0)
}));
```

### Logarithmic Slider

```javascript
manager.register(new LogSliderControl('exposure', 1.0, {
    minValue: 0.01,
    maxValue: 10.0,
    displayId: 'exposure-value',
    displayFormat: v => v.toFixed(2)
}));
```

### Dropdown with Custom Handler

```javascript
manager.register(new SelectControl('theme-selector', 'dark', {
    settingsKey: 'theme',
    onChange: (value) => {
        if (value === 'light') {
            $('body').addClass('light-theme');
        } else {
            $('body').removeClass('light-theme');
        }
        manager.saveToStorage(); // Immediate save
    }
}));
```

### Checkbox

```javascript
manager.register(new CheckboxControl('use-hdr', true, {
    settingsKey: 'useHDR'
}));
```

### Text Input

```javascript
manager.register(new TextControl('color-expression', 'x * y', {
    settingsKey: 'colorExpression',
    trim: true
}));
```

## Advanced: Custom Control Classes

For complex controls (like dimension inputs), extend the base class:

```javascript
class DimensionInputsControl extends Control {
    constructor(defaultValue, options = {}) {
        super('dimension-inputs', defaultValue, options);
    }

    getValue() {
        const expressions = [];
        const dimensions = this.getDimensions();
        for (let i = 0; i < dimensions; i++) {
            expressions.push($(`#expr-${i}`).val().trim() || '0');
        }
        return expressions;
    }

    setValue(expressions) {
        expressions.forEach((expr, i) => {
            $(`#expr-${i}`).val(expr);
        });
    }

    attachListeners(callback) {
        $(document).on('input', '[id^="expr-"]', () => {
            if (callback) callback();
        });
    }

    getDimensions() {
        return parseInt($('#dimensions').val()) || 2;
    }
}

// Usage:
manager.register(new DimensionInputsControl(['-y', 'x'], {
    settingsKey: 'expressions'
}));
```

## Migration Checklist

When migrating a control:

- [ ] Identify the control's HTML element ID
- [ ] Find its default value in `defaultSettings`
- [ ] Determine control type (slider, checkbox, select, text)
- [ ] Check if it's linear or logarithmic scale
- [ ] Find its settings key (may differ from ID)
- [ ] Identify any custom onChange handlers
- [ ] Create control instance with all options
- [ ] Register with manager
- [ ] Remove old initialization code
- [ ] Remove from old event listeners
- [ ] Remove from `getCurrentSettings()`
- [ ] Remove from `loadSettings()`
- [ ] Remove from `default-settings` handler
- [ ] Test save/restore/reset functionality

## Testing Strategy

1. **Unit Tests** for control classes:
   - Test `getValue()` / `setValue()` round-trip
   - Test logarithmic conversions
   - Test default values

2. **Integration Tests** for ControlManager:
   - Test `getSettings()` / `setSettings()`
   - Test localStorage save/restore
   - Test reset functionality
   - Test debounced apply

3. **Manual Testing**:
   - Change each control, verify it applies
   - Reload page, verify settings restored
   - Click reset, verify defaults restored
   - Share URL, verify settings encoded correctly

## Performance Considerations

- **Before**: Each control triggers a separate debounced apply (N timers)
- **After**: Single shared debounced apply (1 timer)
- **Result**: Fewer unnecessary renderer updates

## File Structure

```
src/ui/
├── control-base.js              # Base classes and ControlManager
├── controls.js                  # Legacy implementation (to be removed)
├── controls-v2.js              # New implementation using control-base
├── controls-refactored-example.js  # Example/reference implementation
└── gradient-editor.js          # Unchanged
```

## Next Steps

1. Review `controls-refactored-example.js` for usage patterns
2. Start migration with simple sliders (low risk)
3. Add unit tests for control classes
4. Gradually migrate remaining controls
5. Remove legacy code once all controls migrated
6. Update documentation with new patterns

## Questions?

- **Q**: Do I need to migrate everything at once?
  - **A**: No! Use side-by-side approach and migrate incrementally.

- **Q**: What about complex controls like gradient editor?
  - **A**: Create custom control classes that extend the base class.

- **Q**: Can I mix old and new systems?
  - **A**: Yes, during migration. Just avoid managing the same control in both.

- **Q**: How do I handle controls that affect other controls?
  - **A**: Use the `onChange` callback to trigger side effects.

---

**See also**: `src/ui/controls-refactored-example.js` for complete working example
