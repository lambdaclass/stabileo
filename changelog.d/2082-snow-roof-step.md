### Fixed
#### Snow drift at pitched lower roofs (2026-11-13)

- CIRSOC 104 snow drift at modeled roof steps uses each receiving roof's balanced snow depth and local surface height. Sliding snow reaches pitched receiving roofs. A saved-project notice selects generated snow on lower roofs at modeled steps; other snow codes retain their explicit omission warnings. See [the results change](docs/results-changes/2026-11-snow-roof-step.md).
