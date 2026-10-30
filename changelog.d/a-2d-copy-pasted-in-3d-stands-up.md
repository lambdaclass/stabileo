### Fixed
#### A copy made in 2D no longer lands turned onto the floor when pasted in 3D (2026-10-29)

A 2D model opened in 3D keeps its vertical as Y until the first edit rewrites it with Z up. A copy
taken in 2D, or in 3D before any edit, kept the old axes, and pasting it rewrote the model but not
the copy: it landed rotated 90°, in the X–Y plane, in Basic 3D and in PRO. The copy is now rewritten
the same way as the model. A copy from a 3D model is not pasted into a 2D one, and says why.
