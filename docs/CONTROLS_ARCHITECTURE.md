# UI Controls Architecture

**Last Updated:** 2025-11-08
**Status:** Current Implementation

This document describes the current control system architecture after two major refactorings that eliminated duplication and created a single source of truth for parameter definitions.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Principles](#architecture-principles)
3. [File Structure](#file-structure)
4. [Control System Layers](#control-system-layers)
5. [Adding New Parameters](#adding-new-parameters)
6. [Data Flow](#data-flow)
7. [API Reference](#api-reference)
8. [Examples](#examples)

---

## Overview

The control system uses a **data-driven architecture** where parameter metadata flows from source (transforms, integrators, etc.) to UI automatically, with no manual synchronization required.

### Key Features

- **Single Source of Truth**: Parameters defined once in math code, never duplicated in UI
- **Generic Controls**: `ParameterControl` works for any parameter with metadata
- **Automatic Rendering**: UI elements generated automatically from parameter definitions
- **Consistent Behavior**: All sliders use same formatting, increment logic, save/restore
- **Zero UI Code**: Adding new transforms requires zero UI changes

### Historical Context

- **2025-11-03**: First refactoring eliminated 7-location update pattern, introduced ControlManager
- **2025-11-08**: Second refactoring eliminated parameter duplication, created ParameterControl system

---

## Architecture Principles

### 1. Single Source of Truth

Parameter metadata lives in **one place only**:

```javascript
// In src/math/transforms.js - THE ONLY PLACE PARAMETERS ARE DEFINED
class RationalTransform extends Transform {
    getParameters() {
        return [{
            name: 'a',                      // Parameter identifier
            label: 'Width (a)',             // Display label
            min: 0.0001,                    // Range
            max: 100.0,
            step: 0.0001,                   // Step size
            default: 1.0,                   // Default value
            info: 'Controls bell curve...'  // Help text
        }];
    }
}
```

**No UI code knows about parameter specifics.** The UI reads this metadata and generates controls automatically.

### 2. Separation of Concerns

```
Math Layer (src/math/)
    ↓ Parameter Definitions
UI Utilities (src/ui/control-utilities.js)
    ↓ Formatting & Calculation Logic
Generic Controls (src/ui/parameter-control.js)
    ↓ Parameter Rendering & Management
Custom Controls (src/ui/custom-controls.js)
    ↓ Specialized Control Behavior
Control Manager (src/ui/controls-v2.js)
    ↓ Save/Restore & Coordination
```

### 3. Composition Over Inheritance

`TransformParamsControl` doesn't inherit slider behavior—it **composes** `ParameterControl` instances:

```javascript
// TransformParamsControl creates and manages ParameterControls
paramDefs.forEach(paramDef => {
    const paramControl = new ParameterControl(id, paramDef, value);
    this.parameterControls.set(id, paramControl);
});
```

### 4. Automatic Configuration

Controls infer their behavior from parameter metadata:

- **Scale Type**: Automatically detects if increments should be adaptive/linear/log based on range
- **Formatting**: Chooses scientific notation for wide-range parameters
- **Button Behavior**: Calculates appropriate increments based on current value magnitude

---

## File Structure

```
src/ui/
├── control-base.js              Base Control class, standard controls
│                                 (SliderControl, TextControl, SelectControl, etc.)
│
├── control-utilities.js         Shared formatting & increment utilities
│                                 (createScientificFormatter, calculateAdaptiveIncrement, etc.)
│
├── parameter-control.js         Generic parameter control
│                                 (reads metadata, generates UI, handles buttons)
│
├── custom-controls.js           Complex custom controls
│                                 (DimensionInputs, MapperParams, TransformParams, Gradient)
│
├── controls-v2.js              Main control manager
│                                 (ControlManager, save/restore, auto-apply)
│
└── gradient-editor.js          Interactive gradient editor
                                 (color stops, drag-and-drop)
```

---

## Control System Layers

### Layer 1: Base Controls (`control-base.js`)

Provides fundamental control types:

```javascript
// Base class all controls extend
class Control {
    getValue()              // Get current value from DOM
    setValue(value)         // Set value in DOM
    saveToSettings(obj)     // Save to localStorage
    restoreFromSettings(obj) // Restore from localStorage
    reset()                 // Reset to default
    handleButtonAction(action) // Handle +/- buttons (optional)
}

// Standard control types
class SliderControl extends Control      // Linear sliders
class LogSliderControl extends Control   // Logarithmic sliders
class PercentSliderControl extends Control // 0-100% display, 0.0-1.0 storage
class TextControl extends Control        // Text inputs
class SelectControl extends Control      // Dropdowns
class CheckboxControl extends Control    // Checkboxes
```

### Layer 2: Utilities (`control-utilities.js`)

Pure functions for formatting and calculations:

```javascript
// Formatters
createScientificFormatter(precision, threshold)
createDecimalFormatter(precision)
createIntegerFormatter()
createFormatterFromDef(paramDef)

// Scale inference
inferScaleType(min, max, step)
// Returns 'adaptive' if max/min > 1000, else 'linear'

// Increment calculation
calculateAdaptiveIncrement(currentValue, baseStep, isLarge)
// Returns increment that scales with value magnitude
calculateLogIncrement(isLarge)
calculateLinearIncrement(step, isLarge)
```

**Example: Adaptive Increment Logic**

```javascript
// For parameter with range 0.0001 - 100
value = 10.0   → increment = 1.0    (10^(floor(log10(10)) - 1))
value = 1.0    → increment = 0.1
value = 0.05   → increment = 0.001
value = 0.0005 → increment = 0.0001 (minimum = step)

// Large increment = 10x normal increment
```

### Layer 3: Generic Parameter Control (`parameter-control.js`)

Reads parameter metadata and creates complete UI automatically:

```javascript
const paramControl = new ParameterControl(
    'transform-param-0',           // DOM element ID
    parameterDef,                  // From transform.getParameters()[0]
    1.0,                           // Default value
    { settingsKey: 'a' }          // Key for localStorage
);

// Generates HTML:
container.append(paramControl.render());

// Attaches listeners:
paramControl.attachListeners(callback);

// Handles button clicks:
paramControl.handleButtonAction('increase');
```

**Rendered Output:**

```html
<div class="control-group">
    <label>
        Width (a): <span id="transform-param-0-display">1.000</span>
    </label>
    <div class="slider-control">
        <button data-slider="transform-param-0" data-action="decrease-large">--</button>
        <button data-slider="transform-param-0" data-action="decrease">-</button>
        <input type="range" id="transform-param-0">
        <button data-slider="transform-param-0" data-action="increase">+</button>
        <button data-slider="transform-param-0" data-action="increase-large">++</button>
    </div>
    <div class="info">Controls bell curve width...</div>
</div>
```

### Layer 4: Custom Controls (`custom-controls.js`)

Specialized controls for complex behaviors:

#### DimensionInputsControl
Manages dynamic expression inputs (dx/dt, dy/dt, etc.) based on dimension count.

#### MapperParamsControl
Creates dimension selector dropdowns (Horizontal/Vertical) for 2D projection.

#### GradientControl
Wraps the gradient editor for use with ControlManager.

#### TransformParamsControl (Key Example)
Dynamically creates parameter controls based on selected transform:

```javascript
updateControls() {
    // 1. Get transform instance
    const transform = getTransform(this.getTransformType());

    // 2. Read parameters (SINGLE SOURCE OF TRUTH!)
    const paramDefs = transform.getParameters();

    // 3. Create ParameterControl for each parameter
    paramDefs.forEach((paramDef, index) => {
        const paramControl = new ParameterControl(
            `transform-param-${index}`,
            paramDef,
            defaultValue,
            { settingsKey: paramDef.name }
        );

        // 4. Render and attach
        container.append(paramControl.render());
        paramControl.attachListeners(callback);

        // 5. Store for button handling
        this.parameterControls.set(id, paramControl);
    });
}
```

### Layer 5: Control Manager (`controls-v2.js`)

Central coordinator for all controls:

```javascript
const manager = new ControlManager();

// Register controls
manager.register(new SliderControl('exposure', 1.0, {...}));
manager.register(new TransformParamsControl({}, {...}));

// Automatic save/restore
manager.saveSettings();     // → localStorage
manager.restoreSettings();  // ← localStorage
manager.resetToDefaults();  // Reset all controls

// Debounced auto-apply (300ms after last change)
manager.setupAutoApply(applyFunction, 300);
```

---

## Adding New Parameters

### Example: Add a New Transform

**Step 1: Define the transform in `transforms.js`**

```javascript
class MyNewTransform extends Transform {
    constructor() {
        super('mynew', 'My New Transform');
    }

    getParameters() {
        return [
            {
                name: 'coefficient',
                label: 'Coefficient (k)',
                type: 'slider',
                min: 0.01,
                max: 10.0,
                step: 0.01,
                default: 1.0,
                info: 'Controls the transformation strength',
                // Optional UI hints:
                displayFormat: 'scientific',  // or 'decimal', 'integer', custom function
                displayPrecision: 2,
                scale: 'adaptive'  // or 'linear', 'log' (auto-inferred if omitted)
            },
            {
                name: 'power',
                label: 'Power (n)',
                type: 'slider',
                min: 1,
                max: 5,
                step: 1,
                default: 2,
                displayFormat: 'integer'
            }
        ];
    }

    generateForward(dimensions) { /* GLSL code */ }
    generateInverse(dimensions) { /* GLSL code */ }
    generateJacobian(dimensions) { /* GLSL code */ }
}

// Add to transforms registry
const transforms = {
    // ...existing transforms
    mynew: new MyNewTransform()
};
```

**Step 2: That's it!**

No UI code changes needed. The system automatically:
- ✅ Generates sliders for both parameters
- ✅ Uses scientific notation for `coefficient` (wide range)
- ✅ Uses integer display for `power`
- ✅ Calculates adaptive increments for `coefficient`
- ✅ Creates all 4 buttons (--,-,+,++)
- ✅ Saves/restores values
- ✅ Shows info tooltips

---

## Data Flow

### Initial Render Flow

```
1. User loads page
   ↓
2. controls-v2.js creates TransformParamsControl
   ↓
3. TransformParamsControl.updateControls() called
   ↓
4. Gets transform: getTransform('rational')
   ↓
5. Reads parameters: transform.getParameters()
   Returns: [{ name: 'a', label: 'Width (a)', min: 0.0001, ... }]
   ↓
6. Creates ParameterControl for each parameter
   - Infers scale: 'adaptive' (range 0.0001-100, ratio > 1000)
   - Creates formatter: scientific notation
   - Generates HTML with label, slider, 4 buttons, info text
   ↓
7. Appends to DOM, attaches listeners
   ↓
8. User sees complete control
```

### Button Click Flow

```
1. User clicks '+' on slider
   ↓
2. Global handler catches: data-action="increase"
   ↓
3. Identifies transform param: 'transform-param-0'
   ↓
4. Calls: transformParamsControl.handleTransformParamButton(id, action)
   ↓
5. Looks up ParameterControl from map
   ↓
6. Delegates: paramControl.handleButtonAction('increase')
   ↓
7. Calculates increment:
   currentValue = 1.0
   → calculateAdaptiveIncrement(1.0, 0.0001, false)
   → returns 0.1
   ↓
8. Applies: newValue = 1.0 + 0.1 = 1.1
   ↓
9. Updates slider.val(1.1)
   ↓
10. Updates display: "1.100"
    ↓
11. Triggers 'input' event
    ↓
12. onChange callbacks fire
    ↓
13. Debounced auto-apply triggers after 300ms
    ↓
14. Renderer receives new config
```

### Settings Persistence Flow

```
Save:
  1. User changes parameter
  2. Auto-apply triggers after 300ms
  3. ControlManager.saveSettings()
  4. For each control: control.saveToSettings(settings)
  5. TransformParamsControl.getValue() collects all param values
  6. settings['transform-params'] = { a: 1.1, beta: 0.5, ... }
  7. localStorage.setItem('de-render-settings', JSON.stringify(settings))

Restore:
  1. User reloads page
  2. ControlManager.restoreSettings()
  3. settings = JSON.parse(localStorage.getItem(...))
  4. For each control: control.restoreFromSettings(settings)
  5. TransformParamsControl.setValue(settings['transform-params'])
  6. updateControls() creates new ParameterControls with saved values
  7. UI shows restored state
```

---

## API Reference

### ParameterControl

**Constructor:**
```javascript
new ParameterControl(id, parameterDef, defaultValue, options)
```

**Parameters:**
- `id` (string): DOM element ID
- `parameterDef` (object): Parameter metadata from source
  - `name` (string): Parameter identifier
  - `label` (string): Display label
  - `min` (number): Minimum value
  - `max` (number): Maximum value
  - `step` (number): Step size
  - `default` (number): Default value
  - `info` (string, optional): Help text
  - `scale` (string, optional): 'linear' | 'log' | 'adaptive' (auto-inferred)
  - `displayFormat` (string|function, optional): 'scientific' | 'decimal' | 'integer'
  - `displayPrecision` (number, optional): Decimal places (default: 2)
- `defaultValue` (number): Initial value
- `options` (object):
  - `settingsKey` (string): Key for localStorage
  - `onChange` (function): Callback when value changes

**Methods:**
- `render()` → string: Generate HTML
- `attachListeners(callback)`: Attach event handlers
- `getValue()` → number: Get current value
- `setValue(value)`: Set value
- `handleButtonAction(action)` → boolean: Handle button clicks
- `calculateIncrement(value, isLarge)` → number: Calculate increment

### TransformParamsControl

**Constructor:**
```javascript
new TransformParamsControl(defaultValue, options)
```

**Methods:**
- `setTransformControl(transformControl)`: Link to transform selector
- `getValue()` → object: Get all parameter values { a: 1.0, beta: 0.5, ... }
- `setValue(params)`: Set all parameter values
- `updateControls()`: Rebuild controls based on current transform
- `handleTransformParamButton(sliderId, action)` → boolean: Delegate to ParameterControl

### Utility Functions

**Formatters:**
```javascript
createScientificFormatter(precision=2, threshold=10)
// → (v) => v < 0.1 ? "1.00e-01" : "1.000"

createDecimalFormatter(precision=2)
// → (v) => v.toFixed(2)

createFormatterFromDef(paramDef)
// Reads paramDef.displayFormat and returns appropriate formatter
```

**Scale & Increments:**
```javascript
inferScaleType(min, max, step)
// Returns 'adaptive' if max/min > 1000, else 'linear'

calculateAdaptiveIncrement(value, step, isLarge=false)
// Returns increment that scales with magnitude:
//   value=10.0 → 1.0
//   value=1.0  → 0.1
//   value=0.05 → 0.001
//   (multiply by 10 if isLarge=true)
```

---

## Examples

### Example 1: Simple Parameter

```javascript
// In transforms.js
class SimpleTransform extends Transform {
    getParameters() {
        return [{
            name: 'strength',
            label: 'Strength',
            min: 0,
            max: 10,
            step: 0.1,
            default: 5.0,
            displayFormat: 'decimal',
            displayPrecision: 1
        }];
    }
}
```

**Result:**
- Linear slider (0-10)
- Display: "5.0"
- Buttons: +/- 0.1, ++/-- 1.0
- Auto save/restore

### Example 2: Wide-Range Parameter

```javascript
getParameters() {
    return [{
        name: 'scale',
        label: 'Scale Factor',
        min: 0.0001,
        max: 10000,
        step: 0.0001,
        default: 1.0,
        info: 'Logarithmic scale factor'
    }];
}
```

**Result:**
- Adaptive slider (auto-detected from range)
- Display: "1.000" or "1.00e+03" (scientific notation)
- Buttons adjust increment based on current value:
  - At 1.0: +/- 0.1
  - At 1000: +/- 100
  - At 0.001: +/- 0.0001

### Example 3: Multi-Parameter Transform

```javascript
getParameters() {
    return [
        {
            name: 'amplitude',
            label: 'Amplitude',
            min: 0.01,
            max: 2.0,
            step: 0.01,
            default: 0.5,
            displayFormat: 'decimal',
            displayPrecision: 2
        },
        {
            name: 'frequency',
            label: 'Frequency',
            min: 0.1,
            max: 10.0,
            step: 0.1,
            default: 1.0,
            displayFormat: 'decimal',
            displayPrecision: 1
        }
    ];
}
```

**Result:**
- Two sliders automatically created
- Each with independent formatting
- Both saved/restored together as `{ amplitude: 0.5, frequency: 1.0 }`

### Example 4: Custom Formatter

```javascript
getParameters() {
    return [{
        name: 'angle',
        label: 'Rotation Angle',
        min: 0,
        max: 360,
        step: 1,
        default: 0,
        displayFormat: (v) => `${v.toFixed(0)}°`,  // Custom function
        info: 'Rotation in degrees'
    }];
}
```

**Result:**
- Display: "45°" (custom formatter)
- Integer increments
- Info tooltip shown

---

## Design Patterns Used

### Strategy Pattern (Scale Types)
Different increment calculation strategies based on scale type:
```javascript
switch (this.scale) {
    case 'adaptive': return calculateAdaptiveIncrement(...);
    case 'log': return calculateLogIncrement(...);
    case 'linear': return calculateLinearIncrement(...);
}
```

### Factory Pattern (Formatter Creation)
Different formatters created based on parameter definition:
```javascript
switch (paramDef.displayFormat) {
    case 'scientific': return createScientificFormatter(...);
    case 'decimal': return createDecimalFormatter(...);
    case 'integer': return createIntegerFormatter();
}
```

### Composition (Control Hierarchy)
TransformParamsControl composes ParameterControl instances:
```javascript
this.parameterControls = new Map();
paramDefs.forEach(paramDef => {
    const control = new ParameterControl(...);
    this.parameterControls.set(id, control);
});
```

### Delegation (Button Handling)
TransformParamsControl delegates to ParameterControl:
```javascript
handleTransformParamButton(id, action) {
    const control = this.parameterControls.get(id);
    return control.handleButtonAction(action);
}
```

---

## Benefits Summary

### Before Refactoring
- Parameters defined in 2 places (transforms.js + custom-controls.js)
- Formatting logic duplicated 3 times
- Manual HTML generation for every parameter
- Adding transform = edit 2 files, risk of desync
- 731 lines in one monolithic file

### After Refactoring
- **Single source of truth**: Parameters in transforms.js only
- **Zero duplication**: Shared utilities centralized
- **Automatic UI generation**: ParameterControl reads metadata
- **Adding transform**: Edit 1 file (math only!)
- **Better organization**: 967 lines across 3 focused files

### Code Reduction
- Eliminated ~161 lines of duplicate code
- Replaced with ~352 lines of reusable infrastructure
- Net gain: Reusable components that work for ANY parameters

---

## Future Extensibility

The ParameterControl system can be extended to:

### Integrator Parameters
```javascript
// In integrators.js
class ImplicitEulerIntegrator {
    getParameters() {
        return [{
            name: 'iterations',
            label: 'Solver Iterations',
            min: 1,
            max: 20,
            step: 1,
            default: 5,
            displayFormat: 'integer'
        }];
    }
}

// Same pattern works!
const integratorParamsControl = new IntegratorParamsControl(...);
```

### Color Mode Parameters
```javascript
class CustomColorMode {
    getParameters() {
        return [{
            name: 'hueShift',
            label: 'Hue Shift',
            min: 0,
            max: 360,
            step: 1,
            default: 0,
            displayFormat: (v) => `${v}°`
        }];
    }
}
```

### Mapper Parameters
```javascript
class ProjectionMapper {
    getParameters() {
        return [
            { name: 'm00', label: 'Matrix [0,0]', ... },
            { name: 'm01', label: 'Matrix [0,1]', ... },
            // ... etc
        ];
    }
}
```

**All use the same ParameterControl system!**

---

## Troubleshooting

### Parameter not appearing
- Check that `getParameters()` returns array with valid schema
- Verify transform is in transforms registry
- Check browser console for errors

### Button increments wrong
- Check `min`, `max`, `step` values in parameter definition
- Verify scale type is appropriate ('adaptive' for wide ranges)
- Look at `calculateIncrement()` logic for your scale type

### Value not saving/restoring
- Ensure `settingsKey` is unique
- Check browser localStorage (DevTools → Application → Local Storage)
- Verify `saveToSettings()` and `restoreFromSettings()` are called

### Display formatting incorrect
- Check `displayFormat` and `displayPrecision` in parameter definition
- Verify formatter function is returning correct type (string)
- Look at `createFormatterFromDef()` for default behavior

---

## Related Files

- `src/math/transforms.js` - Transform definitions (parameter source of truth)
- `src/ui/control-base.js` - Base Control class and standard controls
- `src/ui/control-utilities.js` - Formatting and calculation utilities
- `src/ui/parameter-control.js` - Generic parameter control
- `src/ui/custom-controls.js` - Custom controls (TransformParams, etc.)
- `src/ui/controls-v2.js` - Main control manager
- `archive/deprecated/custom-controls-old.js` - Old implementation (reference)

---

**Document Maintained By:** Claude Code
**Architecture Status:** Stable (as of 2025-11-08)
