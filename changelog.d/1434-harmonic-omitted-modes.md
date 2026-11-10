### Fixed

#### Harmonic response resolves omitted modes beyond the dense ceiling (2026-11-10)

**BREAKING (results):** Harmonic analysis now solves frequencies outside the existing modal truncation range with a full sparse solve when the dense system would exceed its ceiling. Previously those models could return inaccurate amplitude and phase with only a truncation warning, or silently when the global residual was small. The same frequency selection and numerical tolerances apply in 2D and 3D; excessive sparse fill or a singular solve returns an error. Re-check harmonic responses above 3000 independent free DOFs near or above omitted modes. See [the results-change write-up](../docs/results-changes/2026-11-harmonic-omitted-modes.md) and #1434.
