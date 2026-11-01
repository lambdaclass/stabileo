### Fixed
#### Ctrl+S no longer sends the 3D view sliding away (2026-10-29)

In Basic 3D and in PRO, W, A, S, D, Q and E move the 3D view while held. Ctrl+S (Cmd+S on a Mac)
pressed the S as well: the save dialog took the key's release, and on a Mac no release reaches
the page while Cmd is down, so the view kept panning until S was pressed again. Cmd+A did the same
with A. A letter pressed with Ctrl, Cmd or Alt no longer moves the view, and held navigation keys
are let go when the window loses focus or Cmd is released. Basic 2D has no key navigation and was
not affected.
