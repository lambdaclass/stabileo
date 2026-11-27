### Fixed
#### Generated wind preserves interior diagram accuracy on strongly curved pressure bands (2026-11-27)

Wind generation carries declared pressure breaks through changes in tributary width.
A rejected fit splits at a declared kink, and smooth pressures that touch zero can refine
within the original half-band cut-force limit. Single loads and pairs must satisfy the
same four work-moment limits. Declared pressure steps use the pressure on each side
of the jump. A curved pulse between declared breaks can now generate loads even when
the surrounding pressure is zero. Regenerate W and Wa and rerun dependent analyses and checks.
[Results change](../docs/results-changes/2026-11-wind-two-part-moments.md)
