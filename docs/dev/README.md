# Developer Documentation

This directory contains technical architecture documentation for contributors and developers working on the N-Dimensional Vector Field Flow Renderer.

## Architecture Documents

### [Controls Architecture](controls-architecture.md)

Comprehensive documentation of the control system refactoring and implementation.

**Topics covered:**
- ControlManager and base control classes
- Parameter control system with data-driven UI generation
- Scale inference and formatter utilities
- Animatable controls with bounds UI
- Migration from legacy control system
- Best practices and patterns

**Audience:** Developers adding new controls or modifying the UI system.

---

### [Shader Architecture](shader-architecture.md)

Detailed documentation of the WebGL rendering pipeline and shader system.

**Topics covered:**
- Shader program structure and compilation
- Texture ping-pong for N-dimensional position storage
- HDR rendering pipeline with tone mapping
- Post-processing effects (SMAA, bilateral filter)
- Coordinate storage strategies (Float vs RGBA)
- Integration method implementation in GLSL
- Performance optimization techniques

**Audience:** Developers working on rendering, adding new visual effects, or optimizing performance.

---

### [Implicit Solver Architecture](implicit-solver-architecture.md)

Technical documentation of implicit integration methods and iterative solvers.

**Topics covered:**
- Implicit integrator theory and A-stability
- Solver method implementations (Fixed-point, Midpoint, Newton)
- GLSL code generation for iterative solvers
- Symbolic differentiation with Nerdamer
- Finite difference Jacobian approximation
- Convergence characteristics and performance

**Audience:** Developers implementing new integration methods or solver algorithms.

---

## Contributing

When adding new features that involve significant architectural decisions:

1. Document the architecture in the appropriate file above
2. Update this README if adding new architecture documents
3. Include code examples and references to actual implementation
4. Explain design tradeoffs and alternatives considered

## User Documentation

For user-facing documentation, see the parent `docs/` directory. User docs are written in markdown and loaded into the in-app documentation modal.
