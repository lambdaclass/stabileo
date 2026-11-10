### Fixed
#### Show the modal-basis rounding notice only for modal analyses (2026-11-10)

The modal-basis rounding results-change entry now requires a modal or spectral analysis. A static project's earthquake load case alone no longer triggers the notice. Modal-derived workflows remain covered through their modal analysis; direct time integration alone is unaffected. The v0.4.0 deep-beam-shell legacy regression retains its expected changes and assertions. No engine results change.
