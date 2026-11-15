### Fixed
#### Member recovery certificate checks build against the fallible shape API (2026-11-15)

The 2D and 3D displayed-result certificate tests now require successful load-free shape recovery before checking the same displacement bounds. Remove the stale fallback allow-list entry, retain validated bending stiffness as an option, select end couples explicitly, and register the shared recovery WASM export as postprocessing. Numerical results, limits and assertions are unchanged (#2143, PR #2170).
