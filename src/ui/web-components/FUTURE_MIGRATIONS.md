# Future Slider Migrations

This document tracks sliders that have NOT yet been migrated to Web Components and architectural improvements planned.

## Current Status (2025-11-20)

### ✅ Phase 1 Complete: Web Component Migration (23/25 sliders)
- **Linear sliders (6)**: dimensions, implicit-iterations, particles, drop, supersample-factor, bloom-radius
- **Linear with transform (2)**: bilateral-spatial, bilateral-intensity (using transform attribute)
- **Log sliders (8)**: exposure, gamma, luminance-gamma, highlight-compression, compression-threshold, white-point, particle-intensity, particle-size, frame-limit
- **Percent sliders (7)**: smaa-intensity, smaa-threshold, bloom-intensity, bloom-alpha, color-saturation, brightness-desat, saturation-buildup

**Code Reduction Achieved:**
- Deleted 268+ lines of old control code
- Reduced HTML verbosity by ~40%
- Single-line registration: `webComponentRegistry.register('log-slider', 'exposure')`

### ⚠️ Current Issues (Animation Controls)

**Problem:** Animation controls (animation-alpha, animation-speed) have timing issues:
- Registered AFTER `manager.initializeControls()` runs (late registration)
- HTML is dynamically injected, requiring manual `attachListeners()` calls
- Requires manual `updateDisplay()` calls
- Repetitive boilerplate for late-registered controls

**Root Cause:** Tight coupling between controls and ControlManager/Renderer

### ⏳ Not Yet Migrated

#### Percent Sliders (1 slider)
The `<percent-slider>` component exists and is ready to use.

1. **animation-alpha** (PercentSliderControl)
   - Default: 0.0
   - Settings: `animationAlpha`
   - Special: Has onChange handler to update all animatable controls and renderer
   - Note: This control doesn't exist in HTML yet (animation system uses different approach)

#### Animatable Sliders (2 sliders)
Need special components with animation bounds UI.

1. **fade** (AnimatableSliderControl)
   - Default: 0.999
   - Parameters: min: 0, max: 100, step: 0.1
   - Settings: `fadeOpacity`
   - Animation Range: min: 0.95, max: 0.9995
   - Special: Custom transform/inverseTransform for logarithmic scale mapping
     - Transform: slider [0-100] → value [0.9-0.9999] using log scale
     - Inverse: value [0.9-0.9999] → slider [0-100]

2. **timestep** (AnimatableTimestepControl)
   - Default: 0.01
   - Parameters: min: 0.001, max: 2.5, step: 0.001
   - Settings: `timestep`
   - Animation Range: min: 0.001, max: 0.1
   - Special: Custom control with `--` `-` `+` `++` buttons
   - Increments: smallIncrement: 0.001, largeIncrement: 0.01

#### Dynamic Sliders
Created at runtime based on transform selection.

**Transform Parameters** (TransformParamsControl)
- Created by: `TransformParamsControl` class in `custom-controls.js`
- Type: `AnimatableParameterControl`
- Each transform can have 0-N parameters
- Parameters defined in `src/math/transforms.js`
- Each parameter gets its own animatable slider with bounds UI
- Settings stored in `transformParams` object

## Implementation Notes

### Percent Slider Component

When creating `<percent-slider>`, it should:
- Display 0-100 in the UI
- Store 0.0-1.0 in settings (divide by 100)
- Extend LinearSlider with transform="100" by default
- Could be implemented as:
  ```javascript
  export class PercentSlider extends LinearSlider {
      constructor() {
          super();
          this.transform = 100; // Always divide by 100
      }
  }
  ```

### Animatable Slider Components

When creating animatable sliders:
- Need multi-thumb bounds UI (MIN/MAX handles)
- Orange indicator for current value during playback
- Store animation bounds in separate settings object
- See `src/ui/animatable-slider.js` for reference implementation

### Fade Slider Transform

The fade slider uses a custom logarithmic transform that needs special handling:
```javascript
// Transform: map slider position [0-100] to fade value [0.9-0.9999]
transform: (sliderValue) => {
    const minFade = 0.9;
    const maxFade = 0.9999;
    const minLog = Math.log(1 - minFade);  // log(0.1)
    const maxLog = Math.log(1 - maxFade);  // log(0.0001)
    const t = sliderValue / 100;
    const logValue = minLog + t * (maxLog - minLog);
    return 1 - Math.exp(logValue);
}
```

This is more complex than simple linear transforms and may require extending the base component.

## Recommended Migration Order

1. **Phase 1**: Percent sliders (straightforward, just need new component)
2. **Phase 2**: Fade slider (medium complexity, custom transform)
3. **Phase 3**: Timestep slider (medium complexity, custom buttons)
4. **Phase 4**: Transform parameter sliders (most complex, dynamic creation)

## Benefits After Full Migration

- **~50% less code** in controls-v2.js
- **~40% less code** in index.html
- All sliders use declarative HTML
- Consistent behavior across all controls
- Easier to add new sliders (just add HTML + one line of JS)
- Transform support available for future use cases

---

## Phase 2: Mixin-Based Architecture Refactoring

### Goal
Decouple controls from application-specific code (ControlManager, Renderer) to make them truly reusable and eliminate repetitive boilerplate.

### Current Problems

**Tight Coupling:**
```javascript
// Controls directly reference ControlManager
class SliderControl {
    onChange() {
        manager.debouncedApply(); // Hardcoded dependency
    }
}

// Different apply behaviors scattered everywhere
new SliderControl('gamma', 2.2, { onChange: () => manager.debouncedApply() });
new CheckboxControl('frame-limit', false, { onChange: (v) => { renderer.frameLimit = v; manager.apply(); } });
new PercentSliderControl('animation-alpha', 0.0, { onChange: (v) => { renderer.setAnimationAlpha(v); /* no debounce */ } });
```

**Repetitive Patterns:**
- Standard debounced apply (90% of controls)
- Immediate apply (animation controls)
- Renderer synchronization (frame limit, etc.)
- Custom onChange hooks (dimensions, mapper params)
- Late registration handling

### Proposed Solution: Composition via Mixins

**Core Idea:** Use functional mixins to compose behaviors, keeping base classes pure and dependency-free.

#### Architecture

```javascript
// ============================================
// Pure Base Classes (NO dependencies)
// ============================================
class Control {
    constructor(id, defaultValue, options = {}) {
        this.id = id;
        this.value = defaultValue;
        this.settingsKey = options.settingsKey || id;

        // Generic hook - NO hardcoded dependencies
        this.onValueChange = options.onValueChange || (() => {});
    }

    setValue(value) {
        this.value = value;
        this.updateDisplay();
        this.onValueChange(value); // Just a callback
    }
}

// ============================================
// Behavior Mixins (app-specific)
// ============================================

// Standard debounced apply
const withDebouncedApply = (manager) => (Base) => class extends Base {
    constructor(...args) {
        super(...args);
        const original = this.onValueChange;
        this.onValueChange = (value) => {
            manager.debouncedApply();
            original.call(this, value);
        };
        manager.register(this);
    }
};

// Immediate apply (no debounce)
const withImmediateApply = (manager) => (Base) => class extends Base {
    constructor(...args) {
        super(...args);
        const original = this.onValueChange;
        this.onValueChange = (value) => {
            manager.apply();
            original.call(this, value);
        };
        manager.register(this);
    }
};

// Renderer synchronization
const withRendererSync = (renderer, prop) => (Base) => class extends Base {
    constructor(...args) {
        super(...args);
        const original = this.onValueChange;
        this.onValueChange = (value) => {
            if (renderer) renderer[prop] = value;
            original.call(this, value);
        };
    }
};

// Custom onChange hook
const withOnChange = (callback) => (Base) => class extends Base {
    constructor(...args) {
        super(...args);
        const original = this.onValueChange;
        this.onValueChange = (value) => {
            callback.call(this, value);
            original.call(this, value);
        };
    }
};

// Late registration (after initializeControls)
const withLateRegistration = (manager) => (Base) => class extends Base {
    constructor(...args) {
        super(...args);
        requestAnimationFrame(() => {
            if (document.getElementById(this.id)) {
                this.attachListeners(() => manager.debouncedApply());
                this.updateDisplay();
            }
        });
        manager.register(this);
    }
};

// ============================================
// Context Object (provides mixins)
// ============================================
function createAppContext(manager, renderer) {
    return {
        // Common compositions
        managed: (Base) => withDebouncedApply(manager)(Base),
        immediate: (Base) => withImmediateApply(manager)(Base),
        rendererBound: (prop) => (Base) =>
            withRendererSync(renderer, prop)(
                withDebouncedApply(manager)(Base)
            ),
        late: (Base) => withLateRegistration(manager)(withDebouncedApply(manager)(Base)),

        // Individual mixins for custom composition
        mixins: {
            debounced: withDebouncedApply(manager),
            immediate: withImmediateApply(manager),
            rendererSync: withRendererSync,
            onChange: withOnChange,
            late: withLateRegistration(manager)
        },

        manager,
        renderer
    };
}
```

#### Usage Examples

```javascript
const ctx = createAppContext(manager, renderer);

// ============================================
// Standard controls (90% of cases)
// ============================================
const ManagedSlider = ctx.managed(SliderControl);
new ManagedSlider('gamma', 2.2, {
    settingsKey: 'gamma',
    minValue: 0.2,
    maxValue: 10.0
});

// ============================================
// Renderer-bound control
// ============================================
const FrameLimitCheckbox = ctx.rendererBound('frameLimitEnabled')(CheckboxControl);
new FrameLimitCheckbox('frame-limit-enabled', false);

// ============================================
// Custom onChange behavior
// ============================================
const DimensionsSlider = ctx.mixins.onChange((value) => {
    const expressionsControl = ctx.manager.get('dimension-inputs');
    if (expressionsControl) expressionsControl.updateInputs(value);

    const mapperControl = ctx.manager.get('mapper-params');
    if (mapperControl) mapperControl.updateControls();
})(ctx.managed(LinearSlider));

new DimensionsSlider('dimensions', 2, { settingsKey: 'dimensions' });

// ============================================
// Animation controls (immediate + custom)
// ============================================
const AnimationAlpha = ctx.mixins.onChange((value) => {
    if (ctx.renderer) {
        ctx.renderer.setAnimationAlpha(value);
        if ($('#animation-clear-particles').is(':checked')) {
            ctx.renderer.resetParticles();
        }
    }
})(ctx.immediate(PercentSliderControl));

// Late-registered control
const AnimationSpeed = ctx.late(SliderControl);
// ... after HTML injection
animationSpeedControl = new AnimationSpeed('animation-speed', 10, {
    displayFormat: v => {
        animationStepsPerIncrement = Math.round(v);
        return Math.round(v).toString();
    }
});

// ============================================
// Complex composition
// ============================================
const ComplexControl = ctx.mixins.onChange(customLogic)(
    ctx.mixins.rendererSync(renderer, 'someProp')(
        ctx.managed(SliderControl)
    )
);
```

### Migration Plan

**Phase 2A: Create Mixin Infrastructure**
1. Create `src/ui/control-mixins.js` with all behavior mixins
2. Add `createAppContext()` factory function
3. Add unit tests for each mixin

**Phase 2B: Refactor controls-v2.js**
1. Import mixins and create context at top of `initControls()`
2. Replace all standard control registrations with composed versions
3. Replace custom onChange handlers with mixin compositions
4. Test that all controls work identically

**Phase 2C: Clean Up**
1. Remove hardcoded dependencies from base Control classes
2. Make Control classes export-friendly (pure, no globals)
3. Update documentation

### Benefits

**1. Code Reduction:**
```javascript
// Before (6 lines per control)
const gammaControl = manager.register(new LogSliderControl('gamma', 2.2, {
    settingsKey: 'gamma',
    minValue: 0.2,
    maxValue: 10.0,
    displayId: 'gamma-value',
    onChange: () => manager.debouncedApply()
}));

// After (3 lines per control)
const ManagedLogSlider = ctx.managed(LogSliderControl);
new ManagedLogSlider('gamma', 2.2, {
    settingsKey: 'gamma', minValue: 0.2, maxValue: 10.0
});
```

**2. Explicit Behaviors:**
- `ctx.managed(...)` = debounced apply
- `ctx.immediate(...)` = immediate apply
- `ctx.rendererBound(prop)(...)` = syncs to renderer
- `ctx.late(...)` = late registration

**3. DRY Principle:**
Each behavior defined once, composed everywhere:
- `withDebouncedApply` - used by 90% of controls
- `withImmediateApply` - animation controls
- `withRendererSync` - renderer-bound controls
- `withOnChange` - custom one-off logic
- `withLateRegistration` - animation panel controls

**4. Testability:**
```javascript
// Test mixins independently
const TestControl = withDebouncedApply(mockManager)(Control);
// Verify debounced behavior in isolation
```

**5. Reusability:**
Pure Control classes can be extracted to a library, mixins stay in app code.

### Files to Create/Modify

**New Files:**
- `src/ui/control-mixins.js` - All mixin definitions
- `src/ui/control-mixins.test.js` - Unit tests

**Modified Files:**
- `src/ui/control-base.js` - Remove hardcoded dependencies, make pure
- `src/ui/controls-v2.js` - Replace all registrations with composed versions

### Estimated Effort

- Infrastructure: ~2 hours (create mixins, context, tests)
- Refactoring: ~3 hours (replace all control registrations)
- Testing: ~1 hour (verify all controls work)
- **Total: ~6 hours**

### Success Criteria

- ✅ All controls work identically to before
- ✅ No hardcoded manager/renderer references in base classes
- ✅ Animation controls work without manual `attachListeners()` calls
- ✅ Code reduction: ~30% fewer lines in controls-v2.js
- ✅ Each behavior mixin has unit tests
