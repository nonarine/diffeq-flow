# API Reference

_Auto-generated from inline JSDoc documentation_

_Generated: 2025-11-27T13:25:58.929Z_

---

## animation/

### animation-controller.js

#### `variable()`

AnimationController - Alpha-based parameter animation system

Manages interactive real-time parameter animation using a simple alpha variable (0.0-1.0).
This is separate from the Animator keyframe system (animator.js), which is used for
professional batch rendering with complex timelines.

Responsibilities:
- Manage animation alpha state and playback loop
- Query and update animatable controls
- Frame capture during animation
- Timing smoothing with EMA
- Shader lock management
- Integration with renderer

Usage:
  const controller = new AnimationController(renderer, controlManager);
  controller.setAlpha(0.5);  // Manual alpha change
  controller.start();         // Begin auto-animation
  controller.stop();          // Stop auto-animation

#### `system(alpha, updateControls)`

Set current alpha value and optionally update animatable controls

**Parameters:**

- `alpha` *number* - - Alpha value (0.0 to 1.0)
- `updateControls` *boolean* - - Whether to update animatable controls

#### `system()`

Get current alpha value

**Returns:** *number* - alpha (0.0 to 1.0)

#### `system(stepsPerIncrement)`

Set animation speed (steps per increment)

**Parameters:**

- `stepsPerIncrement` *number* - - Number of integration steps before incrementing alpha

#### `system(options, options.clearParticles, options.clearScreen, options.smoothTiming, options.lockShaders)`

Set animation options

**Parameters:**

- `options` *Object* - - Animation options
- `options.clearParticles` *boolean* - - Clear particles on alpha change
- `options.clearScreen` *boolean* - - Clear screen on alpha change (freeze mode)
- `options.smoothTiming` *boolean* - - Enable timing smoothing with EMA
- `options.lockShaders` *boolean* - - Lock shader recompilation during animation

#### `system(captureOptions, captureOptions.captureFrames, captureOptions.totalFrames, captureOptions.loops, captureOptions.halfLoops, captureOptions.onProgress, captureOptions.onComplete)`

Start auto-animation

**Parameters:**

- `captureOptions` *Object* - - Optional frame capture configuration
- `captureOptions.captureFrames` *boolean* - - Whether to capture frames
- `captureOptions.totalFrames` *number* - - Total frames to capture
- `captureOptions.loops` *number* - - Number of loops
- `captureOptions.halfLoops` *boolean* - - Whether to count as half-loops
- `captureOptions.onProgress` *Function* - - Progress callback (frameCount, totalFrames, alpha)
- `captureOptions.onComplete` *Function* - - Completion callback (frames)

#### `AnimationController(elapsed)`

Update timing EMA for smoothing

**Parameters:**

- `elapsed` *number* - - Elapsed time in milliseconds

#### `setAlpha()`

Capture current frame

#### `setAlpha(alpha)`

Emit alpha changed event to listeners

**Parameters:**

- `alpha` *number* - - New alpha value


### animator.js

#### `pow()`

Pause animation

#### `pow()`

Resume animation

#### `pow()`

Stop animation

#### `pow()`

Download all captured frames as ZIP

#### `pow()`

Download frames as ZIP archive

#### `pow()`

Download frames individually

#### `pow()`

Download blob as file


## math/

### coordinate-charts.js

#### `transforms()`

Coordinate Chart Generation

Automatically detects singularities in coordinate transforms (primarily atan2)
and generates multiple coordinate charts to avoid numerical issues near singularities.

Uses the "atlas" approach from differential geometry: cover the space with
multiple charts, each with singularities in different locations.

#### `transforms(expression)`

Detect atan2(A, B) patterns in an expression

**Parameters:**

- `expression` *string* - - Math expression to analyze

**Returns:** *Array<{numerator, denominator, fullMatch}>* - Array of atan2 patterns found

#### `transforms(forwardTransforms, atan2Info)`

Generate an alternative chart by swapping atan2 arguments
For atan2(y, x) → generate chart with π/2 - atan2(x, y)


**Parameters:**

- `forwardTransforms` *Array<string>* - - Original coordinate transforms
- `atan2Info` *Object* - - {numerator, denominator, fullMatch}

**Returns:** *Object* - {condition, forwardTransforms}


### coordinate-systems.js

#### `systems()`

Coordinate Systems Module

Defines alternate coordinate systems (polar, spherical, etc.) and handles
conversion between user-defined coordinates and Cartesian coordinates.

Flow:
1. User defines vector field in alternate coordinates (e.g., dr/dt, dθ/dt)
2. System converts position from Cartesian to native coordinates
3. Evaluates velocity in native coordinates
4. Converts velocity back to Cartesian using Jacobian
5. Integration happens in Cartesian space (all existing integrators work)

#### `systems()`

Base class for coordinate systems

#### `systems()`

Get variable names for this coordinate system

**Returns:** *Array<string>* - Variable names (e.g., ['r', 'theta'])

#### `coordinates(cartesianVars, parseFunc)`

Generate GLSL code for velocity transform using multiple charts
Each chart has different coordinate singularities, allowing robust computation

**Parameters:**

- `cartesianVars` *Array<string>* - - Cartesian variable names
- `parseFunc` *Function* - - Parser function

**Returns:** *string* - GLSL function code with chart selection

#### `space(cartesianVars, nativeVars, parseFunc)`

Generate GLSL code for Newton's method iterative solver
Solves: F(cartesian) = native_target
Using: cartesian_new = cartesian_old - inverse(J) * (F(cartesian_old) - native_target)

**Parameters:**

- `cartesianVars` *Array<string>* - - Cartesian variable names
- `nativeVars` *Array<string>* - - Native variable names
- `parseFunc` *Function* - - Parser function

**Returns:** *string* - GLSL function code

#### `space()`

Serialize to JSON for storage

#### `space()`

Deserialize from JSON

#### `space()`

Preset coordinate systems


### gradients.js

#### `code()`

Convert hex color string to RGB array [0,1]

#### `code()`

Convert RGB array [0,1] to hex color string


### integrators.js

#### `code()`

Implicit Midpoint (Implicit RK2)
Solves: x(t+h) = x(t) + h*f((x(t) + x(t+h))/2)
Can use fixed-point iteration, midpoint solver, or Newton's method
2nd order accurate, A-stable (excellent for stiff systems)

#### `code()`

Trapezoidal Rule (Implicit RK2)
Solves: x(t+h) = x(t) + h/2 * (f(x(t)) + f(x(t+h)))
Can use fixed-point iteration, midpoint solver, or Newton's method
2nd order accurate, A-stable

#### `matrix()`

Create custom integrator from user GLSL code


### inverse-solver.js

#### `transforms(forwardTransforms, dimensions, cartesianVars, nativeVars)`

Attempt to solve for inverse transforms symbolically using Nerdamer

Strategy:
1. Set up equations: native_i = forwardTransform_i(cartesian vars)
2. Use Nerdamer's solve() to isolate each Cartesian variable
3. Simplify results


**Parameters:**

- `forwardTransforms` *string[]* - - Forward transform expressions (e.g., ['sqrt(x^2+y^2)', 'atan2(y,x)'])
- `dimensions` *number* - - Number of dimensions
- `cartesianVars` *string[]* - - Cartesian variable names (e.g., ['x', 'y', 'z'])
- `nativeVars` *string[]* - - Native variable names (e.g., ['r', 'theta', 'phi'])

**Returns:** *string[]|null* - Inverse transform expressions or null if failed

#### `transforms()`

Check if forward transforms match standard 2D polar pattern


### jacobian.js

#### `pow(jacobian)`

Test if a Jacobian matrix is valid (no undefined/null entries)


**Parameters:**

- `jacobian` *string[][]|null* - - Jacobian matrix to test

**Returns:** *boolean* - True if valid

#### `pow(jacobian)`

Format Jacobian matrix for display


**Parameters:**

- `jacobian` *string[][]* - - Jacobian matrix

**Returns:** *string* - Formatted string representation

#### `pow(jacobian)`

Invert a symbolic Jacobian matrix using Nerdamer
Supports 2x2, 3x3, and 4x4 matrices


**Parameters:**

- `jacobian` *string[][]* - - Jacobian matrix to invert

**Returns:** *string[][]|null* - Inverted matrix or null if failed


### mappers.js

#### `display()`

Get default mapper based on dimensions and type

#### `index(horizontalExpr, verticalExpr, depthExpr, dimensions)`

Create custom mapper from user math expressions

**Parameters:**

- `horizontalExpr` *string* - - Math expression for horizontal coordinate
- `verticalExpr` *string* - - Math expression for vertical coordinate
- `depthExpr` *string* - - Optional math expression for depth coordinate
- `dimensions` *number* - - Number of dimensions

#### `index()`

Get list of available mapper names


### tonemapping.js

#### `getToneMapper()`

Get list of all available operators

**Returns:** *Array* - of {key, name, description} objects

#### `Linear(rgb)`

Calculate luminance from RGB color
Used for exposure adjustment

**Parameters:**

- `rgb` *Array* - - [r, g, b] in [0, 1]

**Returns:** *number* - value


### transforms.js

#### `T()`

Domain transformations for phase space integration

Applies a 1-to-1 transformation T(x) before integration, then transforms back with T^(-1)(y).
This creates a spatially-varying effective timestep without breaking convergence.

For dx/dt = f(x), we transform to y-space:
  y = T(x)
  dy/dt = J_T(x) * f(x)

We integrate in y-space and transform back:
  y(t+h) = integrate(y(t), h, J_T * f ∘ T^(-1))
  x(t+h) = T^(-1)(y(t+h))

#### `T()`

Base class for coordinate transformations

#### `T(dimensions)`

Generate GLSL helper functions (optional)

**Parameters:**

- `dimensions` *number* - - Number of dimensions

**Returns:** *string* - helper function code

#### `T(dimensions)`

Generate GLSL code for forward transform: y = T(x)

**Parameters:**

- `dimensions` *number* - - Number of dimensions

**Returns:** *string* - function code

#### `T(dimensions)`

Generate GLSL code for inverse transform: x = T^(-1)(y)

**Parameters:**

- `dimensions` *number* - - Number of dimensions

**Returns:** *string* - function code

#### `T(dimensions)`

Generate GLSL code for Jacobian: J_T(x)

**Parameters:**

- `dimensions` *number* - - Number of dimensions

**Returns:** *string* - function code

#### `f()`

Get parameter schema for UI controls

**Returns:** *Array<{name: string, label: string, type: string, min: number, max: number, step: number, default: number}>*

#### `f()`

Identity transform (no transformation)

#### `f()`

Power transform (component-wise)
T(x) = sign(x) * |x|^alpha

alpha < 1.0: More detail near origin, compress outer regions
alpha > 1.0: Less detail near origin, stretch outer regions

#### `f()`

Hyperbolic tangent transform (component-wise)
T(x) = tanh(beta * x)

Compresses infinite space into [-1, 1]
Higher beta = more compression near origin

#### `T()`

Logistic sigmoid transform (component-wise)
T(x) = 2*sigmoid(k*x) - 1 = 2/(1 + exp(-k*x)) - 1

Compresses to [-1, 1], smoother than tanh in center region
Standard logistic function, centered at zero

#### `y()`

Rational transform (component-wise)
T(x) = x / sqrt(x^2 + a)
Jacobian: a/(x^2+a)^(3/2) - bell-shaped!

Compresses to (-√a, √a), with bell-shaped derivative
Parameter 'a' controls bell width: higher = wider/shallower, lower = narrower/sharper

#### `x()`

Sine wave distortion (component-wise)
T(x) = x + amplitude * sin(frequency * x)

Creates periodic "speed bumps" in integration

#### class `for`

Logarithmic transform (component-wise)
T(x) = sign(x) * log(|x| + 1)

Stretches near zero (large derivative), compresses at infinity
Maps infinite space to infinite space with logarithmic spacing

#### class `Transform`

Exponential transform (component-wise)
T(x) = sign(x) * (exp(α*|x|) - 1)

Compresses near zero, stretches at infinity
Creates exponential growth away from origin

#### `functions()`

Transform registry

#### `code()`

Get transform by name

#### `code()`

Get all transform names

#### `code()`

Get transform list for UI


## particles/

### system.js

#### class `ParticleSystem`

Get particle data for a specific dimension

#### class `ParticleSystem`

Get all particle data

#### class `ParticleSystem`

Get particle indices for rendering

#### `constructor()`

Update particle count and reinitialize

#### `constructor()`

Update dimensions and reinitialize

#### `constructor()`

Update bounding box

#### `getDefaultBBox()`

Get current resolution

#### `getDefaultBBox()`

Get actual particle count (may be higher than requested due to square texture)


## ui/

### animatable-slider.js

#### class `AnimatableSliderControl`

Save animation state to settings

#### class `AnimatableSliderControl`

Restore animation state from settings

#### class `AnimatableSliderControl`

Get all animatable controls that are enabled


### animation-controls.js

#### class `AnimationControls`

Pause animation

#### class `AnimationControls`

Stop animation

#### class `AnimationControls`

Export captured frames as ZIP

#### class `AnimationControls`

Update button states

#### class `AnimationControls`

Enable export button

#### class `AnimationControls`

Update progress bar and text


### control-base.js

#### class `Control`

Logarithmic slider control
Slider position is linear [0-100], but value is logarithmic [minValue-maxValue]

#### class `Control`

Convert linear slider position [0, 100] to logarithmic value

#### class `Control`

Convert logarithmic value to linear slider position [0, 100]

#### `getValue()`

Animatable Slider Control
Extends SliderControl with animation bounds that interpolate with alpha

#### `Error()`

Enable/disable animation for this control

#### `Error()`

Set animation bounds

#### `setValue()`

Restore animation state from settings

#### `setValue()`

Control Manager
Manages a collection of controls with automatic save/restore

#### `setValue()`

Register a control

#### `setValue()`

Register multiple controls

#### `setValue()`

Initialize all controls (create DOM elements)

#### `setValue()`

Attach event listeners to all controls

#### `Error()`

Apply settings to all controls

#### `Error()`

Get a control by ID

#### `Error()`

Get current settings from all controls

#### `reset()`

Clear settings from localStorage

#### `reset()`

Debounced apply function

#### `reset()`

Immediate apply (no debounce)


### controls-v2.js

#### `ControlManager()`

Update white point visibility based on operator

#### `ControlManager()`

Update expression controls visibility

#### `ControlManager()`

Update gradient button visibility

#### `ControlManager()`

Update velocity scaling controls visibility

#### `ControlManager()`

Load settings from URL parameter or localStorage


### coordinate-editor.js

#### `systems()`

Coordinate System Editor

Provides a UI for configuring alternate coordinate systems (polar, spherical, etc.)
Users can select presets or define custom coordinate transformations.

#### `systems(containerId, dimensions, initialSystem, onChange)`

Initialize coordinate editor panel

**Parameters:**

- `containerId` *string* - - ID of container element
- `dimensions` *number* - - Current number of dimensions
- `initialSystem` *Object* - - Initial coordinate system
- `onChange` *Function* - - Callback when coordinate system changes (system) => {}


### custom-controls.js

#### `controls()`

Custom control classes for complex UI controls (Version 2)
Refactored to eliminate duplication with transform parameter definitions

#### class `FloatCheckboxControl`

Reset to default value

#### class `FloatCheckboxControl`

GradientControl - integrates with existing gradient editor
Wraps the gradient editor for use with ControlManager

#### class `FloatCheckboxControl`

Set reference to gradient editor instance

#### class `FloatCheckboxControl`

Get current gradient

#### class `FloatCheckboxControl`

Set gradient value

#### class `FloatCheckboxControl`

Attach event listeners

#### class `FloatCheckboxControl`

Called when gradient editor changes

#### class `FloatCheckboxControl`

Reset to default gradient

#### class `FloatCheckboxControl`

Save to settings

#### class `FloatCheckboxControl`

Restore from settings

#### class `FloatCheckboxControl`

TransformParamsControl - manages transform parameter sliders
Creates dynamic controls based on the selected transform type

REFACTORED VERSION: No longer duplicates parameter definitions!
- Reads parameters from transform's getParameters() method (single source of truth)
- Uses ParameterControl instances for rendering and value management
- Eliminates ~200 lines of duplicate code

#### class `FloatCheckboxControl`

Set reference to transform control

#### class `FloatCheckboxControl`

Get current transform type

#### class `FloatCheckboxControl`

Get current parameter values

#### `constructor()`

Set parameter values

#### `constructor()`

Update transform parameter controls based on transform type
Reads parameter definitions directly from the transform instance

#### `super()`

Update accordion section height to fit content

#### `super(sliderId, action)`

Handle button actions for dynamically created transform parameter sliders
Delegates to the appropriate ParameterControl instance


**Parameters:**

- `sliderId` *string* - - The slider ID (e.g., 'transform-param-0')
- `action` *string* - - The button action

**Returns:** *boolean* - if handled

#### `super()`

Attach event listeners

#### `getValue()`

Reset to default value

#### `getValue()`

Save to settings

#### `getValue()`

Restore from settings


### modal.js

#### class `Modal`

Get or create the global modal instance

**Returns:** *Modal*

#### class `Modal`

Initialize the global modal
Should be called after DOM is ready


### parameter-control.js

#### `definition()`

Attach drag handlers to thumbs


### unicode-autocomplete.js

#### `letters()`

Convert ASCII names in a string to Unicode symbols


## ui/mixins/

### animatable-mixin.js

#### `triggerAccordionResize()`

Set animation bounds

#### `triggerAccordionResize()`

Update value based on current alpha (0.0 to 1.0)
Called during animation playback

#### `triggerAccordionResize()`

Update the current value indicator position

#### `triggerAccordionResize()`

Update bounds display (handle positions and labels)

#### `triggerAccordionResize()`

Convert value to percentage position on slider
Override if slider uses non-linear scaling

#### `triggerAccordionResize()`

Convert percentage position to value
Override if slider uses non-linear scaling

#### `triggerAccordionResize()`

Attach drag handlers to the min/max thumbs


### control-mixin.js

#### `class(Base)`

ControlMixin - Core ControlManager interface

Provides save/load/apply integration with ControlManager.
Makes any class compatible with ControlManager's registration system.

Required methods to implement in subclass:
- getValue() - Return current value
- setValue(value) - Set value and update UI


**Parameters:**

- `Base` *Class* - - Base class to extend

**Returns:** *Class* - class with control interface

#### `class()`

Initialize settingsKey from attribute or id
Call this from connectedCallback or initializeProperties

#### `class()`

ABSTRACT: Get current control value
Must be implemented by subclass

#### `class()`

ABSTRACT: Set control value and update UI
Must be implemented by subclass

#### `class()`

Reset control to default value

#### `class(callback)`

Attach change callback from ControlManager

**Parameters:**

- `callback` *Function* - - Callback to trigger on value change (usually manager.debouncedApply)

#### `class()`

Trigger onChange callback and ControlManager callback
Call this whenever the control value changes

#### `class(settings)`

Save control value to settings object
Called by ControlManager.getSettings()

**Parameters:**

- `settings` *Object* - - Settings object to populate

#### `class(settings)`

Restore control value from settings object
Called by ControlManager.applySettings()

**Parameters:**

- `settings` *Object* - - Settings object to read from

#### `class(Base)`

ButtonActionMixin - Add +/- button support

Provides automatic button registration and action handling.
Looks for buttons with action attributes: [increase], [decrease], [reset], etc.

Methods to optionally override in subclass:
- handleButtonAction(action) - Handle button clicks


**Parameters:**

- `Base` *Class* - - Base class to extend

**Returns:** *Class* - class with button action support

#### `class(action)`

Handle button action
Override in subclass to implement specific button behaviors

**Parameters:**

- `action` *string* - - Action name (increase, decrease, reset, etc.)

**Returns:** *boolean* - if action was handled, false otherwise

#### `class(actions)`

Auto-register buttons with action attributes
Call this from attachInternalListeners or connectedCallback

**Parameters:**

- `actions` *Array<string>* - - Array of action names to register


### shadow-dom-mixin.js

#### `renderToShadow()`

Override querySelectorAll to use shadow root if available


## ui/tabs/

### debug-tab.js

#### `super()`

Update buffer status display

#### `elements()`

Called when tab becomes active

#### `elements()`

Called when tab becomes inactive

#### `elements()`

Clean up resources


### tab-base.js

#### class `for`

Base class for modal tabs

Tabs are lazily loaded - their content is only rendered when activated.
Subclasses should override render() and optionally onActivate()/onDeactivate().

#### `render(id, title)`

**Parameters:**

- `id` *string* - - Unique identifier for this tab
- `title` *string* - - Display title for the tab button

#### `render()`

Get whether this tab has been rendered yet

**Returns:** *boolean*

#### `render()`

Get whether this tab is currently active

**Returns:** *boolean*

#### `render(container)`

Render the tab content. Called once when tab is first activated.
Subclasses MUST override this method.

**Parameters:**

- `container` *HTMLElement* - - Container element to render into

**Returns:** *HTMLElement* - rendered content element

#### `render()`

Called when tab becomes active.
Override to perform actions when tab is shown.

#### `render()`

Called when tab becomes inactive.
Override to perform cleanup when tab is hidden.

#### `render(container)`

Internal method to activate this tab

**Parameters:**

- `container` *HTMLElement* - - Container to render into

#### `render()`

Internal method to deactivate this tab

#### `render()`

Destroy this tab and clean up resources

#### `render()`

Manages tabs within a modal window

#### class `Tab`

Register a new tab

**Parameters:**

- `tab` *Tab* - - Tab instance to register

#### class `Tab`

Unregister a tab

**Parameters:**

- `tabId` *string* - - ID of tab to unregister

#### class `Tab`

Activate a tab by ID

**Parameters:**

- `tabId` *string* - - ID of tab to activate

**Returns:** *boolean* - if tab was activated, false if not found

#### class `Tab`

Get the currently active tab

**Returns:** *Tab|null*

#### class `Tab`

Get all registered tabs

**Returns:** *Tab[]*

#### `constructor()`

Update tab button active state

#### `constructor()`

Destroy all tabs and clean up


## ui/web-components/

### animatable-timestep.js

#### `buttons()`

Animatable Timestep Web Component
Extends AnimatableSlider with custom timestep increment buttons (-- - + ++)

#### `buttons()`

AnimatableTimestep - Animatable slider with timestep-specific increment buttons

Usage:
<animatable-timestep
  id="timestep"
  label="Timestep"
  default="0.01"
  min="0.001"
  max="2.5"
  step="0.001"
  small-increment="0.001"
  large-increment="0.01"
  animation-min="0.001"
  animation-max="0.1"
  display-format="3">
  <!-- Include buttons with decrease-large, decrease, increase, increase-large attributes -->
</animatable-timestep>

Features:
- All AnimatableSlider features
- Custom small increment for - and + buttons (e.g., 0.001)
- Custom large increment for -- and ++ buttons (e.g., 0.01)
- Configurable via attributes


### animation-speed.js

#### `speed()`

Animation Speed Web Component

Linear slider for controlling animation speed (steps per alpha increment).
NOT saved to settings (ephemeral).

Usage:
<animation-speed
  id="animation-speed"
  default="10"
  min="1"
  max="200">
</animation-speed>

#### `speed(controller)`

Set the animation controller

**Parameters:**

- `controller` *AnimationController* - - The animation controller instance

#### `speed()`

Override attachInternalListeners to add controller updates

#### `settings()`

Override saveToSettings to prevent saving (ephemeral control)

#### `settings()`

Override restoreFromSettings to prevent restoring (ephemeral control)


### base.js

#### class `for`

Base class for all Web Component controls
Provides reactive binding system with {{variable}} syntax

#### class `for`

Register attribute bindings for all elements with a specific attribute

#### class `for`

Recursively find and register all bind-* attributes in children

#### class `for`

Register a single binding

**Parameters:**

- `element` *Element* - - The element to bind
- `bindAttr` *string* - - The bind attribute name (e.g., "bind-text", "bind-attr-value")
- `varName` *string* - - The variable name to bind to


### log-slider.js

#### `linear()`

Convert logarithmic value to linear slider position [0, 100]
Applies inverse curve to maintain consistency


### number-input.js

#### `ControlManager()`

Override saveToSettings to prevent saving (not managed by ControlManager)

#### `ControlManager()`

Override restoreFromSettings to prevent restoring (not managed by ControlManager)


## utils/

### debug-logger.js

#### class `DebugLogger`

Set the output element for log display

#### class `DebugLogger`

Set whether logging is enabled

#### `constructor()`

Set verbosity level

#### `constructor()`

Enter silent mode (buffer logs instead of displaying)


## webgl/

### bilateral.js

#### `generateBilateralFilterShader(inputTexture)`

Apply bilateral filter

**Parameters:**

- `inputTexture` *WebGLTexture* - - Input LDR texture

**Returns:** *WebGLTexture* - Filtered texture (or original if disabled)

#### `generateBilateralFilterShader()`

Update configuration

#### `generateBilateralFilterShader()`

Check if bilateral filter is enabled

#### `generateBilateralFilterShader()`

Resize resources

#### `generateBilateralFilterShader()`

Clean up WebGL resources


### bloom.js

#### class `BloomManager`

Check framebuffer completeness

#### class `BloomManager`

Get bright extraction framebuffer

#### class `BloomManager`

Get bright extraction texture

#### class `BloomManager`

Get blur framebuffers

#### class `BloomManager`

Get blur textures

#### class `BloomManager`

Get bloom dimensions

#### class `BloomManager`

Update bloom parameters

#### `constructor()`

Resize bloom framebuffers


### buffer-stats.js

#### `constructor()`

Get cached statistics (doesn't recompute)

#### `constructor()`

Dispose resources


### coordinate-strategy.js

#### class `for`

Base class for coordinate storage strategies
Defines the interface that all strategies must implement

#### class `CoordinateStrategy`

Get the WebGL texture format configuration

**Returns:** *{internalFormat: number, format: number, type: number}*

#### class `CoordinateStrategy`

Get the JavaScript array type for storing data

**Returns:** *TypedArrayConstructor* - Uint8Array or Float32Array)

#### class `CoordinateStrategy`

Get the number of components per value

**Returns:** *number* - 4 for RGBA, 1 for single float)

#### class `CoordinateStrategy`

Check if this strategy requires a WebGL extension

**Returns:** *boolean*

#### class `CoordinateStrategy`

Get the required WebGL extension name (if any)

**Returns:** *string|null*

#### class `CoordinateStrategy`

Encode a world coordinate value for storage

**Parameters:**

- `worldValue` *number* - - Value in world coordinates
- `min` *number* - - Minimum world coordinate
- `max` *number* - - Maximum world coordinate

**Returns:** *TypedArray* - value as array (length = getComponentsPerValue())

#### class `CoordinateStrategy`

Decode a stored value back to world coordinates

**Parameters:**

- `buffer` *TypedArray|Array* - - Encoded value
- `min` *number* - - Minimum world coordinate
- `max` *number* - - Maximum world coordinate

**Returns:** *number* - coordinate value

#### class `CoordinateStrategy`

Normalize world coordinate to storage space
For RGBA: normalize to [0, 1]
For Float: might just return as-is

**Parameters:**

- `worldValue` *number* - - Value in world coordinates
- `min` *number* - - Minimum world coordinate
- `max` *number* - - Maximum world coordinate

**Returns:** *number* - value

#### class `CoordinateStrategy`

Denormalize from storage space to world coordinates

**Parameters:**

- `storageValue` *number* - - Value from storage
- `min` *number* - - Minimum world coordinate
- `max` *number* - - Maximum world coordinate

**Returns:** *number* - coordinate value

#### class `CoordinateStrategy`

Get GLSL constant definitions needed by this strategy

**Returns:** *string* - code

#### class `CoordinateStrategy`

Get GLSL decode function
Converts from texture RGBA to float value

**Returns:** *string* - code

#### class `CoordinateStrategy`

Get GLSL encode function
Converts from float value to RGBA for texture storage

**Returns:** *string* - code

#### `constructor()`

Get GLSL normalize function
Converts world coordinates to storage space

**Returns:** *string* - code

#### `constructor()`

Get GLSL denormalize function
Converts from storage space to world coordinates

**Returns:** *string* - code

#### `constructor()`

Get a human-readable name for this strategy

**Returns:** *string*


### framebuffer.js

#### class `FramebufferManager`

Create a texture (HDR or LDR depending on configuration)

#### class `FramebufferManager`

Check framebuffer completeness

#### class `FramebufferManager`

Get human-readable framebuffer status string

#### `constructor()`

Get human-readable texture format name

#### `constructor()`

Bind current framebuffer for rendering

#### `constructor()`

Bind to canvas (unbind framebuffer)


### fxaa.js

#### `FXAA()`

FXAA (Fast Approximate Anti-Aliasing) Manager
Edge-based antialiasing that preserves sharp details

#### `shader()`

FXAAManager class
Manages FXAA rendering pass

#### `shader()`

Initialize FXAA resources

#### `Lottes()`

Create FXAA output framebuffer

#### `generateFXAAShader()`

Compile FXAA shader program

#### `generateFXAAShader(inputTexture)`

Apply FXAA to input texture

**Parameters:**

- `inputTexture` *WebGLTexture* - - HDR texture to apply FXAA to

**Returns:** *WebGLTexture* - FXAA output texture


### renderer.js

#### `constructor()`

Resize canvas

#### `getContext()`

Update configuration

#### `disable()`

Test encode/decode symmetry
Tests JavaScript encode→decode round-trip accuracy

#### `enable()`

Log statistics about the current HDR framebuffer
Reads the framebuffer pixels and computes min/max/avg values

#### `FloatStrategy()`

Log draw shader (contains color computations)

#### `FloatStrategy()`

Log screen shader (contains tone mapping)

#### `FloatStrategy()`

Log diagnostic stats shaders (velocity and brightness)

#### `FloatStrategy(screenX, screenY)`

Read pixel values at screen coordinates
Returns both HDR and LDR values without copying entire framebuffer

**Parameters:**

- `screenX` *number* - - Screen X coordinate (canvas pixels)
- `screenY` *number* - - Screen Y coordinate (canvas pixels)

**Returns:** *Object* - hdr: [r, g, b], ldr: [r, g, b] } or null if out of bounds


### shaders.js

#### `getShaderInfoLog()`

Generate particle rendering vertex shader

#### `createProgram()`

Generate screen fade/composite vertex shader

#### `createProgram()`

Generate screen fade fragment shader

#### `createProgram()`

Generate screen copy fragment shader

#### `attachShader(tonemapCode)`

Generate tone mapping fragment shader

**Parameters:**

- `tonemapCode` *string* - - GLSL code for tone mapping operator (from tonemapping.js)

#### `getProgramInfoLog()`

Generate bloom bright pass fragment shader
Extracts pixels above threshold for bloom layer

#### `getProgramInfoLog(horizontal, radius)`

Generate bloom blur fragment shader
Two-pass separable Gaussian blur with bilinear optimization

**Parameters:**

- `horizontal` *boolean* - - True for horizontal pass, false for vertical
- `radius` *number* - - Blur radius (1.0 = standard, higher = wider blur)

#### `deleteProgram()`

Generate bloom combine fragment shader
Combines base HDR with bloom layer


### smaa.js

#### `SMAA()`

SMAA (Subpixel Morphological Anti-Aliasing) Manager
Better edge preservation than FXAA - uses pattern recognition
Simplified implementation without precomputed area/search textures

#### `generateSMAAEdgeDetectionShader(inputTexture, targetFramebuffer, quadBuffer)`

Apply SMAA to framebuffer (three-pass algorithm)

**Parameters:**

- `inputTexture` *WebGLTexture* - - Input LDR texture
- `targetFramebuffer` *WebGLFramebuffer* - - Target framebuffer to render to
- `quadBuffer` *WebGLBuffer* - - Quad buffer for rendering

#### `luminance()`

Set quad buffer (share with renderer)

#### `luminance()`

Expose framebuffer for tone mapping target (compatibility with FXAA interface)


### textures.js

#### class `TextureManager`

Bind read textures to shader uniforms

**Parameters:**

- `program` *WebGLProgram* - - Shader program

#### `constructor(program)`

Bind previous frame textures to shader uniforms (always available)

**Parameters:**

- `program` *WebGLProgram* - - Shader program

#### `constructor(dimension)`

Get write texture for a specific dimension

**Parameters:**

- `dimension` *number* - - Dimension index


### velocity-stats.js

#### `constructor()`

Compute velocity statistics


## webgl/strategies/

### float-strategy.js

#### `extension()`

Float texture coordinate storage strategy
Stores coordinates directly as floats without encoding
Requires OES_texture_float extension (available on most modern devices)


