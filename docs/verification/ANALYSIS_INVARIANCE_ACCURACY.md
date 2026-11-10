# Analysis error models in invariance checks

## Scope and baseline

Baseline main is `8f4c3ee6c`. All eight issues were read with `gh issue view` and replayed through `metamorphic_replay`, with the published JSON and seed, before changing the harness. The original model name and density metadata are preserved when supplied. #1369 and #1370 publish the same model and seed, covered by the #1369 regression test.

| Issue | Seed | Analysis / relation | Baseline | Fixed harness |
|---|---:|---|---|---|
| #1094 | 2026110203181 | PCG / units | Pass | Pass |
| #1211 | 2026110205346 | PCG / symmetry | 2 passes | 2 passes |
| #1369 | 2026110406225 | time history / symmetry | 2 passes | 2 passes |
| #1370 | 2026110406225 | time history / symmetry | 2 passes | 2 passes |
| #1650 | 2026110706031 | harmonic / reciprocity | Fail | Pass |
| #1652 | 2026110702242 | moving loads / reversal | Fail | Pass |
| #1763 | 2026110805292 | buckling / planes | Fail | Pass |
| #1765 | 2026110801842 | PCG / reciprocity | Fail | Pass |

#1763 additionally failed mirror, relabel, rotation and units on the baseline. The full eight-model replay checks those cells too. The four current failures are covered by analysis-derived rounding budgets; no current engine wrong result was established in these eight models. Passing now does not retrospectively certify the historical engine versions in the reports. The first four issues were already resolved on main.

Commit A records four ignored failing tests and four already-passing regressions. Commit B removes the four ignores. Engine code, iteration parameters, relative tolerances, the inconclusive threshold and existing assertions are unchanged. There is no engine results-change registry entry because no engine result changes.

## Comparison contract

`Item.error` is a finite absolute bound in the item's own physical units. It is computed before comparison. PCG plants are also injected before certification, so the tests exercise the accuracy ceiling rather than only changing an already-certified value. Rigid transformations preserve a vector's Euclidean error bound; unit transformations scale it by the item's dimension. Linear combinations propagate absolute coefficient-weighted bounds, including the zero-load baseline. A load-factor inverse law also divides the bound by its load multiplier.

For each physical family, or each individual scalar, the comparator uses

```
allowance = max(existing_relative_allowance, error_actual + error_expected).
```

It implements this through the comparison scale, without changing `rel_for`, the compliance floors, or `INCONCLUSIVE`. Scalars keep their own units and per-entry scales. Betti projections use Cauchy–Schwarz, `error_vector * ||direction||_2`, and add the bounds of the actual force, moment and baseline solves in that identity.

An ordinary response whose existing relative allowance dominates has exactly the same comparison ratio, including its floating-point bits. The regression asserts this for translation, rotation, a scalar and an envelope pair, and checks that larger planted errors still fail. Nonfinite or negative absolute bounds fail comparison. No infinity is used to turn a failed comparison into a pass.

The additional dense estimates are bounded by the existing dense accuracy limit. If an estimate is unavailable, has unsupported recovery DOFs, cannot verify its inverse defect, has a nonzero initial trajectory state, or crosses a required spectral boundary, it contributes **no additional allowance**. The original comparison remains in force. This adds no refusal or inconclusive outcome. The published models have explicit tests requiring finite, nonzero additional budgets where the new estimate is needed.

## Linear and PCG residuals

A PCG residual tolerance is not a fixed-point contraction tolerance. The error of a returned linear solution is determined by

```
r = K x - f
x - x_exact = K^-1 r.
```

The harness assembles the original model's free stiffness, subtracts restrained-displacement forces, rotates into inclined-support frames, and reduces the constraints. Padding is disconnected and is excluded from the certificate. Reported displacements are pulled back through the actual support and constraint transforms.

For `D = sqrt(diag(K))`, an approximate inverse `T` of `S = D^-1 K D^-1` is checked by its infinity-norm defect `theta = ||I - T S||_infinity < 1`, including the matrix product's operation-count rounding bound. The Neumann identity bounds inverse corrections by `theta/(1-theta)`. This verifies the inverse used by the error estimator instead of assuming that an auxiliary solve is exact.

The forward residual is evaluated with error-free product and summation expansions. `mul_add` supplies the product remainder; ordered TwoSum expansions retain addition remainders. The omitted expansion tail is bounded explicitly, with a subnormal allowance. A test checks the enclosure against exact binary rational arithmetic, including an underflowing product.

For a reported functional `l^T x`, the estimator uses an approximate dual `q` and its own residual `d = l - K^T q`:

```
l^T K^-1 r = q^T r + (K^-T d)^T r.
```

The first term is retained with its sign; the verified inverse bounds the remainder. This preserves the cancellation of a force or moment functional instead of replacing every displacement by an unrelated worst component. Component bounds form a Euclidean bound for each reported vector. Before a PCG residual can enlarge an allowance, the harness independently computes a reference displacement from the verified inverse and the applied right-hand side. It bounds that reference's own residual error, then subtracts the bound from its diagonally scaled displacement norm to obtain a lower bound on the reference scale. The returned displacement's certified error norm must fit within that independent scale times the existing `rel_for("linear (PCG)", 1e-10, conditioning)` budget, capped by the existing `INCONCLUSIVE` limit. Neither the reference scale nor the relative ceiling uses the returned displacement. An unavailable, nonfinite or inadequate reference grants no extra allowance. This ceiling is only for granting a residual allowance; the original comparison and its reliability checks still apply.

The ordinary relative budget is retained; the residual budget supplies the missing absolute scale for #1765's small reciprocal rotation.

## Harmonic analysis

`dynamic_accuracy.rs` follows the eigen-residual and inverse-pencil construction of #1887, read from the available local history. It assembles mass in the same inclined-support frames as stiffness and applies the same constraint reduction. For mass-normalized eigenvectors, the residual columns are measured in the inverse-stiffness norm. Their Frobenius bound is divided by the modal Gram matrix's lower singular-value bound. The resulting eigenvalue uncertainty includes the existing dense operation-count rounding term.

For `C = a0 M + a1 K`, the modal energy-coordinate gain is

```
g(lambda) = 1 / |1 - omega^2/lambda + i omega (a0/lambda + a1)|.
```

The resolvent identity gives `gain^2 * perturbation / (1 - gain * perturbation)` for the response error relative to the natural static scale. The perturbation includes stiffness/mass assembly and the Rayleigh coefficient uncertainty from the anchor frequencies. The adapter calls the registered `solve_harmonic_2d/3d` entry point for every response component. A second diagnostic solve supplies the damping coefficients; its entire serialized result must equal the public entry point result before those coefficients can be used. A mismatch refuses the adapter result. The compared response always comes from the public entry point.

Massless directions are handled by the inverse pencil `H = L^-1 M L^-T`, `K = L L^T`. Its eigenvalue intervals bound the maximum resolvent gain, including the zero-mass limit. An interval that overlaps the solver's damping-anchor cutoff cannot justify an additional finite estimate.

The natural translation scale comes from energy duality:

```
|e_i^T K^-1 f| <= sqrt(e_i^T K^-1 e_i) sqrt(f^T K^-1 f).
```

Summing translational compliance diagonals bounds all reported translations; unreported rotational compliance does not inflate this scale. Harmonic reciprocity now consumes the same finite absolute error information as the transformation checks. This covers #1650 without a new relative multiplier.

## Average-acceleration time history

The adapter calls the registered `solve_time_history_2d/3d` entry point for the compared result. A diagnostic solve obtains the existing solver's `DynamicTrace`; its entire serialized result must equal the public entry point result before the trace can supply an allowance. A mismatch refuses the adapter result. This runs the solver twice without changing the returned engine result. The estimate applies to the adapter's average-acceleration Newmark parameters and zero initial displacement and velocity. Its damping uncertainty uses the largest eligible inverse-pencil eigenvalues, with the stiffness assembly perturbation included; these are the low-frequency Rayleigh anchors. This avoids transferring a high-frequency vibration eigenvalue's absolute error to an unrelated damping anchor.

Write `h = dt/2`. At each step the two trapezoidal state defects are

```
du = u_next - u_old - h (v_next + v_old)
dp = M (v_next - v_old)
   + h [K (u_next + u_old) + C (v_next + v_old) - f_next - f_old].
```

In the state energy norm `||u||_K^2 + ||v||_M^2`, the trapezoidal propagator of a system with positive stiffness, positive-semidefinite mass and damping is contractive. The defect impulse is obtained from the actual effective system:

```
W = K + M/h^2 + C/h
W delta_u = dp/h + (M/h^2 + C/h) du
delta_v = (delta_u - du)/h.
```

The verified inverse of `W` bounds this impulse's energy through
`energy <= sqrt(rhs^T W^-1 rhs) + ||du||_M/h`, using `W >= K + M/h^2`. This retains the energy duality instead of taking separate absolute displacement and velocity components before multiplying by mass. Rayleigh uncertainty acts through the two scalar coefficients: the products `M(v_next+v_old)` and `K(v_next+v_old)` retain their internal cancellation. The accumulated state error is bounded by the sum of the impulse energy norms, including explicit arithmetic and damping-coefficient uncertainty. This avoids an inverse of a nearly massless direction and does not assume stability in a mixed displacement/rotation Euclidean norm. Stiffness dual rows map the energy bound to reported translations and rotations. A second, finite-horizon bound integrates the velocity error using mass dual rows and adds the kinematic displacement defects. The smaller of the two bounds is used. This prevents a soft static rotational compliance, which the short record never reaches, from masking a planted dynamic error.

The accuracy ceiling checks the integrator's discrete equations independently of the error allowance. Damping-anchor uncertainty is excluded from this check: it measures uncertainty between assembled systems, not a failure to solve the system actually integrated. With `C = a0 M + a1 K` and `W` as above, the independent recurrence is

```
M a_0 = f_0
W u_next = f_next + M (u_old/h^2 + 2 v_old/h + a_old)
                  + C (u_old/h + v_old)
a_next = (u_next - u_old)/h^2 - 2 v_old/h - a_old
v_next = v_old + h (a_old + a_next).
```

`certify_recurrence` checks the initial equilibrium, both state updates, and every row of the effective equilibrium. It evaluates equilibrium residuals using the error-free product/sum expansion described above. The residual ceiling contains only operation-count roundoff and the expansion's explicit evaluation remainder; neither `rel_for` nor damping-anchor uncertainty enters it.

For an effective-system row, let `A_i` be the absolute sum of the expanded force, stiffness, mass-predictor and Rayleigh-damping terms, retaining separate magnitudes before cancellation. Predictor arithmetic, matrix combinations and matrix-vector sums are bounded by `gamma(12*n + 32) A_i`. For positive-definite `W = L L^T`, Cauchy–Schwarz gives `(|L| |L^T|)_ij <= sqrt(W_ii W_jj)`. Thus factorization and the two substitutions contribute at most `gamma(3*n + 2) sqrt(W_ii) sum_j sqrt(W_jj) abs(u_next,j)`. These bounds use the assembled effective diagonal, without taking a measured residual as an allowable error or requiring a second trajectory to agree. The acceleration and velocity updates use their uncancelled arithmetic magnitudes with `gamma(12)` and `gamma(8)`, respectively. Nonfinite inputs, magnitudes or bounds fail certification.

After this independent rounding check, the existing accumulated energy bound still includes damping-coefficient uncertainty. The correct one-DOF response is certified even when that uncertainty exceeds the comparison tolerance. The zero trajectory and each existing `(1+eps)` amplitude plant fail the recurrence ceiling, including the smallest plant above the existing comparison tolerance. Failure supplies no additional allowance to the original comparison.

Unresolved damping anchors or a nonzero initial state produce no additional allowance. The inverse-pencil damping estimate also covers semidefinite mass; the optional finite-horizon velocity bound is used only when a positive mass can be factored. Other cases retain the existing eigen-aware relative comparison. The #1369/#1370 model completes the new estimate, and a planted time-history error must fail.

## Buckling

Buckling solves `B phi = mu K phi`, with `B = -Kg` and the reported factor `lambda = 1/mu`. It is not the vibration mass pencil. The estimate uses the actual reduced buckling system.

The affine geometric-stiffness terms expose the axial recovery functionals and their unit-force geometric matrices. The estimator bounds each reduced `B` entry's sensitivity to the linear residual with the dual identity above. Its scalar axial recovery residual is evaluated in exact binary rational arithmetic. Geometry-operation and applied-action rounding terms are included independently of the reported eigenvalue.

Form `H = L^-1 B L^-T`. Absolute matrix-product bounds cover its construction. The complete computed eigenbasis is checked by its Gram defect and residual. Geometric-force uncertainty is projected into that basis and Gershgorin discs are merged into connected components, preserving the count and ordering of roots in an unresolved cluster.

Stiffness uncertainty perturbs the metric. If `|delta K|_K <= eta < 1`, the generalized eigenvalues are bounded by the corresponding metric factors `1/(1 +/- eta)`. This is applied to each root interval. Replacing this with `eta * ||H||` would needlessly transfer the scale of a large tensile eigenvalue to an unrelated positive buckling root. The seeded planted-factor test guards against that loss of discrimination.

Finally, each `lambda_k` is associated with a reciprocal root by explicitly sorting the independent pencil's roots in descending order, matching increasing positive load factors without assuming an eigensolver's storage order. After expanding the interval for metric uncertainty, the estimator checks the interval itself for a zero crossing. The returned factor must be finite and its reciprocal must lie inside its matching interval `[lo, hi]`. Otherwise certification fails.

For an accepted factor, the absolute allowance is the diameter of the reciprocal interval, with arithmetic rounding:

```
error_lambda <= abs(1/lo - 1/hi).
```

Both the returned factor and the exact factor lie in that reciprocal interval, so its diameter bounds their difference independently of the returned value. This avoids the previous circular expression in which a wrong returned factor enlarged its own allowance. Regressions reject the unit-pencil factor 3.9, swapped factors in a two-mode pencil, zero-crossing intervals even with a small returned factor, and inconsistent negative factors. A correctly ordered two-mode response passes. Planar embeddings obtain the estimate from their actual 3D pencil as well as the original 2D pencil.

## Moving-load envelopes

The estimator replays the actual train positions and load sets, using the solver's existing position-to-load adapter. At each position it bounds the static residual and the recovery arithmetic. Positive-semidefinite member stiffness gives `|K_element,ij| <= sqrt(K_global,ii K_global,jj)`; diagonal trace bounds cover local force and moment rows. Frame transformation, recovery and diagram operation counts give the explicit gamma terms. Permanent loads are included.

A moment diagram contains `M_start - x V_start` and its applied-load terms. The shear-error contribution at a station is `x` times the shear error, with `x` measured from that member's start. The response adapter stores extrema over the member rather than station coordinates, so its uniform envelope budget uses the maximum local distance, the member length, rather than the full train-route length. Therefore its absolute budget includes **member length times shear error**, in addition to end-moment error. This term was missing from the old static comparison used by #1652.

Envelope selection is nonexpansive:

```
|max_i a_i - max_i b_i| <= max_i |a_i - b_i|.
```

Thus per-position budgets are maximized, not added over the train positions. No empirical step-count multiplier is introduced. This estimate addresses solver/recovery arithmetic on the actual sampled train positions; it does not certify the spatial discretization of a moving-load envelope or conceal differing load-membership/shape results.

## Coverage and separate engine findings

The sweep uses 200 rich seeds per dimension, starting at `2026110200000`, over PCG, forced time history, harmonic, moving loads and buckling, including symmetry. It is a targeted diagnostic, not a full engine suite. The checked-in coverage JSON asserts, for every analysis/relation cell, identical counts of comparisons, inconclusives, refusals, matching refusals, unrepresentable transforms and non-applicable checks. Review round 2 replaces only the two previously inactive 3D dynamic mirror cells with measured outcomes; all other cells remain unchanged.

| Dimension | Numerical comparisons | Inconclusive before | Inconclusive after |
|---|---:|---:|---:|
| 2D | 1338 | 157 | 157 |
| 3D, original sweep before dynamic mirrors | 258 | 66 | 66 |

The 3D harmonic and forced time-history rows now run mirror transforms. Harmonic and time-history displacement vectors reflect as polar vectors; time-history rotations reflect as axial vectors. Their mirror randomness is independent of subsequent transforms, preserving existing retained-failure replays. The targeted mirror-only replay covers the same 200 3D seeds and requires nonzero numerical comparisons and passes for both rows, with zero not-applicable outcomes. Outcomes are:

| 3D mirror row | Pass | Inconclusive | Refused | Unrepresentable |
|---|---:|---:|---:|---:|
| Harmonic | 2 | 1 | 195 | 2 |
| Forced time history | 3 | 2 | 187 | 8 |

No mirror failures were observed in this replay. A separate fast test requires the retained #1369 model to pass both relabel and mirror checks for both analyses, and explicit vector tests check all three reflection axes. A missing transform rule or a row that never compares fails these tests. The full multi-analysis sweep was not rerun for this review.

Rich random models supplied no successful moving-load comparisons. The sweep now additionally checks a two-member 3D deck fixture, both in its original units and in a Froude-scaled copy. Each relabel, reversal and units cell must have nonzero passes and no failures. These supplemental cells do not replace or loosen the original rich-seed coverage snapshot. `ANALYSIS_ACCURACY_MOVING_COVERAGE` optionally writes their verdicts. A separate transformed-response regression requires finite nonzero budgets and rejects a planted moment error.

The sweep explicitly asserts that every cell in the retained-failure table below still has a failure and zero passes, independently of total coverage. A fast targeted test replays just those six seeds with the sweep's original invariant order, which is necessary to preserve the random transformations.

The 3D PCG units cell at seed `2026110200115` remains an unresolved numerical discrepancy. It is retained rather than being widened into a pass. The eight published-model regressions and the sweep do not require an engine refusal to become a numerical pass.

The following retained sweep failures are **not** hidden by this change:

| Seed | Dimension | Remaining failure |
|---|---|---|
| 2026110200030 | 2D | Harmonic relabel and units copies fail to solve |
| 2026110200045 | 3D | Harmonic units copy fails to solve |
| 2026110200115 | 3D | PCG units comparison remains outside its budget |
| 2026110200131 | 3D | Harmonic and time-history relabel, rotation and units return incompatible numbers |
| 2026110200167 | 2D | Harmonic units copy fails to solve |
| 2026110200176 | 2D | Harmonic units copy fails to solve |

JSON inputs, names and densities are in `engine/tests/metamorphic_corpus/nightly/analysis-accuracy/`. The numeric wrong-result case is separately documented in [SA-2026-056](../advisories/SA-2026-056-constrained-shell-dynamic-invariance.md). The five harmonic solve failures in the other four models are convergence/refusal failures, not numbers demonstrated wrong. Their engine root causes remain outside this harness fix.

## Reproduction

For a published model, enter `make shell` and run, substituting its issue number and published seed:

```sh
NIGHTLY_MODEL="$PWD/engine/tests/metamorphic_corpus/nightly/issue-1763.json" \
NIGHTLY_RESULTS="$PWD/.replay-1763.json" METAMORPHIC_SEED=2026110805292 \
cargo test --release -p dedaliano-engine --test metamorphic metamorphic_replay \
  -- --ignored --exact --nocapture
```

For the coverage check:

```sh
ANALYSIS_ACCURACY_SWEEP="$PWD/.analysis-accuracy-sweep.json" \
cargo test --release -p dedaliano-engine --test metamorphic \
  nightly_tolerances::analysis_accuracy_200_seed_sweep -- --ignored --exact --nocapture
```

Planted-error, finite-budget, exact-residual and ordinary-ratio checks are selected by the `analysis_accuracy` filter. Existing planted-error tests in `nightly_tolerances` and `betti` remain in force.

## Review round 1 verification

Commit `c00aae239` adds ignored failing reproducers for 2D and 3D displacements zeroed before PCG certification, a negative reciprocal interval crossing zero, and the signed-denominator defect. All four fail before the fix. The resolved-interval factor-change checks already pass, as do the added retained-failure, 3D moving-load and expanded #1763 locks. The subsequent fix removes these four ignores. No relative tolerance, existing baseline or assertion is relaxed.

Issue #1370 was retrieved again with `gh issue view 1370 -R lambdaclass/stabileo --json body`. Its fenced minimized JSON, with one trailing newline, is byte-for-byte identical to the existing `issue-1370.json`, which also equals `issue-1369.json`. No replacement with different engineering data is justified by the published issue. All six retained seed JSON files now end in a newline.

Engine sources and returned engine results are unchanged, so this review fix needs no results-change registry entry or new user advisory. The separately documented wrong engine results in SA-2026-056 remain failures. Validation is targeted: the analysis-accuracy and negative-buckling tests, the nightly-tolerance module, and `make lint.engine`; the 200-seed sweep is not run as part of this review fix.

## Review round 2 validation

Commit A adds the ignored #1892 regressions before the fixes. The wrong-factor, mode-order, interval-crossing, zero-trajectory, missing zero-load projection and inactive-mirror tests all fail on that commit. The Betti test starts from a passing reciprocal response and requires invalid bounds to fail explicitly as invalid analysis error bounds; the earlier implementation rejected them later through the final tolerance finiteness check. It was already refusing these inputs, so this is a direct validation and diagnostic improvement rather than a demonstrated previously passing Betti result.

Commit B removes those ignores and adds correct-response controls. Targeted release runs cover `analysis_accuracy`, `betti`, `nightly_tolerances`, and the ignored mirror-only coverage replay. All retained wrong-result cells still fail. `make lint.engine` and the blog unit area are also checked. Fixed comparison tolerances and the inconclusive threshold are unchanged. No engine source, engine result or user result-version entry changes in this review.


## Review round 4 validation

After merging `origin/main`, the failing reproducer commit `ca17778be` records two ignored #1892 tests. A correct discrete trajectory was rejected when damping uncertainty entered the load-energy ceiling. The 3D generated mask also still required zero time-history and harmonic mirrors, even though each row already completed all 128 comparisons; `generated_fast` failed with 128 actual versus zero expected. A third, already-passing control requires finite nonzero trajectory certificates and passing mirror, relabel and units cells in both dimensions.

The fix replaces the load-energy ceiling with the independent recurrence check above. It changes both generated mirror masks from inactive to required, preserving the count of 128 and every other coverage cell. The PR 3D documentation table now marks those two mirror cells as passing, matching the actual `metamorphic_pr_3d` output rather than failing its exact table assertion. The merge also retains main's harmonic symmetry floors and modal-residual contribution alongside the public-result diagnostic equality checks.

The scaled and zero trajectory regressions remain active and must reject the wrong response. The existing rich-seed coverage JSON and all comparison tolerances remain unchanged. Engine sources and returned results are unchanged; this harness fix adds no results-change registry entry or advisory and flips no engine wrong-result issue.

Validation: `make test.engine.metamorphic` (with nextest's `--no-fail-fast`) passed all 280 active tests, including `generated_fast`, `metamorphic_pr_3d`, the new correct-response controls and all retained wrong-result checks; 22 pre-existing ignored tests were skipped. `make lint.engine` passed with the existing library warnings. The scaled and zero trajectory tests additionally require rejection with nonzero damping uncertainty, so that uncertainty cannot purchase a certificate for either plant. `make check.changelog` validates the fragment. No full engine suite or heavy seed sweep was run.

## Final review of PR #1892

The recurrence gate certifies the trace. Before attaching its propagated allowance, the harness also checks every reported displacement or rotation sample against the corresponding trace state. The sample tag selects the time index; independent coordinates are expanded through the constraint transform and rotated out of inclined-support coordinates. Each reported component must match that mapped state within operation-count rounding. Invalid sample indices, component counts, mapping dimensions and nonfinite values cannot certify. The negative control changes only the reported response while leaving the correct trace intact; the positive controls include constrained and inclined mappings in both dimensions.

The coverage snapshot now records `pass` and `fail` separately in every cell, alongside the existing counts. For every seed, the observed failing-cell set must equal the retained failure set exactly. The separate dynamic-mirror snapshot applies the same per-seed rule to mirror cells. A pass-to-fail change therefore fails the gate even when the total number of comparisons is unchanged. The final targeted replay preserves all existing per-seed verdict counts and all twelve retained failing cells across the two dimensions; it adds the previously missing accounting fields without changing a count.

Harmonic conditioning is computed independently of the optional accuracy estimate. When the estimate is absent, `harmonic_floor(None, ...)` supplies zero additional allowance and does not refuse the harmonic adapter. A present but uncertifiable estimate still produces an inconclusive comparison. The existing inconclusive regression retains both assertions and now supplies an explicitly uncertifiable present estimate. Separate models beyond the dense accuracy limit retain finite harmonic responses in both dimensions.

These changes affect verification only. Engine outputs and the results-change registry are unchanged. The harmonic planted-error clean-pair check remains deferred after the review cap.
