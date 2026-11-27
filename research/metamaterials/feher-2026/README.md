# Fehér (2026): source and production-API audit

Research, not a design tool. Numerically validated on the production engine (2026-11-23); no page yet; 0 reviews.

## Sources checked

Eszter Fehér, “Controlling the snap-through behavior of an elastica strip by cuts”,
European Journal of Mechanics - A/Solids (2026), DOI:
https://doi.org/10.1016/j.euromechsol.2026.106217.

The DOI landing page was inaccessible to the browser retrieval tool on 2026-10-29.
The full open preprint was readable:
https://arxiv.org/html/2601.20793v2 (25 May 2026).
No figures, reference code or paper text have been copied.

The catalogue checker's Crossref lookup confirms the title, author, year and
venue recorded in `research/papers.yaml`. Catalogue tests, offline catalogue
validation (48 entries), JSON export and research isolation checks pass.
Implementation-dependent engine, web and browser checks have not been run.

## Model and feasibility

Section 2.1 describes an initially flat strip bent between vertical clamps.
Equations (4)–(7) prescribe endpoint tangents +π/2 and −π/2, horizontal
separation B, and equal endpoint heights. The resulting arch therefore stores
bending energy before the midpoint load is applied. Equations (2)–(3) define
the effective width and bending inertia, including linear transitions around
the two central edge cuts. Self-weight is also included in the paper.

The production `ArcLengthInput` in `engine/src/solver/arc_length.rs` exposes
the solver model and continuation controls, but no initial displacement,
initial stress or restart state. `solve_arc_length` starts at zero displacement
and zero load factor, and explicitly refuses prescribed displacements and
thermal loads. The corotational elements measure deformation relative to their
input geometry. Supplying an already curved mesh would therefore model a
stress-free manufactured arch, not this initially flat, bent strip.

Effort/impact: the viewer and variable section inputs are reusable, but faithful
initial-state preparation is unsupported by this API. With engine numerics
changes prohibited, this is a model-fidelity blocker rather than a missing UI.
A stress-free arch with locally reduced stiffness could be a separately labelled
surrogate; it must not claim to reproduce Fehér's elastica or its limit loads.

## Not yet

- Initial bending stress and the paper's vertically clamped equilibrium.
- Native or WASM limit-load computation for that model.
- Uncut elastica reference comparison and regression test.
- Paper-specific cut cases, limit loads and bifurcation classifications.
- Published curves, experiments, self-weight and mesh convergence comparisons.
- Interactive page, gallery promotion, responsive e2e checks and reviews.

Reference versus Stabileo numbers: none for this model. No paper-specific number
has been compared, and no first-version implementation or validation is claimed.

## Update 2026-11-09: the blocker is lifted; first prototype

The production co-rotational solver now takes prescribed end rotations and
displacements and continues from a converged state (`solve_corotational_2d_from`,
PR #1885), which is the initial-state support this audit asked for. The crate in
this directory builds the paper's model on it, in N and mm:

- Geometry (Section 3.4): sheet 360 × 90 mm, 10 mm in each clamp, so L = 340 mm,
  W = 90 mm, t = 0.5 mm; E = 2800 N/mm², ρ = 1.33 g/cm³. The 1 mm central hole is
  ignored, as in the paper.
- Cuts (Eqs. 2–3): two symmetric edge cuts of relative length a and depth b; the
  45° triangles beside them are left out of the bending stiffness and kept in the
  self-weight. 136 members of 2.5 mm, one section per member.
- Supports (Eqs. 4–7): clamps at θ = ±π/2, B apart, both at height 0.
- Preparation (Section 2.2): the clamps turn to vertical while the far end slides,
  the far end is clamped and moved to B, then the self-weight is applied.
- Loading: a midspan point load in 0.05 N steps to 4 N and back to 0, load
  controlled, as in the experiments (which used 0.5 N steps).

`cargo run --release --bin curves` writes `reference-results/curves.json`
(a = 0.5, b = 0.2, 0.5, 0.8, B = 0.5L and 0.75L: the cases of Figures 10 and 11).

The curves and the measured heights of Figures 10 and 11 are digitized in
`reference-results/fig10_11_digitized.json`, with the method inside it. The paper's unstable
branch (red) gives its snap-through and snap-back loads.

| Case (a = 0.5) | Quantity | Paper | Ours | Difference |
|---|---|---|---|---|
| B = 0.5L, b = 0.2 | unloaded height (measured) | No zero-load marker | 125.8 mm | — |
| B = 0.5L, b = 0.2 | snap-through load | 2.98 N | Unresolved | — |
| B = 0.5L, b = 0.5 | unloaded height (measured) | No zero-load marker | 125.7 mm | — |
| B = 0.5L, b = 0.5 | snap-through load | 2.22 N | 2.05 N | −7.7 % |
| B = 0.5L, b = 0.5 | snap-back load | 0.96 N | 0.95 N | −1.4 % |
| B = 0.5L, b = 0.8 | unloaded height (measured) | No zero-load marker | 124.1 mm | — |
| B = 0.75L, b = 0.2 | unloaded height (measured) | No zero-load marker | 86.6 mm | — |
| B = 0.75L, b = 0.2 | snap-through load | 1.64 N | 1.55 N | −5.3 % |
| B = 0.75L, b = 0.5 | unloaded height (measured) | No zero-load marker | 85.7 mm | — |
| B = 0.75L, b = 0.8 | unloaded height (measured) | No zero-load marker | 82.0 mm | — |

The b = 0.8 cases (and b = 0.5 at 0.75L) have no snap in either the paper or our runs. Against
the measured heights at each load step our curves differ by 7 to 23 mm on average. The largest
differences sit on the branch reached after a snap, which our load-controlled run does not
choose reliably (see below).

The upper branches and the limit loads are close; the monotonic cases are
softer than the paper's in their steep part (by roughly 0.3 N at b = 0.8).
Under load control the state reached after a snap is not unique: the same case
landed on the paper's inverted branch (−92 mm at 4 N) in one run and on another
branch (−65 mm) in another. Choosing the branch needs arc-length (which does
not take prescribed rotations yet) or a dynamic jump. B = 0.25L (Figure 12,
symmetry-breaking bifurcations) has not been run.

## Next

- Arc-length from a start state with prescribed rotations, to trace the unstable
  branches drawn in red and choose the post-snap branch.
- The two resolved snap-through loads come out below the paper values: check the self-weight distribution and
  the effective-width rule near the cut corners.
- B = 0.25L with branch switching; then a page.

## Update 2026-11-23: numerical validation and the paper's numbers

`cargo run --release --bin validate` (research CI job `feher-cuts`) checks the crate and writes
`VALIDATION.json` and `reference-results/published_comparison.json` with `--write`; without it,
it fails when a check fails or when either file differs from a fresh run by more than 10⁻⁶.

**Against an exact solution.** `src/exact.rs` solves the inextensible elastica of Section 2.1
with the same variable bending stiffness (Eqs. 2–3) and self-weight by shooting: RK4 over half
the strip, the horizontal force and the clamp moment found by Newton so that the tangent is
horizontal and the strip reaches B/2 at midspan, reached by continuation in cut depth and weight
from the uncut, weightless strip. It shares no code with the engine. The production frame's
unloaded midpoint height agrees with it within 1.6·10⁻⁴ relative in all six cases of Figures 10
and 11, and within 1.6·10⁻⁴ with 1 N at midspan (B = 0.5L, b = 0.5). The tolerance, 10⁻³, is a
budget for 136 straight members with one section each and lumped weight, an O(h²) error with
h = L/136. Each step now converges to a relative residual of 10⁻¹⁰ (it was 10⁻⁷): as in the
shape-control crate, the looser value let the current engine accept states that depend on the
increments.

**Against the paper** (all a = 0.5, digitized from Figures 10 and 11 of the preprint):

| Row | Paper | Stabileo | Difference | Tolerance |
|---|---:|---:|---:|---:|
| Unloaded height, B = 0.5L, b = 0.2 (measured) | No zero-load marker | 125.81 mm | — | 0.7 mm |
| Unloaded height, B = 0.5L, b = 0.5 (measured) | No zero-load marker | 125.74 mm | — | 0.7 mm |
| Unloaded height, B = 0.5L, b = 0.8 (measured) | No zero-load marker | 124.15 mm | — | 0.7 mm |
| Unloaded height, B = 0.75L, b = 0.2 (measured) | No zero-load marker | 86.60 mm | — | 0.7 mm |
| Unloaded height, B = 0.75L, b = 0.5 (measured) | No zero-load marker | 85.70 mm | — | 0.7 mm |
| Unloaded height, B = 0.75L, b = 0.8 (measured) | No zero-load marker | 82.00 mm | — | 0.7 mm |
| Snap-through load, B = 0.5L, b = 0.2 | 2.977 N | Unresolved | — | 0.06 N |
| Snap-through load, B = 0.5L, b = 0.5 | 2.221 N | 2.05 N | 0.171 N ✗ | 0.06 N |
| Snap-back load, B = 0.5L, b = 0.5 | 0.963 N | 0.95 N | 0.013 N | 0.06 N |
| Snap-through load, B = 0.75L, b = 0.2 | 1.637 N | 1.55 N | 0.087 N ✗ | 0.06 N |

Tolerances: heights, the paper's stated ±0.5 mm measurement uncertainty plus about one pixel of
the 400 dpi digitization (0.12–0.2 mm on the height axis); loads, our 0.05 N load step (the
first converged step with a directional jump locates the jump to within one increment) plus about
two pixels on the load axis (0.004–0.005 N each). A failed solve leaves the snap load unresolved.

The six lowest-load experimental markers lie at 0.037–0.038 N. None is within the two-pixel
uncertainty of zero, so a comparison of measured and calculated unloaded height is unavailable.
The largest absolute difference between the two model predictions at zero load is 0.0133 mm
when rounded up. The measured downward jumps for the other two cases lie below the paper's
computed limit loads. The catalog records `numerically-validated` and
`reproduced_published_results: false`.

**No page yet.** The page, its WASM bundle, the replay and eight locales are the next step; the
crate has the interfaces a page needs (`prepare`, `load_cycle`, `loaded_height`).
