# API Reference

_Auto-generated from inline JSDoc documentation_

_Generated: 2025-12-04T02:47:50.704Z_

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


### field-equation-generator.js

#### `equations()`

Field Equation Generator

Generates GLSL code for vector field equations (dx/dt, dy/dt, etc.)

NOTE: This generator handles ONLY vector field equations. Other GLSL generation
that currently happens in the renderer needs to be migrated to IGLSLGenerator
implementations:
- Jacobian matrix generation (for Newton's method in implicit integrators)
- Color expression generation (custom color modes)
- Custom mapper expressions (2D projection)
- Any other user-editable GLSL expressions

These should be user-editable in modals similar to FieldEquationsEditor.
See TODO.md for migration tasks.

Usage Pattern (same for UI and automation):

Interactive (UI):
  const glslArray = controls.map(ctrl => ctrl.getGLSL());
  renderer.updateConfig({ expressions: glslArray });

Automated (presets):
  const glslArray = expressions.map((expr, i) =>
      generator.generate(expr, notebook, { dimension: i, totalDims: N })
  );
  renderer.updateConfig({ expressions: glslArray });

#### `equations()`

Generator for vector field equations
Converts math expressions to GLSL velocity field code

#### `generation()`

Get default variable names for N dimensions


### field-equation-workflow.js

#### class `with`

Workflow for field equation generation and application

#### class `with`

Get generation context for field equations


**Parameters:**

- `index` *number* - - Dimension index
- `totalCount` *number* - - Total dimensions

**Returns:** *Object* - with dimension and totalDims

#### class `with`

Apply field equations to renderer


**Parameters:**

- `glslArray` *string[]* - - Generated GLSL expressions
- `renderer` *Renderer* - - Renderer instance
- `expressions` *string[]* - - Original math expressions

#### class `with`

Display errors with dimension labels


### glsl-generator.js

#### `UI()`

Base interface for GLSL generation

Subclasses implement specific generation logic (field equations, color expressions, etc.)

#### `UI(mathExpr, notebook, context)`

Generate GLSL code from math expression


**Parameters:**

- `mathExpr` *string|string[]* - - Math expression(s)
- `notebook` *Notebook* - - Notebook instance with function definitions
- `context` *Object* - - Additional context (dimensions, variables, etc.)

**Returns:** *string* - GLSL code

#### `UI(mathExpr, context)`

Validate math expression before generation


**Parameters:**

- `mathExpr` *string|string[]* - - Math expression(s)
- `context` *Object* - - Additional context

**Returns:** *{valid: boolean, error?: string}* - result

#### `UI()`

Get a user-friendly description of what this generator does


**Returns:** *string*

#### `UI()`

Get placeholder text for the math input


**Returns:** *string* - text

#### `UI()`

Get placeholder text for the GLSL output


**Returns:** *string* - text

#### `UI()`

Example generator for demonstration
Wraps a single expression in a GLSL function


### glsl-workflow.js

#### `expressions()`

Display errors in modal
Can be overridden by subclasses for custom error formatting



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

#### `transforms()`

Notebook instance (injected from main.js)

#### `transforms(nb)`

Set the Notebook to use for inverse solving

**Parameters:**

- `nb` *import('./notebook.js').Notebook*

#### `transforms(forwardTransforms, dimensions, cartesianVars, nativeVars)`

Attempt to solve for inverse transforms symbolically using CAS engine

Strategy:
1. Set up equations: native_i = forwardTransform_i(cartesian vars)
2. Use CAS solve() to isolate each Cartesian variable
3. Simplify results


**Parameters:**

- `forwardTransforms` *string[]* - - Forward transform expressions (e.g., ['sqrt(x^2+y^2)', 'atan2(y,x)'])
- `dimensions` *number* - - Number of dimensions
- `cartesianVars` *string[]* - - Cartesian variable names (e.g., ['x', 'y', 'z'])
- `nativeVars` *string[]* - - Native variable names (e.g., ['r', 'theta', 'phi'])

**Returns:** *string[]|null* - Inverse transform expressions or null if failed


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


### notebook.js

#### `cells()`

Generate unique cell ID

#### `cells()`

Notebook class - manages cells and provides context-aware CAS operations

#### `cells(casEngine)`

**Parameters:**

- `casEngine` *import('./cas/cas-interface.js').CASEngine* - - CAS engine to use

#### `cells(type, input)`

Add a new cell to the notebook

**Parameters:**

- `type` *'code'|'markdown'* - - Cell type
- `input` *string* - - Initial cell content

**Returns:** *string* - Cell ID

#### `cells(id, input)`

Update cell content

**Parameters:**

- `id` *string* - - Cell ID
- `input` *string* - - New cell content

#### `cells(id)`

Delete a cell

**Parameters:**

- `id` *string* - - Cell ID

#### `management(id)`

Move cell up in order

**Parameters:**

- `id` *string* - - Cell ID

#### `management(id)`

Move cell down in order

**Parameters:**

- `id` *string* - - Cell ID

#### `management(id)`

Evaluate a single cell

**Parameters:**

- `id` *string* - - Cell ID

**Returns:** *Promise<{result: string, tex: string, error?: string}>*


### parser.js

#### `AST()`

Native expression implementation using our internal AST

#### `AST()`

AST Node base class (internal - not part of public API)

#### `AST()`

Number literal node

#### `display()`

Variable reference node

#### `display()`

Binary operation node (+, -, *, /, ^, %)

#### `display()`

Unary operation node (currently just unary minus)

#### `display()`

Function call node

#### `calls()`

Tokenize an expression string

#### `transformations()`

Parse tokens into an AST using Shunting Yard algorithm

#### `toGLSL(rpn)`

Convert RPN token stream to AST

**Parameters:**

- `rpn` *Array* - - RPN token array from Shunting Yard

**Returns:** *ASTNode* - Root node of AST

#### `toGLSL(node)`

Clone an AST (deep copy)

**Parameters:**

- `node` *ASTNode* - - AST node to clone

**Returns:** *ASTNode* - node

#### `toTeX(node, substitutions)`

Substitute variables in an AST

**Parameters:**

- `node` *ASTNode* - - AST node
- `substitutions` *Object* - - Map of variable name -> ASTNode

**Returns:** *ASTNode* - AST with substitutions applied

#### `toTeX(node, functionDefs)`

Substitute function calls in AST with their definitions

**Parameters:**

- `node` *ASTNode* - - AST node
- `functionDefs` *Object* - - Map of function name -> {params: string[], bodyAST: ASTNode}

**Returns:** *ASTNode* - AST with function calls replaced by their bodies

#### `toJS(node, indent)`

Pretty-print AST tree for debugging

**Parameters:**

- `node` *ASTNode* - - AST node to print
- `indent` *number* - - Indentation level

**Returns:** *string* - tree

#### `toJS(node, variables)`

Convert AST to JavaScript code

**Parameters:**

- `node` *ASTNode* - - AST node
- `variables` *string[]* - - Available variable names

**Returns:** *string* - code

#### `toGLSL(base, exponent)`

GLSL optimization: expand small integer powers to multiplication
e.g., x^2 -> x*x, x^3 -> x*x*x (avoids pow() call)

**Parameters:**

- `base` *string* - - Base expression (already GLSL code)
- `exponent` *string* - - Exponent expression (already GLSL code)

**Returns:** *string* - GLSL code


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


## math/cas/

### cas-factory.js

#### `engines()`

Available CAS engine types

#### `engines(type)`

Create and initialize a CAS engine


**Parameters:**

- `type` *string* - - Engine type (from CASEngineType)

**Returns:** *Promise<CASEngine>* - Initialized CAS engine

#### `engines()`

Get the currently selected CAS engine type from settings


**Returns:** *string* - Engine type from CASEngineType

#### `engines(type)`

Save CAS engine type preference to localStorage


**Parameters:**

- `type` *string* - - Engine type from CASEngineType


### cas-interface.js

#### `CAS()`

CAS (Computer Algebra System) Engine Interface

Abstract base class defining the interface that all CAS engines must implement.
Supports notebook context management and symbolic computation operations.

#### class `defining`

Abstract base class for CAS engines
All engines (Nerdamer, Maxima, etc.) must implement this interface

#### class `defining`

Initialize the CAS engine (async - may load WASM, scripts, etc.)

**Returns:** *Promise<void>*

#### class `defining`

Check if engine is ready for use

**Returns:** *boolean*

#### class `defining`

Parse an expression string into engine's internal representation

**Parameters:**

- `expr` *string* - - Expression to parse

**Returns:** *any* - Engine-specific representation

#### class `defining`

Evaluate an expression and return result

**Parameters:**

- `expression` *string* - - Expression to evaluate

**Returns:** *{result: string, tex: string, error?: string}* - Result with TeX representation

#### class `defining`

Compute symbolic derivative

**Parameters:**

- `expr` *string* - - Expression to differentiate
- `variable` *string* - - Variable to differentiate with respect to

**Returns:** *string* - Symbolic derivative as string


### nerdamer-engine.js

#### `pow()`

Clean up quirks in Nerdamer's LaTeX output

#### `pow()`

Basic conversion of math expressions to TeX


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


### animation-setup.js

#### `ZIP()`

Create Animation button - captures frames during alpha animation
Toggles between "Create" and "Stop" modes during animation


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


### equation-overlay.js

#### class `EquationOverlay`

Scale equations to fit container width if needed

#### class `EquationOverlay`

Re-render current equations (useful after showing overlay)

#### class `EquationOverlay`

Get current visibility state

**Returns:** *boolean*


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


### preset-manager.js

#### `loadPresets()`

Load custom presets from localStorage

**Returns:** *Object* - of preset names to preset objects


### settings-manager.js

#### `sharing(settings)`

Encode settings to base64 URL string

**Parameters:**

- `settings` *Object* - - Settings object to encode

**Returns:** *string|null* - settings string or null on error

#### `sharing()`

Load settings from URL parameter or localStorage
Priority: URL parameter (?s=base64) > localStorage
If loaded from URL, saves to localStorage and cleans URL


**Returns:** *Object|null* - object or null if none found

#### `sharing(manager, renderer)`

Save settings to localStorage with bbox and coordinate system

**Parameters:**

- `manager` *ControlManager* - - The control manager instance
- `renderer` *Renderer* - - The renderer instance

**Returns:** *Object* - saved settings object

#### `Bbox(settings)`

Share settings via URL (copies to clipboard)
Generates a shareable URL with settings encoded as base64
Preserves the storage parameter if present


**Parameters:**

- `settings` *Object* - - Settings object to share

#### `Bbox(savedSettings, renderer, expressionsControl)`

Restore coordinate system from saved settings
Validates dimension matching and falls back to Cartesian on error


**Parameters:**

- `savedSettings` *Object* - - Settings object containing coordinateSystem
- `renderer` *Renderer* - - The renderer instance
- `expressionsControl` *DimensionInputsControl* - - The dimension inputs control

**Returns:** *boolean* - if coordinate system was restored successfully


### unicode-autocomplete.js

#### `letters()`

Convert ASCII names in a string to Unicode symbols


## ui/components/

### field-equations-editor.js

#### `definitions(dimensions, expressions)`

Update controls for new dimension count

**Parameters:**

- `dimensions` *number* - - Number of dimensions
- `expressions` *string[]* - - Optional expressions to use (if not provided, reads from renderer)


### math-to-glsl-control.js

#### `input(config, config.generator, config.onGenerate, config.context, config.mathPlaceholder, config.glslPlaceholder, config.initialMath, config.initialGLSL, config.readonly)`

**Parameters:**

- `config` *Object* - - Configuration
- `config.generator` *IGLSLGenerator* - - GLSL generator instance (REQUIRED if no custom onGenerate)
- `config.onGenerate` *Function* - - Custom generator: (mathExpr, notebook, context) => glslCode
- `config.context` *Object* - - Additional context passed to generator
- `config.mathPlaceholder` *string* - - Placeholder for math input
- `config.glslPlaceholder` *string* - - Placeholder for GLSL output
- `config.initialMath` *string* - - Initial math expression
- `config.initialGLSL` *string* - - Initial GLSL code
- `config.readonly` *boolean* - - Make both fields readonly

#### `input()`

Create the UI elements

#### `code()`

Generate GLSL from math expression


### notebook-cell.js

#### class `NotebookCell`

Evaluate the cell

#### class `NotebookCell`

Update cell output after evaluation


### notebook-modal.js

#### `area(config, config.title, config.customContent, config.onApply, config.onCancel, config.applyButtonText, config.showNotebook, config.showExport)`

**Parameters:**

- `config` *Object* - - Modal configuration
- `config.title` *string* - - Modal title
- `config.customContent` *HTMLElement|string* - - Custom HTML content or element
- `config.onApply` *Function* - - Apply callback: (notebook, customFields) => {success: bool, error?: string}
- `config.onCancel` *Function* - - Cancel callback (optional)
- `config.applyButtonText` *string* - - Apply button text (default: "Apply")
- `config.showNotebook` *boolean* - - Show notebook section (default: true)
- `config.showExport` *boolean* - - Show export/import in notebook (default: true)

#### `area()`

Create the modal UI


### notebook-repl.js

#### class `NotebookREPL`

Evaluate all cells in sequence

**Returns:** *Promise<void>*

#### class `NotebookREPL`

Export notebook as JSON file

#### class `NotebookREPL`

Import notebook from JSON file

#### class `NotebookREPL`

Refresh the REPL (re-render all cells)

#### class `NotebookREPL`

Clean up empty cells (cells with no input)

#### class `NotebookREPL`

Get the DOM element

**Returns:** *HTMLElement*

#### `use()`

Destroy the REPL and clean up


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


## ui/panel-controllers/

### gradient-panel.js

#### `handlers(manager, gradientControl)`

Initialize gradient panel controller

**Parameters:**

- `manager` *ControlManager* - - The control manager instance
- `gradientControl` *GradientControl* - - The gradient control instance

**Returns:** *{showGradientPanel: Function, hideGradientPanel: Function, gradientEditor: Object|null}*


### mobile-panel-manager.js

#### `panel(renderingPanelManager)`

Initialize mobile panel manager

**Parameters:**

- `renderingPanelManager` *PanelManager* - - The rendering panel manager instance

**Returns:** *Object* - panel manager API

#### `panel(panelName)`

Show a mobile panel

**Parameters:**

- `panelName` *string* - - Name of panel to show ('controls' or 'rendering')

#### `panel(panelName)`

Hide a mobile panel

**Parameters:**

- `panelName` *string* - - Name of panel to hide

#### `panel()`

Hide all mobile panels


## ui/tabs/

### debug-tab.js

#### `elements()`

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

Set whether to show line numbers

#### `constructor()`

Extract caller information from stack trace

**Returns:** *string|null* - caller info like "renderer.js:123"

#### `getItem()`

Unhook browser console methods (restore original behavior)


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


