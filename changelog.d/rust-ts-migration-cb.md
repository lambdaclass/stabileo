### Changed
#### Cb of the CIRSOC 301 check comes from the engine (2026-11-08)

The moment gradient factor Cb (CIRSOC 301 §F.1(3), Ec. F.1-1) and the scope rules that set it to 1
(a cantilever's free end, a singly symmetric section in double curvature, a section with no axis
of symmetry, no diagram) are computed by the Rust engine (`cirsoc301_inputs`), not TypeScript.
Wherever the old read saw the whole segment, the engine's Cb, moments, basis and curvature are
bit-identical to the TypeScript's (37 029 of 38 760 inputs). The one result change, reading the
segment ends, is listed under BREAKING (results). A non-finite moment diagram is refused
by name instead of giving Cb = NaN. The TypeScript is kept only as the test oracle. The ranked
plan for the rest of the TypeScript engineering math is in `docs/verification/TS_ENGINE_LOGIC.md`.
