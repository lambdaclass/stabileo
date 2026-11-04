# Classic plastic collapse — first version, 2 review rounds

Effort/impact: low effort (one existing solver call), high educational impact (the
combined mechanism governs below either elementary mechanism). No new solver.
Route: `/research/benchmarks/plastic-collapse`.

## Reference and scope

The reference is our own hand calculation: the beam, sway and combined mechanism
bounds below are derived independently with the virtual-work mechanism method.
M. R. Horne, *Plastic Theory of Structures*, second edition (1979),
DOI <https://doi.org/10.1016/C2013-0-05820-3>, presents that method and is cited as
background reading only: we have not checked a page, section or equation number in
the book, so the page makes no section-level attribution. Publisher record:
<https://shop.elsevier.com/books/plastic-theory-of-structures/horne/978-0-08-022737-5>.
The catalogue checker verified Crossref's book metadata; its author list is empty.
The publisher identifies Horne. No textbook text, figures or code are copied, and no
figure, table or numbered example is reproduced. The page says so in its
"Against the paper" line instead of showing a pending comparison.

## One shared case

`engine/tests/benchmarks/plastic_collapse.json` supplies both the native engine test
and browser wrapper. Fixed bases, L = 4 m, h = 3 m, Mp = 100 kN m throughout.
Proportional loads: H = 1 kN to the right at the left roof corner, V = 2 kN down at
beam midspan. Four frame elements, five nodes, beam split at the load. Global XZ
plane; all six base DOFs fixed, other nodes free in 3D. E = 200000 MPa, nu = 0.3,
A = 0.1 m², Iy = Iz = 0.0001 m⁴, J = 0.00001 m⁴. Both plastic moment overrides
are 100 kN m; only planar bending is excited. Large axial area suppresses axial
flexibility; there is no axial yield interaction in the ideal hand model. The web
unit test asserts that the solver input (node coordinates, connectivity, fixed DOFs,
load nodes and signs, `mpOverrides`) matches these top-level parameters, and the page
builds its model description from them.

For a virtual rotation θ:

| Mechanism | Internal work | External work | λ |
|---|---|---|---|
| Beam | 4Mpθ | λVLθ/2 | 100 |
| Sway | 4Mpθ | λHhθ | 133.33333333333334 |
| Combined | 6Mpθ | λ(Hh + VL/2)θ | 85.71428571428571 |

Combining sway and beam motion cancels the left roof hinge. The remaining
rotations are θ at each base, 2θ at midspan and 2θ at the right roof corner.
The minimum of the three kinematic upper bounds governs. Differences from the
non-governing bounds must not be interpreted as solver error.

Statics closes the argument (lower-bound side): with Mp at both bases, midspan and the
right roof corner, the sway equation gives the left roof corner moment
M = 3Mp − λHh = 300/7 = 42.857 kN m < Mp, and the beam equation 3Mp + M = λVL/2 holds.
The moment field is therefore admissible and in equilibrium, so λ = 600/7 is exact.

## Checks and tolerances

The native test (`engine/tests/benchmarks/plastic_collapse.rs`) and the page check:

1. Collapse factor equals 600/7 within 1e-6 absolute.
2. Mechanism reported, no solver warnings.
3. Hinges, in order: element 4 end (right roof corner, My < 0), element 4 start
   (midspan, My > 0), element 3 start (right base), element 1 start (left base); each
   event's λ matches the recorded value within 1e-6; |My| = Mp at each hinge; node 2
   (left roof corner) never yields.
4. Yield admissibility: |My| ≤ Mp(1 + 1e-9) at every member end at collapse.
5. Equilibrium: summed reactions balance λ times the loads (ΣFx, ΣFz, ΣMy about the
   origin) within 1e-9 kN / kN m.
6. Left roof corner moment equals 3Mp − λHh and satisfies the beam equation.

The 1e-6 absolute bound in λ is a regression bound, not an accuracy target. The
problem is small (18 free DOFs) and well conditioned; the observed native error against
600/7 is −1.4e-11, five orders of magnitude inside the bound, so the bound detects any
change in hinge sequence or event λ while staying insensitive to floating-point
reordering. The 1e-9 bounds on equilibrium and yield are likewise regression bounds
for round-off (observed residuals are below 1e-12).

The replay chain: the native test asserts the event list stored in the case JSON; the
web unit test asserts that `results/stabileo_results.json` matches the same event list
and passes all six checks; the live WASM test compares every event λ (1e-6) and every
nodal ux/uz (1e-9 m) with the replay. On 2026-10-30 a fresh native run was
bit-identical to the stored replay.

The web calls `initSolver` and `solvePlastic3D` in the production WASM wrapper,
live on load, with the replay as the fallback shown until the live result arrives or
if it fails. It never calls the 2D plastic solver (reported containment issue #758).
Runtime errors/refusals remain visible.

The shared Stabileo scalar-field viewer shows XZ geometry and actual solver nodal
displacements, amplified 10 times; the axis triad is hidden because the drawing plane
is XZ, and a note says X right, Z up. Straight chords between nodes are not a curved
beam interpolation or a drawing of the rigid-plastic mechanism. Playback follows
solver hinge events; the viewer sums the returned displacement increments through
the selected event. A per-event table lists hinge location, λ and My, and a nodal
table gives ux/uz in metres for the selected event.

## Scope

- Not a design check.
- One load ratio and one uniform section; no axial–moment interaction, buckling or
  large displacements.
- 2D plastic collapse while the reported #758 containment applies.
- No hinge symbols or curved member deformation in the viewer.

## Open questions

- Which page and equation of Horne (1979) present the combined portal mechanism? This
  needs a library copy; until then the book is background reading, not a checked
  source.

## Reproduction

Run `make test.engine.targeted TEST=integration FILTER=portal_combined_mechanism`.
The test prints its production result; `results/stabileo_results.json` records that
run for replay. The web unit tests (`case.test.ts`, `live.test.ts`) check the model
parameters, formulas, replay events and checks, the live WASM history, viewer
mapping and locale completeness. The Playwright smoke spec recomputes through WASM
at 360×800, 390×844, 844×390 and 810×1080 in all six public locales.

The stage is `first-version`; catalogue status remains `proposed`.

## Recorded result

Native production λ = 85.71428571427153; combined hand λ = 85.71428571428571;
signed difference = -1.41824330057716e-11. Mechanism: true; warnings: none.
