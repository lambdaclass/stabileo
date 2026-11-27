### Fixed
#### Editor startup test catches missing production build guard (2026-11-23)

The startup test waits for pending dynamic imports before checking whether test hooks were installed. It now fails if the production build guard is removed.
