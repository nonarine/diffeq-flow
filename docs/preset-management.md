# Preset Management

Save and load complete system configurations.

## Built-in Presets

The Preset dropdown contains pre-configured famous attractors and interesting systems:

- Lorenz Attractor
- Rössler Attractor
- Double Pendulum
- Van der Pol Oscillator
- And many more...

Select a preset to instantly load all parameters (vector field, integrator, colors, rendering settings).

## Saving Custom Presets

1. Configure your system (vector field, colors, rendering, etc.)
2. Enter a name in the "Preset Name" field
3. Click "Save Preset"

Your custom preset is saved to browser localStorage and will appear in the preset dropdown.

## Loading Presets

Simply select any preset from the dropdown menu. All settings will be applied immediately:

- Vector field expressions
- Integration method and timestep
- Color mode and gradients
- Projection mode
- Rendering effects
- Pan/zoom state

## Managing Presets

Custom presets can be deleted by selecting them and clicking "Delete Preset" (when implemented).

Presets are stored in browser localStorage, so they persist across sessions but are local to your browser.

## Tips

- Save variations of interesting systems with different rendering parameters
- Create "base" presets for common setups (2D rotation, 3D attractor, etc.)
- Export settings as JSON for more advanced control and sharing
