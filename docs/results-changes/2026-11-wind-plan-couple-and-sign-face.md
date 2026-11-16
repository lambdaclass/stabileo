# Wind eccentricity uses the active plan and solid-sign face

PR #2220 second review corrects two result changes in the unmerged branch
`bbba79b0f`. Neither is additional main or release exposure. The earlier
main-source witnesses for #2203–#2206 and assigned advisories are recorded
[separately](2026-11-wind-physical-pressure-field.md). The correction is pending
merge and release.

Integrated wall forces lost their cross-section geometry before cases 2 and 4
were assembled. Each endpoint became a singleton level, so the eccentric
moment was applied as a local column torque. Total Mz remained correct, while
member bending, torsion and reactions could change. The shared height field
now carries a required unit-eccentricity plan couple, distributed at each
active cross-section as distributed member loading. A disjoint WindAxis type
separates physical levels from integrated fields. One function applies the
field's force and couple for both buildings and solid signs. There is no
second native Rust wind generator; generation precedes solver selection.

Solid-sign B previously included support levels below the face. In the
regression a 2 m face above clearance 2 m and up to height 6 m stands on a
6 m base. The parent reads B = 6 instead of B = 2, including for the
prescribed eccentricity. Width now comes from the physical carriers clipped
to [clearance, H], including intersections when clearance lies inside a taper.
The coefficient function, prescribed eccentricity rule and all tolerances
remain unchanged. See the checked-in
[Chapter 4 §4.4 source](../codes/CIRSOC/markdown/cirsoc-102-2025/capitulo-4-cargas-de-viento-sobre-accesorios-de-edificios.md).

Signed reproducer commit `7289a015a` adds skipped Vitest tests with the exact
`known wrong result: #2204`, `#2206` and `#2203` tags. Enable each with
`RUN_KNOWN_WRONG=2204`, `2206` or `2203` and targeted `make test.web.unit FILE=...`.
All issue reproducers fail on its parent `bbba79b0f`; the fix removes the skips.
The files are `wind-round2.test.ts` and `wind-enclosure-editor.test.ts`.

The rectangular frame's independent distribution uses analytical exposure C
pressure and first-moment integrals from the checked-in code equations,
plan coordinates and their polar sum. Cases 1–4, both signs and both axes,
service wind, meshes, rotation/reflection, a node on only one carrier, and a
restricted region are checked. Member forces and reactions are compared with
the hand distribution in 2D projection and 3D, linear and nonlinear WASM
analyses. The spatial frame is tested with and without a diaphragm. Sign tests
include wider supports, both axes, clearance intersections, both sides of the
face boundary, negative clearance and empty-face limits. The shared plan
fallback is checked below, at and above its unchanged polar-sum limit.
Correct cases 1 and 3, service wind and the zero-clearance sign retain answers.
No tolerance, engineering baseline or engineering assertion is relaxed.

The new registry entry conservatively selects generated W and Wa loads.
After upgrading, regenerate the loads, then rerun analyses, combinations and
design checks. Re-solving stored generated loads alone does not correct them.
Manual wind and generated gravity remain negative notice controls. Assigned
SA-2026-076–078 concern only the separately documented main witnesses;
#2206 is conservative and has no advisory.
