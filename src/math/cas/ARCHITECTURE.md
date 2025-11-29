# CAS Architecture

## Architectural Separation: Cache vs. Notebook Context

This document defines the critical separation between **computational cache** and **notebook context** in the CAS abstraction layer.

### Key Principles

1. **Computational Cache** - Temporary state for current calculation
   - Cleared by `clearCache()`
   - Examples: expression simplification cache, memoized results, temporary variables
   - Should be cleared between independent computations to avoid stale results
   - **MUST NOT** affect notebook definitions

2. **Notebook Context** - Persistent user-defined functions/variables
   - Cleared by `clearNotebook()`
   - Examples: user-defined functions, custom variables, named expressions
   - Should persist across cache clears
   - Only cleared when user explicitly resets the notebook

### Implementation Strategies

#### Engines WITH `persistentNotebookContext` capability (e.g., Maxima)
- Engine can natively separate cache from notebook definitions
- `clearCache()` - Clears only computational cache, notebook remains intact
- `clearNotebook()` - Explicitly clears notebook namespace
- **Performance**: Optimal - no re-evaluation needed

#### Engines WITHOUT `persistentNotebookContext` capability (e.g., Nerdamer)
- Engine's clear operation destroys everything (cache + notebook)
- `clearCache()` - Clears everything, then **re-applies** notebook from `_notebookCells`
- `clearNotebook()` - Clears `_notebookCells` array, then clears engine
- **Performance**: Notebook re-evaluated on every cache clear (acceptable overhead)

### Code Example

```javascript
// User defines function in notebook (Phase 2)
casEngine.loadNotebook([
    {id: '1', type: 'code', input: 'f(x) := sin(x) * exp(-x)'}
]);

// Compute Jacobian (internally calls clearCache())
const jacobian = computeSymbolicJacobian(['f(x)', 'cos(y)'], 2);
// ✅ f(x) still available after cache clear

// User explicitly clears notebook
casEngine.clearNotebook();
// ❌ f(x) no longer available
```

### Benefits of This Architecture

1. **User expectations preserved** - Notebook functions don't mysteriously disappear
2. **Performance optimization** - Engines that support separation get optimal speed
3. **Graceful degradation** - Engines without separation still work (with re-evaluation)
4. **Clear contracts** - No confusion about what gets cleared when
5. **Future-proof** - Easy to add new engines with different capabilities

### Testing Considerations

When testing CAS engines, verify:
- [ ] `clearCache()` preserves notebook context
- [ ] `clearNotebook()` clears notebook context
- [ ] Multiple cache clears don't degrade notebook performance significantly
- [ ] Notebook functions available in differentiate/solve/etc. after cache clear

### Phase 2 Implementation Notes

When implementing notebook evaluation in Phase 2:
- `_applyNotebookContext()` must be idempotent (safe to call multiple times)
- Notebook cells should be evaluated in order (cell[0], then cell[1], etc.)
- Evaluation errors should be stored per-cell, not fail entire context
- `_notebookCells` is the source of truth, never modify it in `clearCache()`
