# Classic plastic collapse — first version, 0 reviews

Effort/impact: low effort (one existing solver call), high educational impact (the
combined mechanism governs below either elementary mechanism). No new solver.
Route: `/research/benchmarks/plastic-collapse`.

## Reference and scope

M. R. Horne, *Plastic Theory of Structures*, second edition (1979),
DOI <https://doi.org/10.1016/C2013-0-05820-3>, sections 2.2 (portal frames) and
2.4 (combined mechanisms), as listed by the publisher:
<https://shop.elsevier.com/books/plastic-theory-of-structures/horne/978-0-08-022737-5>.
The catalogue checker verified Crossref's book metadata; its author list is empty.
The publisher identifies Horne. No textbook text, figures or code are copied.
No summary is claimed without the full text. This is a faithful application of the
classical mechanism method, with our own dimensions, not a numbered worked-example
reproduction or a claim of experimental validation.

## One shared case

`engine/tests/benchmarks/plastic_collapse.json` supplies both the native engine test
and browser wrapper. Fixed bases, L = 4 m, h = 3 m, Mp = 100 kN m throughout.
Proportional loads: H = 1 kN to the right at the left roof corner, V = 2 kN down at
beam midspan. Four frame elements, five nodes, beam split at the load. Global XZ
plane; all six base DOFs fixed, other nodes free in 3D. E = 200000 MPa, nu = 0.3,
A = 0.1 m², Iy = Iz = 0.0001 m⁴, J = 0.00001 m⁴. Both plastic moment overrides
are 100 kN m; only planar bending is excited. Large axial area suppresses axial
flexibility; there is no axial yield interaction in the ideal hand model.

For a virtual rotation θ:

| Mechanism | Internal work | External work | λ |
|---|---|---|---|
| Beam | 4Mpθ | λVLθ/2 | 100 |
| Sway | 4Mpθ | λHhθ | 133.33333333333334 |
| Combined | 6Mpθ | λ(Hh + VL/2)θ | 85.71428571428571 |

Combining sway and beam motion cancels the left roof hinge. The remaining
rotations are θ at each base, 2θ at midspan and 2θ at the right roof corner.
The minimum of the three kinematic upper bounds governs. Differences from the
non-governing bounds must not be interpreted as solver error. Native acceptance
uses an absolute λ tolerance of 1e-6, fixed before running; no solver tolerance is
changed. A mechanism and no solver warnings are also required.

The web calls `initSolver` and `solvePlastic3D` in the production WASM wrapper.
It never calls the 2D plastic solver (reported containment issue #758). Runtime
errors/refusals remain visible. Stop invalidates pending initialization and stops
replay; the tiny synchronous WASM call cannot be interrupted mid-call.

The shared Stabileo scalar-field viewer shows XZ geometry and actual solver nodal
displacements, amplified 10 times. Straight chords between nodes are not a curved
beam interpolation or a drawing of the rigid-plastic mechanism. Playback follows
solver hinge events; the viewer sums the returned displacement increments through
the selected event. There is no synthesized displacement history.

## Not yet

- Independent reviews: 0.
- A numbered textbook figure or experimental validation.
- Other load ratios, sections, axial interaction, buckling, large displacements.
- 2D plastic collapse while the reported #758 containment applies.
- Plastic hinge symbols and curved member deformation.

## Reproduction

Run `nix develop -c cargo test --manifest-path engine/Cargo.toml --test integration
portal_combined_mechanism -- --nocapture`. The test prints its production result;
`results/stabileo_results.json` records that run for replay. The web unit test
checks the hand formulas, wrapper dispatch, viewer mapping and locale completeness.
The Playwright smoke recomputes through WASM at widths 360, 390 and 810 px.

The stage is `first-version`, with `reviews: []`; catalogue status remains
`proposed` until the broader evidence/review process is complete.

## Recorded result

Native production λ = 85.71428571427153; combined hand λ = 85.71428571428571;
signed difference = -1.41824330057716e-11. Mechanism: true; warnings: none.
