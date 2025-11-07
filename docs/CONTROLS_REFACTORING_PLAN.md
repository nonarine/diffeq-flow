# Controls System Refactoring Plan

## Problem Statement

The current controls system has significant duplication and scattered responsibilities, particularly for transform parameters:

### Current Issues

1. **Dual Source of Truth**
   - Transform parameters defined in `src/math/transforms.js` (`getParameters()` method)
   - **Same parameters** duplicated in `src/ui/custom-controls.js` (`transformParams` object)
   - Changes must be made in both places or bugs occur (min/max drift issue)

2. **Scattered Responsibilities**
   - Parameter metadata: `transforms.js`
   - Slider HTML generation: `custom-controls.js:516-531`
   - Slider attribute setting: `custom-controls.js:545-548`
   - Display formatting: `custom-controls.js:510-516, 567-573, 604-610` (duplicated 3 times!)
   - Button handling: `custom-controls.js:629-660`
   - Value change listeners: `custom-controls.js:601-616`

3. **Inconsistent Patterns**
   - Standard controls: Use `Control` base classes, participate in `ControlManager`
   - Transform parameters: Raw HTML generation, manual attribute setting, custom button handler
   - Standard controls have `handleButtonAction()` - transform params have separate `handleTransformParamButton()`

4. **Hard to Extend**
   - Adding a new transform requires updating TWO files
   - Adding a new slider type (e.g., log-scale transform param) requires updating MULTIPLE functions
   - No clear pattern for "this parameter needs special handling"

### Code Duplication Examples

**Scientific notation formatting** (appears 3 times in `custom-controls.js`):
```javascript
// Line 510, 567, 604 - IDENTICAL
const formatScientific = (v) => {
    if (Math.abs(v) >= 10 || Math.abs(v) < 0.1) {
        return v.toExponential(2);
    } else {
        return v.toFixed(3);
    }
};
```

**Parameter definitions** (duplicated across 2 files):
```javascript
// transforms.js:412-422
getParameters() {
    return [{
        name: 'a',
        label: 'Width (a)',
        min: TRANSFORM_PARAM_MIN,
        max: TRANSFORM_PARAM_MAX,
        // ...
    }];
}

// custom-controls.js:427-429 - DUPLICATE!
rational: [
    { name: 'a', label: 'Width (a)', min: TRANSFORM_PARAM_MIN, /* ... */ }
],
```

## Design Goals

1. **Single Source of Truth**: Parameter metadata lives in ONE place only
2. **Self-Contained Controls**: Each control knows how to render itself, handle buttons, format display
3. **Consistent Patterns**: All controls follow the same architecture (extend `Control` base class)
4. **Easy to Extend**: Adding new transforms or parameter types requires minimal changes
5. **Type Safety**: Clear contracts for what a parameter definition must provide
6. **Separation of Concerns**: Math code (transforms) doesn't know about DOM, UI code doesn't duplicate math metadata

## Proposed Architecture

### 1. Enhanced Parameter Metadata Schema

Transform classes already return parameter metadata via `getParameters()`. Enhance this with optional UI hints:

```javascript
// In transforms.js
getParameters() {
    return [{
        name: 'a',
        label: 'Width (a)',
        type: 'slider',           // 'slider' | 'log-slider' | 'adaptive-slider' | 'text' | 'checkbox'
        min: TRANSFORM_PARAM_MIN,
        max: TRANSFORM_PARAM_MAX,
        step: TRANSFORM_PARAM_STEP,
        default: 1.0,
        info: 'Controls bell curve width...',

        // Optional UI hints:
        scale: 'linear',          // 'linear' | 'log' | 'adaptive' (defaults to 'adaptive' for wide ranges)
        displayFormat: 'scientific', // 'scientific' | 'decimal' | 'integer' | custom function
        displayPrecision: 2,      // How many decimals/significant figures
    }];
}
```

### 2. Generic `ParameterControl` Class

Create a new control type that reads parameter metadata and creates appropriate UI:

```javascript
// In control-base.js or new file parameter-control.js

export class ParameterControl extends Control {
    constructor(id, parameterDef, defaultValue, options = {}) {
        super(id, defaultValue, options);
        this.parameterDef = parameterDef;
        this.scale = parameterDef.scale || this.inferScale(parameterDef);
        this.formatter = this.createFormatter(parameterDef);
    }

    /**
     * Infer scale type from parameter range
     * If max/min ratio > 1000, use 'log' or 'adaptive'
     */
    inferScale(paramDef) {
        if (paramDef.min > 0 && paramDef.max / paramDef.min > 1000) {
            return 'log'; // or 'adaptive'
        }
        return 'linear';
    }

    /**
     * Create display formatter from parameter definition
     */
    createFormatter(paramDef) {
        if (typeof paramDef.displayFormat === 'function') {
            return paramDef.displayFormat;
        }

        switch (paramDef.displayFormat) {
            case 'scientific':
                return (v) => {
                    const threshold = Math.pow(10, paramDef.displayPrecision || 1);
                    if (Math.abs(v) >= threshold || Math.abs(v) < 1.0 / threshold) {
                        return v.toExponential(paramDef.displayPrecision || 2);
                    }
                    return v.toFixed(paramDef.displayPrecision || 3);
                };
            case 'integer':
                return (v) => v.toFixed(0);
            case 'decimal':
            default:
                return (v) => v.toFixed(paramDef.displayPrecision || 2);
        }
    }

    /**
     * Calculate adaptive increment based on current value
     */
    calculateIncrement(currentValue, isLarge = false) {
        if (this.scale === 'adaptive') {
            const absValue = Math.abs(currentValue);
            let increment = absValue < this.parameterDef.step
                ? this.parameterDef.step
                : Math.pow(10, Math.floor(Math.log10(absValue)) - 1);
            increment = Math.max(this.parameterDef.step, increment);
            return isLarge ? increment * 10 : increment;
        } else if (this.scale === 'log') {
            // Log scale: increment in slider space
            return isLarge ? 10 : 1;
        } else {
            // Linear scale: use step
            const step = this.parameterDef.step || 0.01;
            return isLarge ? step * 10 : step;
        }
    }

    /**
     * Handle button actions (unified for all scale types)
     */
    handleButtonAction(action) {
        const element = $(`#${this.id}`);
        if (!element.length) return false;

        const currentValue = this.getValue();
        const min = this.parameterDef.min;
        const max = this.parameterDef.max;

        let increment = this.calculateIncrement(currentValue,
            action.includes('large'));

        let newValue = currentValue;
        if (action.startsWith('increase')) {
            newValue = Math.min(max, currentValue + increment);
        } else if (action.startsWith('decrease')) {
            newValue = Math.max(min, currentValue - increment);
        } else if (action === 'reset') {
            newValue = this.defaultValue;
        } else {
            return false;
        }

        if (newValue !== currentValue) {
            this.setValue(newValue);
            element.trigger('input');
            return true;
        }
        return false;
    }

    /**
     * Render the control HTML
     */
    render() {
        const displayId = `${this.id}-display`;
        const currentValue = this.defaultValue;

        return `
            <div class="control-group">
                <label>
                    ${this.parameterDef.label}:
                    <span class="range-value" id="${displayId}">
                        ${this.formatter(currentValue)}
                    </span>
                </label>
                <div class="slider-control">
                    <button class="slider-btn" data-slider="${this.id}" data-action="decrease-large">--</button>
                    <button class="slider-btn" data-slider="${this.id}" data-action="decrease">-</button>
                    <input type="range" id="${this.id}">
                    <button class="slider-btn" data-slider="${this.id}" data-action="increase">+</button>
                    <button class="slider-btn" data-slider="${this.id}" data-action="increase-large">++</button>
                </div>
                ${this.parameterDef.info ? `<div class="info">${this.parameterDef.info}</div>` : ''}
            </div>
        `;
    }

    /**
     * Attach to DOM and set up listeners
     */
    attachListeners(callback) {
        const element = $(`#${this.id}`);
        this.element = element;
        this.displayElement = $(`#${this.id}-display`);

        // Set slider attributes
        element.attr('min', this.parameterDef.min);
        element.attr('max', this.parameterDef.max);
        element.attr('step', this.parameterDef.step);
        element.val(this.defaultValue);

        // Update display
        this.updateDisplay(this.defaultValue);

        // Listen for changes
        element.on('input', () => {
            const value = this.getValue();
            this.updateDisplay(value);
            if (this.onChange) this.onChange(value);
            if (callback) callback();
        });
    }

    updateDisplay(value) {
        if (this.displayElement) {
            this.displayElement.text(this.formatter(value));
        }
    }

    getValue() {
        return parseFloat(this.element.val());
    }

    setValue(value) {
        this.element.val(value);
        this.updateDisplay(value);
    }
}
```

### 3. Refactored `TransformParamsControl`

Simplified control that uses `ParameterControl` instances:

```javascript
export class TransformParamsControl extends Control {
    constructor(id, transformControl, options = {}) {
        super(id, {}, options);
        this.transformControl = transformControl;
        this.parameterControls = new Map(); // paramName -> ParameterControl
    }

    updateControls() {
        const container = $('#transform-controls');
        container.empty();
        this.parameterControls.clear();

        // Get transform instance
        const transformType = this.transformControl.getValue();
        const transform = getTransformByName(transformType); // Need to expose this

        if (!transform) return;

        const paramDefs = transform.getParameters();
        if (paramDefs.length === 0) return;

        // Create ParameterControl for each parameter
        paramDefs.forEach((paramDef, index) => {
            const controlId = `transform-param-${index}`;
            const defaultValue = this.currentParams[paramDef.name] ?? paramDef.default;

            const paramControl = new ParameterControl(
                controlId,
                paramDef,
                defaultValue,
                {
                    settingsKey: paramDef.name,
                    onChange: (value) => {
                        this.currentParams[paramDef.name] = value;
                        if (this.onChange) this.onChange(this.currentParams);
                    }
                }
            );

            // Render and attach
            container.append(paramControl.render());
            paramControl.attachListeners(this.onChangeCallback);

            // Register for button handling
            this.parameterControls.set(controlId, paramControl);
        });

        this.updateAccordionHeight();
    }

    handleTransformParamButton(sliderId, action) {
        const control = this.parameterControls.get(sliderId);
        if (control) {
            return control.handleButtonAction(action);
        }
        return false;
    }

    // ... rest of methods simplified
}
```

### 4. Integration with Global Button Handler

The global button handler becomes even simpler:

```javascript
// In controls-v2.js
$(document).on('click', '.slider-btn', function() {
    const sliderId = $(this).data('slider');
    const action = $(this).data('action');

    // Try registered control
    const control = manager.get(sliderId);
    if (control && control.handleButtonAction) {
        control.handleButtonAction(action);
        return;
    }

    // Try transform parameter controls
    if (sliderId.startsWith('transform-param-')) {
        const transformParamsControl = manager.get('transform-params');
        if (transformParamsControl?.handleTransformParamButton) {
            transformParamsControl.handleTransformParamButton(sliderId, action);
        }
        return;
    }

    console.warn(`No button handler found for slider: ${sliderId}`);
});
```

## Implementation Plan

### Phase 1: Extract and Centralize Formatting Logic
**Goal**: Remove duplication, prepare for ParameterControl

**Steps**:
1. Create utility functions in `control-base.js`:
   - `createScientificFormatter(threshold, precision)`
   - `createDecimalFormatter(precision)`
   - `inferScaleType(min, max, step)`
   - `calculateAdaptiveIncrement(value, step)`

2. Update existing controls to use these utilities:
   - `AdaptiveSliderControl`: Use `calculateAdaptiveIncrement()`
   - `LogSliderControl`: Use shared formatting
   - `TransformParamsControl`: Use shared formatting

3. Test: Verify all controls still work identically

**Files Modified**:
- `src/ui/control-base.js` (add utilities)
- `src/ui/custom-controls.js` (use utilities)

**Time Estimate**: 2-3 hours
**Risk**: Low (utilities are pure functions, easy to test)

### Phase 2: Create ParameterControl Class
**Goal**: Implement generic parameter control

**Steps**:
1. Create `src/ui/parameter-control.js` with `ParameterControl` class
2. Implement core methods:
   - Constructor (parse parameter definition)
   - `render()` (generate HTML)
   - `attachListeners()` (set up DOM)
   - `handleButtonAction()` (unified button handling)
   - `getValue()` / `setValue()` (value management)
   - `updateDisplay()` (formatted display)

3. Add scale type detection:
   - Automatic inference from min/max ratio
   - Support for explicit `scale` parameter

4. Add formatter creation:
   - Parse `displayFormat` parameter
   - Default to scientific for wide ranges

5. Write unit tests (if testing infrastructure exists)

**Files Created**:
- `src/ui/parameter-control.js`

**Time Estimate**: 4-5 hours
**Risk**: Medium (new class, needs thorough testing)

### Phase 3: Migrate One Transform as Proof of Concept
**Goal**: Validate architecture with real-world usage

**Steps**:
1. Choose simplest transform (e.g., `RationalTransform` - single parameter)

2. Enhance parameter metadata in `transforms.js`:
   ```javascript
   getParameters() {
       return [{
           name: 'a',
           label: 'Width (a)',
           type: 'slider',
           min: TRANSFORM_PARAM_MIN,
           max: TRANSFORM_PARAM_MAX,
           step: TRANSFORM_PARAM_STEP,
           default: 1.0,
           scale: 'adaptive',
           displayFormat: 'scientific',
           displayPrecision: 2,
           info: 'Controls bell curve width...'
       }];
   }
   ```

3. Update `TransformParamsControl` to use `ParameterControl` for this one transform

4. Remove corresponding entry from `this.transformParams` object

5. Test thoroughly:
   - Slider works
   - Buttons work (all 4: --, -, +, ++)
   - Display formatting correct
   - Value persistence works
   - Integration with renderer works

**Files Modified**:
- `src/math/transforms.js` (enhance one transform)
- `src/ui/custom-controls.js` (use ParameterControl conditionally)

**Time Estimate**: 3-4 hours
**Risk**: Medium (integration testing critical)

### Phase 4: Migrate Remaining Transforms
**Goal**: Complete the migration

**Steps**:
1. Migrate transforms one-by-one:
   - `PowerTransform`
   - `TanhTransform`
   - `SigmoidTransform`
   - `SineTransform` (multi-parameter test case!)
   - `RadialPowerTransform`
   - `ExpTransform`

2. Test each migration before moving to next

3. Once all migrated, delete `this.transformParams` object entirely

4. Update `TransformParamsControl.updateControls()` to always use `ParameterControl`

**Files Modified**:
- `src/math/transforms.js` (all transform classes)
- `src/ui/custom-controls.js` (remove duplicate definitions)

**Time Estimate**: 4-6 hours
**Risk**: Low (following proven pattern from Phase 3)

### Phase 5: Cleanup and Documentation
**Goal**: Remove dead code, document new pattern

**Steps**:
1. Remove `this.transformParams` object from `TransformParamsControl`

2. Remove constants from `custom-controls.js` (only needed in `transforms.js`)

3. Update `docs/CONTROL_REFACTORING.md` with new architecture

4. Add JSDoc comments to `ParameterControl` class

5. Update `CLAUDE.md` with new patterns:
   ```markdown
   ## Adding New Transform Parameters

   1. Define parameters in transform's `getParameters()` method
   2. Include UI hints (scale, displayFormat, etc.)
   3. No UI code changes needed - ParameterControl handles everything!
   ```

**Files Modified**:
- `src/ui/custom-controls.js` (cleanup)
- `src/ui/parameter-control.js` (documentation)
- `docs/CONTROL_REFACTORING.md` (update)
- `CLAUDE.md` (update)

**Time Estimate**: 2-3 hours
**Risk**: Very Low

## Benefits

### Immediate Benefits

1. **Single Source of Truth**: Parameters defined once in `transforms.js`
2. **No More Duplication**: Formatting logic centralized
3. **Consistent Behavior**: All parameter sliders work the same way
4. **Easier to Extend**: Add new transform = add one method, zero UI code

### Long-Term Benefits

1. **Reusability**: `ParameterControl` can be used for ANY dynamic parameters:
   - Integrator parameters (solver iterations, tolerance, etc.)
   - Mapper parameters (projection matrix entries)
   - Color mode parameters
   - Rendering parameters

2. **Flexibility**: Easy to add new scale types or formatters:
   ```javascript
   // Future: add exponential scale
   scale: 'exponential'  // 0.001, 0.01, 0.1, 1, 10, 100
   ```

3. **Testability**: Parameter controls can be unit tested:
   ```javascript
   test('adaptive increment calculation', () => {
       const param = { min: 0.0001, max: 100, step: 0.0001 };
       const control = new ParameterControl('test', param, 1.0);
       expect(control.calculateIncrement(1.0)).toBe(0.1);
       expect(control.calculateIncrement(0.05)).toBe(0.001);
   });
   ```

4. **Serialization**: Parameters can be easily saved/loaded:
   ```javascript
   const paramDef = transform.getParameters()[0];
   const serialized = JSON.stringify(paramDef); // Works!
   ```

## Risks and Mitigation

### Risk 1: Breaking Changes
**Impact**: High
**Probability**: Medium

**Mitigation**:
- Migrate one transform at a time
- Test thoroughly after each migration
- Keep old code in place until all transforms migrated
- Can rollback individual transforms if issues found

### Risk 2: Performance Impact
**Impact**: Low
**Probability**: Low

**Mitigation**:
- `ParameterControl` is no more complex than current approach
- Rendering happens once per transform change (infrequent)
- Formatters are created once, reused many times

### Risk 3: Increased Complexity
**Impact**: Medium
**Probability**: Low

**Mitigation**:
- New code is actually SIMPLER (removes duplication)
- Good documentation will prevent confusion
- Pattern is consistent with existing `Control` architecture

### Risk 4: Settings Compatibility
**Impact**: Medium
**Probability**: Low

**Mitigation**:
- ParameterControl uses same settingsKey system
- Saved settings will load correctly
- No data migration needed

## Success Criteria

The refactoring is successful when:

1. ✅ All transform parameters work identically to before
2. ✅ No duplication of parameter definitions
3. ✅ No duplication of formatting logic
4. ✅ Adding new transform requires zero UI code
5. ✅ All sliders have consistent button behavior
6. ✅ Settings save/restore still works
7. ✅ Code is more maintainable (fewer lines, clearer structure)

## Total Time Estimate

- Phase 1 (Utilities): 2-3 hours
- Phase 2 (ParameterControl): 4-5 hours
- Phase 3 (Proof of Concept): 3-4 hours
- Phase 4 (Migration): 4-6 hours
- Phase 5 (Cleanup): 2-3 hours

**Total: 15-21 hours** (2-3 days of focused work)

## Alternative Approaches Considered

### Alternative 1: Keep Duplication, Add Validation
- Add runtime checks that transforms.js and custom-controls.js match
- Alert if definitions drift

**Rejected because**: Doesn't fix root problem, adds complexity

### Alternative 2: UI-First Approach
- Define parameters in `custom-controls.js`
- Transforms query UI for their parameters

**Rejected because**: Wrong direction - math should not depend on UI

### Alternative 3: Configuration File
- Move all parameters to separate JSON config file
- Both UI and transforms read from config

**Rejected because**: Adds indirection, loses code co-location benefits

## Conclusion

This refactoring will significantly improve code quality and maintainability. The phased approach minimizes risk while delivering incremental value. The `ParameterControl` pattern can be extended to other dynamic parameters throughout the application.

**Recommendation**: Proceed with refactoring, starting with Phase 1.
