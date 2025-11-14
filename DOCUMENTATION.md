# de-render Documentation Guide

> **Last Updated:** 2025-11-13

This guide helps you navigate the project's documentation. All docs are organized by audience and purpose.

---

## Quick Start

**I want to:** | **Read this:**
---|---
Use the application | [README.md](./README.md)
Deploy the application | [DEPLOYMENT.md](./DEPLOYMENT.md)
Understand the codebase | [CLAUDE.md](./CLAUDE.md)
Create animations | [animations/README.md](./animations/README.md)
Create videos from frames | [scripts/README.md](./scripts/README.md)

---

## Documentation Structure

### 📘 User Documentation
For end users and artists creating visualizations.

#### [README.md](./README.md) - Getting Started
- Quick start guide
- Feature overview
- Browser requirements
- Basic usage examples
- Preset attractors (Lorenz, Rössler, etc.)

**Status:** ⚠️ Needs minor updates (references removed "Apply Changes" button)

---

#### [animations/README.md](./animations/README.md) - Animation System Guide
- How to create animations
- Animation script format basics
- Convergence criteria
- Frame capture workflow
- Video assembly
- Tips and troubleshooting

**Audience:** Users wanting to create animated visualizations

---

#### [ANIMATION_FORMAT.md](./ANIMATION_FORMAT.md) - Animation Schema Reference
- Complete JSON animation format specification
- Keyframe system details
- All available options
- Easing functions
- Technical reference for animation scripts

**Audience:** Advanced users, developers creating animation tools

**Note:** More technical than `animations/README.md`, which is user-focused.

---

#### [scripts/README.md](./scripts/README.md) - Video Creation Guide
- `create-video.sh` usage
- ffmpeg options and quality settings
- GIF creation
- Looping videos
- Troubleshooting

**Audience:** Users converting frame sequences to video

---

### 🔧 Developer Documentation
For contributors and maintainers.

#### [CLAUDE.md](./CLAUDE.md) - **PRIMARY TECHNICAL REFERENCE**
- Complete architecture overview
- File structure and responsibilities
- All features explained in detail
- Recent improvements and refactorings
- Known issues and workarounds
- Development workflow

**Audience:** Developers working on the codebase, AI assistants

**Status:** ✅ Current and actively maintained

**This is the single source of truth for the project architecture.**

---

#### [docs/CONTROLS_ARCHITECTURE.md](./docs/CONTROLS_ARCHITECTURE.md) - Control System Reference
- Data-driven control architecture
- ParameterControl system design
- Single source of truth pattern
- Complete API reference
- Design patterns and best practices
- Migration guide for adding new controls

**Audience:** Developers working on UI, adding new parameters

**Status:** ✅ Current (post-2025-11-08 refactoring)

---

#### [docs/IMPLICIT_SOLVER_ARCHITECTURE.md](./docs/IMPLICIT_SOLVER_ARCHITECTURE.md) - Solver Architecture
- Implicit integration system design
- Solver generator pattern
- Separation of solvers vs integrators
- Gauss-Seidel RK4 implementation
- Newton's method details
- Guide for adding new solvers/integrators

**Audience:** Developers working on integration methods

**Status:** ✅ Current and comprehensive

---

### 🚀 Deployment Documentation

#### [DEPLOYMENT.md](./DEPLOYMENT.md) - Deployment Guide
- Local development server setup
- MIME type configuration
- CORS issues and solutions
- Production deployment options
- Port forwarding
- Troubleshooting

**Audience:** Anyone deploying or hosting the application

**Status:** ✅ Current

---

### 📋 Design Documents

#### [INTERMEDIATE_BUFFER_DESIGN.md](./INTERMEDIATE_BUFFER_DESIGN.md) - Future Architecture Proposal
- **STATUS: NOT YET IMPLEMENTED**
- Proposal for two-pass rendering architecture
- Would enable Halley's method and full implicit RK4
- Performance analysis
- Implementation roadmap

**Audience:** Developers considering future enhancements

**Status:** ⚠️ Design document for unimplemented feature

---

### 📦 Archived Documentation

#### [archive/](./archive/) - Historical Documentation
Contains documentation from previous refactorings:

- `archive/docs/CONTROLS_REFACTORING_PLAN.md` - First control refactoring plan (completed 2025-11-03)
- `archive/docs/README_CONTROLS.md` - First ControlManager system docs
- `archive/docs/CONTROL_REFACTORING.md` - Migration guide for first refactoring
- `archive/docs/REFACTORING_SUMMARY.md` - Summary of first refactoring
- `archive/README.md` - Explains what's archived and why

**Audience:** Understanding historical design decisions

**Status:** 📦 Archived, for reference only

**These are superseded by current documentation but kept for historical context.**

---

## Documentation by Topic

### Animation System
1. **User Guide:** [animations/README.md](./animations/README.md) - How to create animations
2. **Technical Spec:** [ANIMATION_FORMAT.md](./ANIMATION_FORMAT.md) - JSON schema
3. **Implementation:** [CLAUDE.md](./CLAUDE.md#animation-system-2025-11-to-present) - Code architecture
4. **Video Export:** [scripts/README.md](./scripts/README.md) - Frame to video conversion

### Control System
1. **Architecture:** [docs/CONTROLS_ARCHITECTURE.md](./docs/CONTROLS_ARCHITECTURE.md) - Current system design
2. **Implementation:** [CLAUDE.md](./CLAUDE.md#user-interface) - File structure and responsibilities
3. **Historical:** [archive/docs/](./archive/docs/) - Previous refactoring docs

### Integration Methods
1. **Architecture:** [docs/IMPLICIT_SOLVER_ARCHITECTURE.md](./docs/IMPLICIT_SOLVER_ARCHITECTURE.md) - Solver design
2. **Implementation:** [CLAUDE.md](./CLAUDE.md#2-pluggable-integrators) - Available methods
3. **Usage:** [README.md](./README.md#integrators) - User guide

### Rendering Pipeline
1. **HDR & Tone Mapping:** [CLAUDE.md](./CLAUDE.md#hdr-pipeline--tone-mapping) - Implementation details
2. **Usage Patterns:** [CLAUDE.md](./CLAUDE.md#typical-usage-patterns) - Best practices for attractors
3. **User Guide:** [README.md](./README.md#rendering) - Basic settings

### Deployment
1. **Setup:** [DEPLOYMENT.md](./DEPLOYMENT.md) - Server configuration
2. **Development:** [CLAUDE.md](./CLAUDE.md#development-workflow) - Workflow notes

---

## Maintenance Notes

### Keeping Documentation Current

When making changes, update these files:

**For Code Changes:**
- ✅ Always update [CLAUDE.md](./CLAUDE.md) - Primary technical reference
- ✅ Update [docs/CONTROLS_ARCHITECTURE.md](./docs/CONTROLS_ARCHITECTURE.md) if changing control system
- ✅ Update [docs/IMPLICIT_SOLVER_ARCHITECTURE.md](./docs/IMPLICIT_SOLVER_ARCHITECTURE.md) if changing solvers

**For User-Facing Changes:**
- ✅ Update [README.md](./README.md) for new features
- ✅ Update [animations/README.md](./animations/README.md) for animation system changes
- ✅ Update [ANIMATION_FORMAT.md](./ANIMATION_FORMAT.md) for JSON schema changes

**For Deployment Changes:**
- ✅ Update [DEPLOYMENT.md](./DEPLOYMENT.md) for server/hosting changes

### Documentation Priorities

1. **CLAUDE.md** - Always keep current (primary reference)
2. **README.md** - Update for user-visible changes
3. **Specialized docs** - Update when relevant systems change
4. **Archive old docs** - Move superseded docs to archive/ with explanation

### Redundancy is Intentional

Some information appears in multiple places by design:

- **CLAUDE.md** - Complete technical reference (for developers)
- **README.md** - Simplified user guide (for end users)
- **animations/README.md** - User-friendly animation guide
- **ANIMATION_FORMAT.md** - Technical animation spec

This serves different audiences and use cases. Keep them in sync but don't consolidate.

---

## Recent Documentation Updates

### 2025-11-13
- ✅ Updated CLAUDE.md with Parameter Control refactoring
- ✅ Updated CLAUDE.md with Animation System improvements
- ✅ Updated CLAUDE.md with Domain Transforms
- ✅ Updated CLAUDE.md with Accordion utilities
- ✅ Updated CLAUDE.md with AnimatableTimestepControl
- ✅ Created this DOCUMENTATION.md guide

### Known Documentation Debt
- ⚠️ README.md still references "Apply Changes" button (should be "auto-apply")
- ⚠️ README.md "Future Extensions" section outdated (many features implemented)
- ⚠️ INTERMEDIATE_BUFFER_DESIGN.md should have "NOT IMPLEMENTED" banner at top

---

## Contributing

When adding features:

1. **Code first, document later** - Get the code working
2. **Update CLAUDE.md** - Add to appropriate section
3. **Update user docs** - If user-visible, update README.md
4. **Update specialized docs** - If changing architecture, update relevant doc
5. **Archive old docs** - If replacing old system, move old docs to archive/

When writing documentation:

- **Be concise** - Users don't read long docs
- **Use examples** - Show, don't tell
- **Link related docs** - Help users navigate
- **Mark status** - ✅ Current, ⚠️ Needs update, 📦 Archived, ❌ Outdated

---

## Questions?

- **"Where do I start?"** → Read [README.md](./README.md)
- **"How does X work?"** → Check [CLAUDE.md](./CLAUDE.md)
- **"How do I deploy this?"** → Read [DEPLOYMENT.md](./DEPLOYMENT.md)
- **"How do I make animations?"** → Read [animations/README.md](./animations/README.md)
- **"What's the animation format?"** → Read [ANIMATION_FORMAT.md](./ANIMATION_FORMAT.md)
- **"How do I add a new control?"** → Read [docs/CONTROLS_ARCHITECTURE.md](./docs/CONTROLS_ARCHITECTURE.md)
- **"How do I add a new solver?"** → Read [docs/IMPLICIT_SOLVER_ARCHITECTURE.md](./docs/IMPLICIT_SOLVER_ARCHITECTURE.md)

---

*This guide was created 2025-11-13 to consolidate documentation navigation.*
