### BREAKING (results)

#### Register SSI, arc-length and public slab result changes

- Register PR #1675's previously missing 2D/3D SSI support reactions and corrected soil-spring constraint forces, PR #1885's low-order changes to existing 2D arc-length paths, and PR #1627's changed wall-supported public slab demo and reference. Each entry has six-language wording and a restricted applicability condition. See `docs/results-changes/2026-11-ssi-support-reactions.md`, `2026-11-arc-length-reference-norm.md` and `2026-11-gallery-slab-hard-walls.md`.
- Freeze exact SSI, arc-length and public slab gallery outputs in CI and require a matching new result-change entry and results changelog when those outputs move. Existing numerical assertions and tolerances are unchanged.
