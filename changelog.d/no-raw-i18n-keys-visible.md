### Added
#### An end-to-end check that no raw translation key is ever shown, in Spanish, English and Portuguese (2026-10-28)

The main screens (Basic empty, its settings and project panels, a solved model and its results,
the switch-to-2D dialog; PRO with design off, its settings, a solved model and the automatic loads
dialog; PRO with design on and the design desk) are opened in each offered language, and the test
fails if any visible text, tooltip, label or the window title is a translation key such as
`tabBar.newStructure`, the key the desktop app showed as its project name (#719). Nothing an
engineer sees changes.
