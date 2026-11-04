# Spring networks (Grossman & Boudaoud 2026)

D. Grossman and A. Boudaoud, "Predicting the mechanical properties of spring networks",
*Physical Review Research* 8, 013224 (2026), [doi:10.1103/17sg-gzhl](https://doi.org/10.1103/17sg-gzhl).
Open access under CC BY 4.0; the paper and its Supplemental Material were read in full. **There is
no reference code**: the authors' simulation and computation code is "available at request"
(Data Availability). We therefore compare with the numbers, closed forms and figures the paper
publishes, and with exact results that do not depend on the paper.

Research, not engineering design. Agreement with a paper is not validation against experiments.

Page: `/research/metamaterials/grossman-2026` (web/src/components/research/grossman2026/).

## What is compared

| Paper | What we compare | Result |
|---|---|---|
| Sec. II C 2, Fig. 5, text p. 6: foam-like disorder makes the triangular lattice auxetic | Mean Poisson's ratio of periodic networks (10 samples of 26 x 26 cells per eta) | Crosses zero at eta = 0.446 (paper: ~0.46); nu(0.5) = -0.148 (paper: -0.1); cross-protocol agreement with Fig. 5 clamped-strip error bars for eta <= 0.45, not validation of the strip implementation |
| Eq. (23), Fig. 6: honeycomb Poisson's ratio, triangulated with soft centre springs | Periodic network, l = 0.05 ... 0.95 | Max difference 3.4e-3 with the paper's k_radial = 1e-3, 3.4e-6 with 1e-6 (the error is O(k_radial)) |
| Supplemental Eq. (9), Fig. 4: ordered lattices | Exact (Cauchy-Born) moduli of the periodic lattice | Equal to 6.7e-15 for spring constants k ∝ 1/l^2 (see Questions) |
| Fig. 7: Young's modulus of the (3, 2) lattice against orientation | Same, times the area of one triangle | Max difference 6.0e-4 over the 741 points of the line (vector data) |
| Fig. 9 at eta = 0 | B = sqrt(3)/2, G = sqrt(3)/4 | 2.7e-3 (reading precision of the figure) |

Not reproduced: the simulation dots of Fig. 7 (the paper does not say how its strip measures
Young's modulus; our reading, vertical force through mid-height over width and strain, does not reproduce those dots), and the theory curves of Figs. 8 and 9 for eta > 0 (the paper's mean-field method;
we did not implement it, see Limitations). The comparison series are in
`results/stabileo_results.json`.

## Formulation

Springs e join nodes a and b; stiffness k_e, rest length lbar_e, current length l_e; energy
E = sum_e k_e (l_e - lbar_e)^2 / 2 (paper Eq. 3). All results are linear response about an
equilibrium state: each bond contributes the tangent S = k n n^T + (t / l)(I - n n^T) (t the bond
tension) acting on the change of its bond vector.

- **Periodic moduli.** A periodic cell; a macroscopic strain e = (exx, eyy, exy) enters through the
  bond vectors (r -> r + E r), node fluctuations relax: C = (K_ee - K_eu K_uu^+ K_ue) / A. The
  affine tensor is K_ee / A. Two-dimensional moduli: B = (C11 + C22 + 2 C12)/4,
  G = (C11 + C22 - 2 C12)/8 + C33/8 (C33 for tensor shear), nu = (B - G)/(B + G); directional
  Young's modulus and Poisson's ratio from the compliance.
- **Nonaffinity** sum_i |u_i|^2 / (N lbar^2 |e|^2) for the fluctuation u per unit strain.
- **Strip (the paper's protocol, Sec. V A).** Nodes of the (rotated) lattice in
  0 <= x <= 13, 0 <= y <= 52; nodes within 0.5 of the bottom and top held; the top moved up by
  strain x 52; nu = -(width change between the edge nodes nearest (0, 26) and (13, 26)) / strain.
- **Networks.** Triangular lattice v1 = (1, 0), v2 = (phi/2, psi sqrt 3 / 2), bonds v1, v2,
  v1 - v2 (Eq. 25, Supplemental App. C). Foam: every node moved by eta in a uniformly random
  direction (SplitMix64, seeded), the new distances become the rest lengths (paper Sec. V A).
  Honeycomb: unit edges, opposing corners 2 l apart, a centre node joined to the corners by
  springs k_radial times as stiff. Square lattice with or without diagonals. Random bond dilution.
  Spring laws: equal k (`hookean`) or k ∝ 1/lbar^2 (`equal_weight`).
- **Prestress** (not in the paper's computations): rest lengths x (1 - s), Newton relaxation with
  backtracking to a residual below 1e-11 k, then the linear response about that state.
- **Solver.** The engine's sparse Cholesky (`dedaliano_engine::linalg`) on K + delta I,
  delta starts at 1e-10 max diag K, with up to 128 refinement steps against K.
  If the residual fails acceptance, retry at 1e-12 and 1e-14 max diag K, then return an error if still unconverged.
  The matrix is normalized by max diag K and each nonzero load by its infinity norm.
  Acceptance requires a finite solution and a normalized residual ||r||∞ ≤ 1e-12
  after at least three refinement steps, including for arbitrarily small loads.
  Zero loads return zero displacement. No absolute-roundoff fallback is used.
  Null-mode displacements are non-unique. Finite-strip ν is indeterminate unless
  K − 1e-13 max diag K I admits Cholesky factorization.

Assumptions: small strain (the paper minimised the nonlinear energy at 1 % strain), quasi-static,
two-dimensional, central forces only, unit lattice spacing and k = 1 unless stated.

## Validation

`cargo test --release` runs `tests/validation.rs`: 29 named checks, each with a stated tolerance,
written to `target/VALIDATION.json` and compared with the committed `VALIDATION.json`.
The paper checks also generate `target/PUBLISHED_COMPARISON.json`, including source links;
the same test checks the committed comparison for freshness in CI.
The nonlinear-energy curvature check uses central differences at strains 0.01 and 0.005,
with Richardson extrapolation removing the leading step-size error. This avoids amplifying
prestress-energy cancellation at a 1e-4 step; freshness tolerances remain unchanged.
To refresh the evidence after an intentional change, run `cargo test --release --locked`,
inspect all 29 checks (a stale-record assertion may fail), then copy `target/VALIDATION.json`
to `VALIDATION.json` and rerun. Computed observations allow absolute roundoff of 1e-12 plus
relative roundoff of 1e-8; categories, names, metrics, declared tolerances and pass/fail flags
must match exactly. Non-finite observations are always rejected.

JSON network specs are bounded before construction: 60,000 nodes and 240,000 bonds,
using checked counts. For clipped strips the bound applies conservatively to the candidate
cell grid, including padding and nodes outside the rotated rectangle.

Independent of the paper:
- equilateral triangular lattice: B, G, nu = 1/3, isotropy, zero nonaffinity (1e-10; observed 1e-16);
- seven Bravais lattices, both spring laws: periodic stiffness = Cauchy-Born and the Cauchy
  relation C12 = C66 (1e-9; observed 1.5e-15);
- square lattice: zero shear modulus; in tension t, C33 = 2 t (stress stiffening; 1e-15);
- energy: e^T C e A / 2 equals the second difference of the nonlinearly relaxed spring energy, with
  and without prestress (1e-5; observed 1e-8);
- frame invariance under rotation (1e-9; observed 1e-15);
- rigidity: random dilution to z = 3 gives G < 1e-6 k in all 5 samples (observed 1e-16), z = 5.4
  gives G >= 0.1 k in all 5 samples (Maxwell counting, z = 4);
- the strip solved by the production engine's 2D truss analysis (`solve_2d`, through
  `src/engine_model.rs`) gives the same displacements and bar forces (1e-8; observed 2e-14);
- the strip protocol's finite-size bias: 0.038 for the 13 x 52 strip of the perfect lattice;
  Richardson extrapolation of 26 x 104 and 52 x 208 strips gives 1/3 within 2.7e-3.

Against the paper: the rows of the table above. Tolerances: 1e-9 or tighter for identities;
O(k_radial) for Eq. (23); 0.01 (line width plus calibration) for vector-figure data; the paper's
own error bars (plus 0.003 digitisation) for the cross-protocol Fig. 5 comparison; 0.02 in eta for "nu = 0 at eta ~ 0.46".

The browser bundle is checked in Node by `wasm/check.mjs` (exact lattice values, Eq. 23, input
refusal) in the research-wasm CI job.

## Reference values

`reference-results/` (with `MANIFEST.json`: sources, extraction tools, checksums):
- `paper_values.json`: values and formulas transcribed from the text, with page and equation;
- `paper_figures_vector.json`: Figs. 7, 8, 9 read from the PDF's drawing commands
  (`reference/extract_vector_figures.py`, PyMuPDF), axes calibrated on the drawn ticks;
- `fig5_simulation_digitized.csv`: the raster Fig. 5's simulation markers and error bars
  (`reference/digitize_fig5.py`), precision about 0.002 in nu.

The PDFs themselves are not committed; their SHA-256 sums are in the manifest.

## How to run

```sh
cd research/metamaterials/grossman-2026
cargo test --release -- --nocapture          # the 29 checks
cargo run --release --bin reproduce           # regenerate results/stabileo_results.json
wasm/build.sh                                 # browser bundle -> web/public/research-wasm/grossman-2026
```

## Limitations

- No reference code exists publicly; comparisons rest on the text, closed forms, vector figure
  data and a digitisation of Fig. 5.
- The paper's own semi-analytical method (the nonaffine tensors W of its Eq. 20, mean-field
  approximation, Supplemental App. A and B) is not implemented; we compare with its results.
- Linear response only. At the paper's 1 % strain the nonlinear correction is of order 1 %.
- The strip's free edges bias nu by O(1/width). The paper's Fig. 5 shows 0.331 for the perfect
  lattice where our strip reads 0.371; we could not identify the difference in protocol.
- Ensembles of 10 samples: the mean is known to about +-0.005 (eta <= 0.3) and +-0.01 near 0.5.
- Prestress is an addition of ours, checked by energy and the square-lattice identity only.

## Questions for the authors

Drafted here for a maintainer to send (contact: the corresponding author's address on the paper).

1. Supplemental Eq. (9) and the calculation line of Fig. 7 coincide, to 1e-14 and 6e-4, with the
   affine (Cauchy-Born) result for spring constants k_e ∝ 1/lbar_e^2. With equal spring constants,
   the setting of Eq. (3), we obtain nu = 1/6 at (phi, psi, Theta) = (1, 0.5, 0), where Eq. (9)
   gives 8/27. Is there a normalisation of k_e (or of A^{mu nu alpha beta}) that we have missed?
2. In Fig. 7, how is Young's modulus measured in the strip simulation, and in what units is Y
   given (our match uses the modulus times the area of one triangle)?
3. For the strip of the perfect lattice (eta = 0) Fig. 5 shows nu = 0.331. Our implementation of
   the protocol of Sec. V A gives 0.371, the excess being a free-edge effect that vanishes as
   1/width. Which nodes were held and which nodes measured the width?
4. Would you share the simulation and computation code, or the data behind Figs. 4 to 9, so the
   comparison can be made exactly?

## Periodic ensemble regression and browser follow-up

At eta = 0.5 the periodic ensemble has recorded mean -0.14760823298376496 and
sample standard deviation 0.017861567077351207 (10 seeds). The two-sided
regression tolerance is 0.017, rounded from three standard errors
(3 × 0.017861567 / sqrt(10) = 0.016945). This is a conservative regression
bound on our ensemble, not agreement with the paper's -0.1 strip value or a
statistical confidence claim about the paper. It is independent evidence.
The Fig. 5 error-bar and zero-crossing checks compare different boundary
conditions; the strip's free edges and clamped ends introduce finite-size bias.
Our perfect strip gives 0.371 versus the paper's 0.331; that discrepancy remains
unresolved and periodic agreement cannot validate clipping or clamping.

Live solves and the automatic sweep still block the main thread. The deferred
worker, cancellation and precomputed replay work is tracked in
[FOLLOW_UPS.md](FOLLOW_UPS.md); this page does not yet meet the precomputed-replay
and responsive-cancellation requirements of research/CLAUDE.md.
