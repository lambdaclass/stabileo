# Ferrari & Sigmund (2025): Roorda frame critical load and post-buckling slope

Research, not a design tool. The page at `/research/stability/ferrari-sigmund-2025` compares the
critical load λ₁ and the Koiter coefficients α and β of the simple Roorda frame with the paper,
using only the production engine. λ₁ and α agree within the stated tolerances; **β does not**, and
the page shows that row as a failure. Optimisation is outside this page.

Paper: *Optimization of the Initial Post-Buckling Response of Trusses and Frames by an
Asymptotic Approach*, IJNME 126, e70082, DOI https://doi.org/10.1002/nme.70082.
The published PDF was retrieved from the DTU backend, after the ordinary DTU download
returned HTTP 403. Printed pages 3–5 were visually inspected. The full text is available;
this is not an access blocker. The PDF is CC BY 4.0; no author code has been run or copied.
The download URL and SHA-256 are in `reference-results/MANIFEST.json`.

## Chosen example

The simple Roorda frame in §2.1.2 / Fig. 1a is the smallest frame example with explicit
published values for all three requested quantities. It uses production frame elements,
linear buckling and 2D corotational arc length without engine changes. It avoids the
704-member assembly and all optimisation studies.

Two 1 m members, pinned at their external ends, rigid corner joint. E = 21 MPa,
A = 0.01 m², J = 10⁻⁴/12 m⁴, corner force -1 kN. The default discretisation is ten
production frame elements per member. The imperfect path adds a reference corner moment
+0.001 kN·m in the replay; the page's imperfection control traces −0.001 kN·m live, so both
signs of Fig. 2b can be seen. Neither path is compared with the figure.

## References and numerical results

`tests/validation.rs` computes every number below and writes `VALIDATION.json` (12 checks, all
passing) and `reference-results/published_comparison.json` (the four rows the page shows). The
`koiter` job of `.github/workflows/research.yml` runs it and fails unless all 12 checks pass.

| Quantity (paper, §2.1.2) | Paper | Stabileo | Difference | Tolerance |
|---|---|---|---|---|
| λ₁, numerical, p. 5 | 2.4313 | 2.4313557 (LBA, 10 elements/member) | 5.6·10⁻⁵ absolute | 10⁻⁴ absolute |
| λ₁, closed form, p. 4 | 2.430 | 2.4313036 (LBA, 40 elements/member) | 0.054% | 0.1% |
| α, closed form, p. 4 | 0.3805 | 0.380320 (corotational branch, inextensional, 40 elements/member) | 0.047% | 0.4% |
| β, closed form, p. 4 | 0.1421 | 0.463200 (same branch, corner rotation) | 226% | 1.1% — **fails** |
| α, β numerical, p. 5 | 0.3820, 0.1436 | not compared (see below) | | |

LBA mesh sequence for 4, 10, 20, 40 elements per member: 2.4332361, 2.4313557, 2.4313067,
2.4313036.

### Tolerances

λ₁: 10⁻⁴ absolute against the rounded numerical value and 0.1% against the closed form; the 0.1%
covers the paper's own numerical-versus-closed-form difference (0.0535%). Our refined mesh
differs by 0.0536%; this is not evidence of exact analytical convergence. α and β: the paper's
own numerical-versus-closed-form differences (0.39% and 1.06%) rounded up to the next 0.1%, so
0.4% and 1.1%, by the same rule as λ₁. The paper prints different percentages for α and β; we
use the scalar values, not those percentages.

## α and β from the bifurcated branch

The Koiter coefficients are the Taylor coefficients of the post-buckling branch of the perfect
frame, λ(ξ) = λ₁(1 + αξ + βξ² + …) (Eq. 1). `src/koiter.rs` obtains that branch from the
production corotational solver, without any new element or solver:

1. A rotational spring of 10 kN·m/rad and a corner moment 10θ hold the corner at a rotation θ
   while the corner load λ is applied (`solve_corotational_2d`, 16 increments, tolerance 10⁻¹¹).
   When the spring carries no moment, the state is an equilibrium of the free frame with corner
   rotation θ: a point of the branch. A bracketed Illinois iteration on λ finds it.
2. Six points θ = ±h, ±2h, ±3h (h = 0.02 rad) fix λθ to fifth degree. Reading the coefficients
   from λθ = λ₁(−Δ + θ + αθ² + βθ³ + …) keeps a residual imperfection Δ (Eq. 1) out of α.
3. θ is the production rotation `ry` with its sign reversed, so that θ is positive where the
   load rises, as for the paper's positive α. β does not depend on this choice.

The closed form of the paper (from Bažant and Cedolin) is for inextensible members, so the branch
is traced with the area, and so EA, raised 1000-fold (A = 10 m²; bending stiffness unchanged).

| Elements per member | λ₁ | α | β (corner rotation) | β (modal coordinate) |
|---|---|---|---|---|
| 10 | 2.452876 | 0.377275 | 0.453621 | 0.352659 |
| 20 | 2.435782 | 0.379708 | 0.461245 | 0.356251 |
| 40 | 2.431503 | 0.380320 | 0.463200 | 0.357431 |
| Richardson (20, 40) | 2.430077 | 0.380523 | 0.463852 | 0.357824 |

Further checks in `VALIDATION.json`: the corotational λ₁ at 40 elements is 0.062% from the closed
form (tolerance 0.1%); α moves by 0.054% to its Richardson estimate (tolerance 0.1%, a quarter of
the comparison tolerance), by 7.8·10⁻⁶ when h is halved (tolerance 10⁻⁴) and by 0.016% when the
area is 100-fold instead of 1000-fold (tolerance 0.1%).

**α matches** the closed form 0.3805 to 0.047% at 40 elements per member and to 0.006% after
Richardson extrapolation. This also identifies the closed form's ξ as the corner rotation at
first order.

**β does not match.** In the corner rotation it is 0.4632; in the modal coordinate the paper
describes (ξ the Euclidean projection of d − λ₁û onto the buckling mode scaled to unit corner
rotation, so that the second-order correction w is orthogonal to the mode) it is 0.3574. Neither
is 0.1421 or 0.1436. β depends on which second-order coordinate is used, and the paper does not
pin it down: its stated normalization (Φ⁽³⁾u₀)v₁² = 1 does not fix how ξ relates to a physical
displacement, and the closed form's coordinate is not restated. We leave the row visible as a
failure and do not search for a coordinate that would make it pass. The question is in Open
questions below.

### Why the paper's numerical α and β are not compared

With the paper's own area (0.01 m²) the column shortens under the corner load, the horizontal
member's chord rotates, and the corner turns from the first load step. The exact path of that
model therefore has no bifurcation to expand about; Koiter's linear-prebuckling expansion
(Eqs. 2–5) treats it as one. Extracting α as above from that model is not stable: at 40 elements
per member it is 0.433 with h = 0.02 and 1.018 with h = 0.01 (recorded in `VALIDATION.json`,
`study.paper_area_not_a_bifurcation`). Reproducing 0.3820 and 0.1436 would need the asymptotic
reduction of Eqs. 2–5 with the production energy; `src/energy.rs` already provides its
derivatives through order four, but the reduction is not implemented.

## Energy derivative kernel

`src/energy.rs` implements mixed energy variations through order four with square-free
multidirectional Taylor algebra. For an unreleased Euler–Bernoulli frame element,

Φ = EA/(2L) (l-L)² + 2EJ/L (θᵢ² + θᵢθⱼ + θⱼ²),

where θ are nodal rotations relative to the current chord. This is the energy corresponding
to the production corotational element, not an assertion that it is the authors' advanced
beam element. The implementation refuses hinges, shear areas, and chord rotations outside
its local differentiation domain (dot product with the original chord must be positive).
It is presently for trusted research models, not a general user-input validation API.

Tests compare its gradient and Hessian with the production force and tangent. For one vertical 0.5 m element, all 6 + 36 +
216 + 1296 ordered partial derivatives through fourth order are checked at three states,
using central differences of the preceding derivative at steps 1e-4, 5e-5, 2.5e-5.
The metric is |AD - FD|/(1+|AD|), taking the best of those three step sizes.
Observed maxima by derivative order: 1.32910e-8, 3.07967e-8, 8.21883e-9, 1.37423e-8;
acceptance 2e-5. These checks establish derivative consistency at the tested states,
not correctness of an unimplemented Koiter reduction.

## The rejected first probe

An initial probe evaluated higher variations at u = λ₁ u_linear with the production LBA
eigenvector scaled to unit corner rotation. At ten elements per member ||K_corot(u) v||₂ over the
free DOFs was 5.19533847, not zero, so that pair is not a critical state of the corotational
energy; `tests/buckling.rs` keeps this as a regression so that the shortcut never becomes a
Koiter result by accident.

## Replay and live calculation

`cargo run --locked --release` writes `results/stabileo_results.json` with 26 frames.
Each frame is the full final displacement of a deterministic production arc-length run
with a progressively larger step budget. This avoids changing the engine's history API.
Settings: max_iter 40, tolerance 1e-9, initial/max step 0.04, minimum 1e-7, target iterations 5.
Every run must converge. Final sampled load factor: 2.1796142222595205; corner rotation:
0.4883699212868724 rad. These are regression results, not paper targets.

The paper's Figure 2b traces both signs of the imperfection. The page traces −0.001 and
−0.01 kN·m live, in the browser, with the replay's settings. With −0.001 kN·m the production
path still turns to the falling side (corner rotation +0.42 rad at λ = 2.22 after 100 steps):
the column's shortening turns the corner more than that moment does, the same effect that
keeps the paper's area from having a bifurcation. With −0.01 kN·m it follows the rising branch
(−0.37 rad at λ = 2.97). This is one more reason the paper's extensible-model α, β and its
Figure 2b are not compared.
The test reruns every prefix and compares every saved numeric value within
1e-9 (1 + |value|). Browser live runs use the production WASM wrapper in a terminable worker.
No research WASM is claimed: the derivative kernel and the branch tracing are native-only.
The shared viewer displays translations at scale 1; rotations are used for the path chart.

Run Rust commands inside `nix develop` (or the repository's make shell). The crate is its
own workspace with a lockfile and depends on the engine as a library. No engine behaviour
is modified. Run `cargo test --locked -- --nocapture` from this directory.
The page has unit tests and a Playwright spec; Chromium execution belongs to the maintainer.

## Open questions

Draft only; no messages sent.

1. Could you share the minimal input and exact mesh for §2.1.2, including the advanced
   beam element and treatment of axial shortening / the fundamental equilibrium path?
2. What normalization and mode orientation were used for the tabulated α and β, and
   what is the exact conversion between ξ in Eq. (1) and the plotted corner rotation? Our α
   from the branch in the corner rotation matches 0.3805, but β is 0.463 in the corner
   rotation and 0.357 with ξ the Euclidean projection on the mode, not 0.1421: which
   second-order coordinate do the closed form and your β use?
3. Can you supply the second-order correction and reference path arrays for both signed
   eccentricities, along with the coefficient calculation's critical state?
4. Are the printed relative errors for α and β typographical errors, or do they refer
   to different, unrounded or differently normalized quantities?
5. Is there a minimal implementation that can be shared under an explicit software licence?

## Review round 2 — 2026-10-30

Verified findings consolidated from Kimi, Codex and Claude. The live page now presents
buckling against the two published scalar references and the eccentric path against native
production replay (every saved frame) plus native/WASM final-state parity. It does not
present a Koiter reproduction, author-code comparison or Figure 2b agreement. Questions
are kept above, under Open questions, rather than on the live page.

Source availability checked against the stored publisher PDF and the DTU publication record
https://orbit.dtu.dk/en/publications/optimization-of-the-initial-post-buckling-response-of-trusses-and/ .
The paper’s Data Availability Statement says supporting data are available on request,
not publicly. The catalogue has no author code or supplement data links; this checkout has
scalar transcriptions, not reference path arrays. The public DTU/Wiley endpoints did not
provide additional code/data in this review. Accordingly the page states the actual solver
regression comparison, without a pending badge. No coefficient or curve agreement is inferred
from the available rounded coefficients or from the visually plotted Figure 2b.

Both independent model builders (research and engine test) now check geometry, material,
section, signed eccentric load, connected unreleased elements and pinned outer supports
against the same paper fixture over five mesh sizes. Product code does not import research
code. Rendered reference values are checked against that fixture in en/es/pt; unsupported
de/fr/tr research pages are excluded from prerendering and numeric formatting covers all six.
Derivative evidence uses a 0.1% relative regression tolerance, in addition to the unchanged
2e-5 acceptance bound. Horizontal/rotated derivative coverage is not claimed.
