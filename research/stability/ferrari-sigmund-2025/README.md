# Ferrari & Sigmund (2025): Roorda frame, implementation in progress

Research, not a design tool. **The requested Koiter reproduction is not complete.**
The page at `/research/stability/ferrari-sigmund-2025` exposes only production buckling
and an imperfect production arc-length path. It does not display computed α, β or a
Koiter prediction. Optimisation is outside the first version.

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
704-member assembly and all optimisation studies. Feasibility: high engineering relevance,
but the Koiter calculation remains substantial work; the audit's warning about higher-order
kinematics is borne out by the rejected probe below.

Two 1 m members, pinned at their external ends, rigid corner joint. E = 21 MPa,
A = 0.01 m², J = 10⁻⁴/12 m⁴, corner force -1 kN. The default discretisation is ten
production frame elements per member. The imperfect path adds a reference corner moment
+0.001 kN·m. This is one signed eccentric-load case, not both branches of Fig. 2b.

## References and numerical results

| Quantity | Published reference | Our result / status |
|---|---|---|
| λ₁, closed form, §2.1.2 p. 4 | 2.430 | 2.431303624887866 (40 elements/member); relative error 0.00053647 |
| λ₁, numerical, §2.1.2 p. 5 | 2.4313 | 2.4313556768342934 (10/member); absolute error 0.0000556768 |
| α, closed form / numerical, pp. 4–5 | 0.3805 / 0.3820 | Not reproduced |
| β, closed form / numerical, pp. 4–5 | 0.1421 / 0.1436 | Not reproduced |
| Arc-length path, Fig. 2b p. 4 | Published curve | Production path recorded; no published/path-shape agreement asserted |

Mesh sequence for 4, 10, 20, 40 elements per member:
2.433236116311307, 2.4313556768342934, 2.431306710146081, 2.431303624887866.
The last refinement changes λ₁ by 3.08526e-6. Acceptance tolerances were set at 1e-4
absolute against the rounded numerical value and 0.1% against the reported closed form.
The closed form is a transcribed paper value, not a separately derived analytical solution.

The paper's rounded values imply relative differences of approximately 0.0535%, 0.3942%
and 1.0556% for λ₁, α and β, respectively. Its accompanying percentages for α and β are
different. We use the scalar values, not those printed percentages.

`VALIDATION.json` contains checks only for the implemented subset. `PUBLISHED_COMPARISON.json`
contains only the two λ₁ comparisons. Neither supports a full Koiter validation badge;
`reproduced_published_results` deliberately remains false and status is
`implementation-in-progress`.

## Energy derivative kernel

`src/energy.rs` implements mixed energy variations through order four with square-free
multidirectional Taylor algebra. For an unreleased Euler–Bernoulli frame element,

Φ = EA/(2L) (l-L)² + 2EJ/L (θᵢ² + θᵢθⱼ + θⱼ²),

where θ are nodal rotations relative to the current chord. This is the energy corresponding
to the production corotational element, not an assertion that it is the authors' advanced
beam element. The implementation refuses hinges, shear areas, and chord rotations outside
its local differentiation domain (dot product with the original chord must be positive).
It is presently for trusted research models, not a general user-input validation API.

Tests compare its gradient and Hessian with the production force and tangent. All 6 + 36 +
216 + 1296 ordered partial derivatives through fourth order are checked at three states,
using central differences of the preceding derivative at steps 1e-4, 5e-5, 2.5e-5.
The metric is |AD - FD|/(1+|AD|), taking the best of those three step sizes.
Observed maxima by derivative order: 1.32910e-8, 3.07967e-8, 8.21883e-9, 1.37423e-8;
acceptance 2e-5. These checks establish derivative consistency at the tested states,
not correctness of an unimplemented Koiter reduction.

## Unresolved numerical work

An initial probe evaluated higher variations at u = λ₁ u_linear and used the production
LBA eigenvector, scaled to unit corner rotation. At ten elements per member,
||K_corot(u) v||₂ over free DOFs was 5.19533847, not zero. Inserting this noncritical pair
into a bordered coefficient calculation produced provisional values unlike the paper.
That calculation was rejected and is not exposed as a Koiter implementation or result.
The probe by itself does not establish whether the discrepancy arises from the reference
state, the reduction, normalization, or beam modelling; it does not show that the paper
cannot be reproduced. A verified critical state and a consistent reduction are still needed.

Not implemented: a and b, the second-order correction, critical-point/branch switching,
closed-form coefficient evaluation, derivative checks of a completed reduction, or a
quantified near-bifurcation comparison. These are required before this can be called the
requested first-version reproduction. No optimisation, multiple-mode treatment, larger
paper assemblies, or physical/experimental validation is claimed.

## Replay and live calculation

`cargo run --locked --release` writes `results/stabileo_results.json` with 26 frames.
Each frame is the full final displacement of a deterministic production arc-length run
with a progressively larger step budget. This avoids changing the engine's history API.
Settings: max_iter 40, tolerance 1e-9, initial/max step 0.04, minimum 1e-7, target iterations 5.
Every run must converge. Final sampled load factor: 2.1796142222595205; corner rotation:
0.4883699212868724 rad. These are regression results, not paper targets.
The test reruns every prefix and compares every saved numeric value within
1e-9 (1 + |value|). Browser live runs use the production WASM wrapper in a terminable worker.
No research WASM is claimed: the derivative kernel is currently native-only.
The shared viewer displays translations at scale 1; rotations are used for the path chart.

Run Rust commands inside `nix develop` (or the repository's make shell). The crate is its
own workspace with a lockfile and depends on the engine as a library. No engine behaviour
is modified. Run `cargo test --locked -- --nocapture` from this directory.
The page has unit tests and a Playwright spec; Chromium execution belongs to the maintainer.

## Questions for Ferrari and Sigmund

Draft only; no messages sent.

1. Could you share the minimal input and exact mesh for §2.1.2, including the advanced
   beam element and treatment of axial shortening / the fundamental equilibrium path?
2. What normalization and mode orientation were used for the tabulated α and β, and
   what is the exact conversion between ξ in Eq. (1) and the plotted corner rotation?
3. Can you supply the second-order correction and reference path arrays for both signed
   eccentricities, along with the coefficient calculation's critical state?
4. Are the printed relative errors for α and β typographical errors, or do they refer
   to different, unrounded or differently normalized quantities?
5. Is there a minimal implementation that can be shared under an explicit software licence?
