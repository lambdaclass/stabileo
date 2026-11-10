# Harmonic and spectral symmetry findings

## Replay scope

Baseline: `8f4c3ee6c07c661c090865f7390d10b78162786f`, the checkout's
`origin/main` when this investigation started. The local `main` branch was older;
no branch was checked out and no other worktree was changed.

Each issue was read with `gh issue view --json number,title,body,state`.
The published JSON, including `_nightly_name` and `_nightly_dens` where present,
is stored verbatim in meaning in `engine/tests/metamorphic_corpus/nightly/`.
The #1030 and #1278 models were already present. #1203 and #1204 publish the same
model and seed, but have separate regression names.

All twelve published cases already had **zero failures** through the existing
`metamorphic_replay` entry point on the baseline. The full per-model replay,
including its other analyses and relations, was run before and after this change.
The table isolates the reported analysis's symmetry cell. A harmonic pass means
both symmetric and antisymmetric loading passed. Spectral excitation is
independent of the supplied static load, so its antisymmetric-load check does not
apply.

| Issue | Published seed | Dimension | Analysis | Before | After |
|---|---:|---|---|---|---|
| #1203 | 2026110201350 | 2D | harmonic | 2 passes | 2 passes |
| #1204 | 2026110201350 | 2D | harmonic | 2 passes | 2 passes |
| #1209 | 2026110205053 | 3D | harmonic | 2 passes | 2 passes |
| #1215 | 2026110201737 | 3D | harmonic | 2 passes | 2 passes |
| #1218 | 2026110200823 | 3D | harmonic | 2 passes | 2 passes |
| #1278 | 2026110303012 | 2D | harmonic | 2 passes | 2 passes |
| #1281 | 2026110301259 | 3D | harmonic | 2 passes | 2 passes |
| #1464 | 2026110500040 | 2D | harmonic | 2 passes | 2 passes |
| #1030 | 20758 | 2D | spectral | 1 pass | 1 pass |
| #1096 | 20759 | 2D | spectral | 1 pass | 1 pass |
| #1214 | 2026110200168 | 2D | spectral | 1 pass | 1 pass |
| #1220 | 2026110201350 | 2D | spectral | 1 pass | 1 pass |

Additional symmetry-cell refusal counts are unchanged: #1203 and #1204 each
have one harmonic refusal, and #1220 has one spectral refusal, from the existing
support-contract checks. These are not counted as symmetry passes.

To replay a single published case, use `make shell` and run:

```sh
NIGHTLY_MODEL="$PWD/engine/tests/metamorphic_corpus/nightly/issue-1464.json" \
NIGHTLY_RESULTS="$PWD/.replay-1464.json" METAMORPHIC_SEED=2026110500040 \
cargo test --release -p dedaliano-engine --test metamorphic metamorphic_replay \
  -- --ignored --exact --nocapture
```

No new current engine wrong result was reproduced. These issues are resolved on
the baseline; the remaining defect addressed here is a harness error-model
limitation. The passing current replays do **not** establish that every historical
failure was solely a harness artefact. Harmonic solver behaviour has changed
since the issue commits, including #1423's residual fix and #1587's choice of
method per model and frequency. This investigation does not retrospectively
certify the old engine outputs.

## What was missing

Harmonic symmetry used the static solve's relative error budget and its largest
static displacement as a cancellation floor. The solver also obtains damping
from eigenvalues and evaluates a frequency-dependent complex system. Even a
response that is zero by symmetry can carry error at the scale of the full
response before cancellation. Near a resonance, the resolvent amplifies both
forcing and errors in the dynamic operator.

The newly added #1464 resonance budget reproducer failed on the baseline:
`6.942013634697086e-8` was required by the eigen-resolvent budget, while the
static-only budget was `2.6390937254024055e-10`. These numbers are from the
recorded failing test, not a new engineering reference or acceptance tolerance.
The ordinary seeded symmetry replay and the sweeps at the first six modal
frequencies already passed on that baseline.

The spectral starting hypothesis was already handled in the harness:
`Abs2`/`Abs3` transform displacement component magnitudes by the absolute axis
map; 2D member peak forces use even local scalars. Antisymmetry is only applied
to linear rows, and the spectral row is independent of the static load.
`cluster_complete` already extended a near-repeated cluster instead of cutting
it. The remaining boundary improvement is to use eigen residual uncertainty as
well as that existing cluster criterion. No signed law is imposed on an SRSS or
CQC peak, and the existing cluster criterion has not been weakened.

## Error model

`dynamic_accuracy.rs` assembles the same free stiffness and mass pencil and
constraint reduction as the analysis, including mass rotation into inclined
support frames before free-DOF extraction. Spectral comparisons and the first
harmonic estimate use a positive, complete, finite dense pencil. Let its
mass-normalized computed eigenpairs be `(lambda_j, phi_j)` and

```
r_j = K phi_j - lambda_j M phi_j
R² = sum_j (r_j^T K^-1 r_j) / (phi_j^T M phi_j)
G_ij = normalized(phi_i)^T M normalized(phi_j)
d = ||G - I||_F
```

For `d < 1`, the modal basis's least singular value in mass coordinates is at
least `sqrt(1-d)`. The residual operator is therefore bounded by the Frobenius
column bound divided by that singular value. Converting the residual from the
inverse-stiffness norm to mass coordinates introduces the largest eigenvalue.
Allowing its own residual uncertainty gives the positive solution of
`delta² <= R²/(1-d) * (lambda_max + delta)`. The code adds the existing dense
operation-count roundoff budget `4(n+24) epsilon lambda_max`, the same convention
used by `Conditioning::with_spectrum`; no multiplier was fitted to these seeds.

The natural displacement scale is an energy bound, not the tiny forbidden
component. Cauchy-Schwarz gives

```
|e_i^T K^-1 f| <= sqrt(e_i^T K^-1 e_i) sqrt(f^T K^-1 f).
```

Summing compliance diagonals over translations bounds the largest reported
translation. Rotational compliance is excluded because harmonic symmetry does
not report rotations: putting a soft rotational compliance into a translation
floor can hide a physical translation error. Constraint rows are pulled back
through their actual transform. This also avoids depending on cancellation in
the static solution itself. The planted harmonic errors use the actual largest
static translation, rather than the larger energy bound, as their physical scale.

For Rayleigh damping `C = a0 M + a1 K`, the energy-coordinate harmonic gains are

```
g_j = 1 / |1 - omega²/lambda_j + i omega (a0/lambda_j + a1)|.
```

The maximum gain includes the massless limit as an upper-bound candidate.
An absolute eigenvalue uncertainty `delta` bounds relative frequency error by
`eta/(1+sqrt(1-eta))`, where `eta = delta/lambda_min < 1`. Both positive Rayleigh
coefficient formulas then have relative error at most `r/(1-r)` for frequency
error `r`. The dynamic perturbation budget includes stiffness/mass assembly
error, the eigen residual budget, and that damping error, with their explicit
`omega` and `omega²` factors. The resolvent identity bounds response error by

```
natural_scale * gain² * perturbation / (1 - gain * perturbation).
```

A nonpositive denominator leaves this particular estimate unbounded. A finite
estimate is retained as a cancellation floor even when its fraction of the
natural scale exceeds `conditioning::INCONCLUSIVE`. That limit still applies
to the existing relative comparison tolerance; it no longer discards a finite
absolute harmonic bound.

When the mass-normalized estimate is unavailable or unbounded, harmonic
symmetry uses the inverse pencil. With `K = L L^T`, form the symmetric
positive-semidefinite matrix `H = L^-1 M L^-T`. Its eigenvalues `mu` are inverse
squared frequencies; zero eigenvalues represent massless directions and do not
require division by zero or deletion of part of the basis.

For its complete computed eigenbasis `V`, measure `R = H V - V diag(mu)` and
`d = ||V^T V - I||_F`. Let `s = sqrt(1-d)`, requiring `d < 1`, and
`t = max(abs(mu))`. Polar orthogonalization bounds the difference from a truly
orthogonal eigenbasis by `d/(1+s)`, giving the absolute eigenvalue allowance

```
delta = (||R||_F + 2 t d/(1+s))/s + 4(n+24) epsilon ||H||_F.
```

The operation-count allowance uses the existing dense convention. Each true
inverse eigenvalue is enclosed in
`[max(0, mu_j-delta), max(0, mu_j+delta)]`. On each interval, minimize

```
|D(mu)| = |1 - omega^2 mu + i omega (a1 + a0 mu)|.
```

Its squared modulus is a quadratic. The minimizer is the interval-clamped
value `(1-a0 a1)/(omega^2+a0^2)`. This gives `g >= ||D(H)^-1||` and, using each
interval's upper endpoint divided by its minimum modulus,
`h >= ||H |D(H)|^-1||`. The massless candidate is included explicitly in `g`.
The two largest certified positive inverse eigenvalues inside the solver's
anchor-selection range identify the damping anchors. The solver selects squared
frequencies strictly above `1e-10` (`solver/damping.rs`), so inverse intervals
wholly above `1e10` cannot be anchors. These intervals remain in both resolvent
gains. Intervals touching or crossing that boundary remain uncertifiable; the
cutoff is unchanged. The inverse-frequency relative error
is bounded by `r = eta/[sqrt(1-eta)(1+sqrt(1-eta))]`, where `eta` uses the smaller
anchor, and the coefficient allowance is `b = r/(1-r)`.

Let `epsilon_a` be the existing assembly/conditioning allowance,
`d0 = |1+i omega a1|`, and `z0 = |omega^2-i omega a0|`. Scale both sides of the
perturbation by `|D(H)|^-1/2`. The stiffness and mass contributions then retain
their separate weights instead of multiplying the largest inverse eigenvalue
by a gain belonging to a different mode:

```
q = epsilon_a (d0 g + z0 h) + z0 delta g
    + b |omega| (a1 g + a0 h)
error <= natural_scale * g q/(1-q),  q < 1.
```

This is the resolvent identity in the weighted norm. It avoids an artificial
infinite bound when a very soft mode and a different near-resonant mode make
the product of separate global maxima excessive. The original finite forward
estimate remains the first choice, preserving its established eigen-roundoff
allowance and the resonance-budget regression.

For a modal result, the solver also reports the full-system residual in the
inverse-stiffness norm relative to the forcing's energy norm. Multiplying that
residual by `natural_scale * g` bounds its displacement error, including modal
truncation. This term is added to the numerical allowance. Direct frequencies
receive no modal-residual term; other frequencies use the maximum across all
reported components and the sweep. Missing, negative, nonfinite, and sentinel
residuals cannot certify a modal response. A modal method label alone is no
longer a reason to abandon a comparison.

Missing energy norms, unavailable finite damping-anchor bounds, a singular
undamped resolvent, an unbounded weighted perturbation estimate, or missing
modal residual bounds still produce an infinite floor. Such tags are
inconclusive, never compared with an infinite tolerance.

For a spectral truncation after mode `k`, Weyl intervals cannot separate the
retained and omitted spaces if the squared-frequency gap is at most `2 delta`.
Such a boundary is extended. A separated boundary has the residual/gap subspace
bound `delta/(gap-2 delta)`; an unresolved boundary is never silently cut. The
existing request ceiling still refuses an unresolved cluster. Already unsigned
peak combination invariants are preserved.

## Comparison and verification

The existing `rel_for` formula, iterative tolerance, inconclusive threshold and
all existing assertions are unchanged. A harmonic symmetry response receives
`max(existing_floor, absolute_error/rel)`. This floor is only attached in the
symmetry context; other harmonic invariants retain their previous comparisons.
Infinite floors are removed by `judge_split` and reported as inconclusive,
never flattened into a passing comparison. Strict manufactured-model baselines
keep their existing comparisons.

Once an ordinary response exceeds the floor, `max(response_scale, floor)` is
identical to its previous scale. A seeded test asserts exact equality of the
comparison ratio with and without the new floors, and verifies that both reject
the same above-boundary error. No empirical tolerance multiplier or relaxed
baseline is used.

The original change's targeted run passed 24 tests. The coverage follow-up
passes 29 targeted regressions (28 in the final selection plus the existing
eigen-spread/gap check), with zero failures or ignores, and both explicit sweep
observers. It retains the original regressions, adds finite-bound and
singular-mass checks, and measures seeded coverage against the same
`origin/main`. See the diagnosis and sweep results below. `make check.changelog`, `make check.test-targets`, and
`git diff --check` are the supporting checks. No full suites are required.

Only the metamorphic test harness and its fixtures/documentation change. There
is no production engine result change, results-change registry entry, or new
safety advisory. Previously documented engine fixes remain covered by their
existing results-change entries and advisories.


## Coverage follow-up: why the five cells were lost

The intermediate fix at `5b5de85f1` made these five published cells inconclusive.
The follow-up reproducer commit `1c6bab5be` requires their original two passes
and zero inconclusive outcomes, with each failing test marked with its issue's
`known wrong result` ignore until the fix. All five failed when explicitly run
at that commit. The final fix removes those five ignores; the twelve published
regressions all require passes again.

The following measurements are from the intermediate certificate, before the
follow-up. Both load parities have the same pencil and failure mechanism.
These are harness diagnostics, not engineering reference values.

| Cell | Gram conditioning | Eigen residual / selection | Resonance distance and actual cause |
|---|---|---|---|
| #1203 | Certified; `d < 1` | Finite: `delta = 8.725185159965636e-5`, `lambda_min = 0.005563311845880128` | Finite distance and finite response allowances `0.015933326491201875`, `0.023036339624537`, `0.009044555059896118` at the three default frequencies. All were discarded by the additional `1e-3` absolute-bound cutoff. No bound was infinite. |
| #1204 | Same as #1203 | Same published model and pencil as #1203 | Same finite bounds discarded by that cutoff; no resonance-distance failure. |
| #1209 | Not reached by the old certificate | Massless directions make the finite positive spectrum incomplete. The old all-DOFs-positive requirement returns an error before constructing the residual bound. | Not evaluated; this is an unavailable certificate, not an infinite physical resonance. The inverse pencil retains the massless directions. |
| #1215 | Not reached by the old certificate | Same incomplete-finite-spectrum requirement fails on its singular mass matrix. | Not evaluated. Its damped inverse-pencil resolvent has a finite bound. |
| #1278 | Certified; `d < 1` | Finite absolute residual `0.013186302407770703` against `lambda_min = 3.745338034225005e-9`. The relative uncertainty exceeds one and the interval overlaps the positive-mode cutoff. | The forward formula returns infinity at the eigen/anchor guard, before evaluating resonance distance. The inverse-pencil anchor estimate is finite. |

The regression `harmonic_certificates_compare_finite_published_and_inclined_bounds`
asserts these mechanisms and checks a finite final bound at each default
frequency for each parity. It also covers rich seed `2026110200084`: the first
draft lost that pair because it did not rotate mass into inclined support
frames. The existing mass assembler provides that rotation; no production
solver change was needed.

## Seeded before/after measurement

Both sweeps use seeds `2026110200000..2026110200199` in each dimension and both
load parities, and only the harmonic symmetry row. The baseline was run from
`origin/main = 8f4c3ee6c07c661c090865f7390d10b78162786f` by temporarily restoring
its tracked harness sources inside this worktree and adding only the same sweep
observer. The live sources were restored afterwards. No other worktree or
branch was changed. Published JSON fixtures added by the original reproducer
were supplied unchanged to the baseline observer.

The supported sweep cycles the published half-models #1203/#1278/#1464 in 2D
and #1209/#1215/#1218/#1281 in 3D. Each seed multiplies the half-model's material
stiffnesses by a seeded dimensionless factor in `[0.5, 2)` and selects two
excitation frequencies in `[0.25, 4)`, alongside zero. These are sampling ranges,
not acceptance tolerances. It gives 200 distinct seeded inputs and 400 actual
symmetry comparisons per dimension.

| Sweep | Dimension | Before passes / inconclusive / failures | After passes / inconclusive / failures | Inconclusive fraction before -> after |
|---|---|---|---|---|
| Supported published families | 2D | 400 / 0 / 0 | 400 / 0 / 0 | 0% -> 0% |
| Supported published families | 3D | 400 / 0 / 0 | 400 / 0 / 0 | 0% -> 0% |
| Rich corpus generator | 2D | 28 / 4 / 0 | 28 / 4 / 0 | 4/32 = 12.5% -> 12.5% |
| Rich corpus generator | 3D | 2 / 0 / 0 | 2 / 0 / 0 | 0/2 = 0% -> 0% |

The denominator is passes plus inconclusive plus failures, excluding refusals
and unrepresentable transforms. The rich generator has many incompatible or
refused models: 232 symmetry outcomes in 2D, including 200 refusals, and 27 in
3D, including 25 refusals; the other attempted transforms are not constructible.
The four unchanged 2D inconclusive outcomes are both parities of seeds ending
in `0046` and `0193`, already beyond the existing stiffness-conditioning gate
on the baseline. They are not new certificate losses. Among all 232 rich 2D
outcomes the fraction is 4/232 = 1.7241% on both versions. The supported sweep
prevents the sparse 3D rich coverage from concealing a regression.

Both ignored sweep observers assert the reported pass/inconclusive/refusal
counts and zero failures. Run them explicitly through `make shell`:

```sh
cargo test --release -p dedaliano-engine --test metamorphic harmonic_coverage:: \
  -- --ignored --nocapture
```

The 2D and 3D planted static-translation-scale errors still return `Verdict::Fail`.
Both spectral combination rules still reject planted peak-magnitude errors.
The unresolved-certificate test now explicitly supplies a missing certificate,
because its former #1278 fixture has become certifiable; both its unchanged
inconclusive assertions remain. A manufactured modal-residual error is bounded,
while an undamped resonance and an uncertain inverse damping anchor remain
unbounded. Existing tolerances, baselines, and pass assertions are retained.

## PR #1887 review regressions

The zero-forcing natural scale is zero. Previously an infinite numerical or
modal-truncation estimate produced NaN when multiplied by that scale, and the
caller's `max` discarded the NaN in favor of its finite static floor. The
combined estimate must now be finite before multiplication; otherwise the floor
is explicitly positive infinity, including for zero forcing. A manufactured
zero-load regression covers an undamped resonance and overflowing modal
truncation, and retains a finite, certifiable zero-load case.

The inverse certificate also previously rejected every spectrum with an inverse
eigenvalue above the damping-anchor cutoff. A manufactured singular-mass pencil
now checks finite bounds with two resolved eligible anchors and a third mode
wholly below the positive squared-frequency cutoff. That third mode still
makes its undamped resonance unbounded. Intervals crossing or touching either
side of the anchor cutoff remain unbounded.

Both new regressions failed before the fix when explicitly run with their
`known wrong result: #1887` ignores overridden. The seeded resonance sweep now
requires one symmetry pass per issue and load parity, zero inconclusive
outcomes, and the resonance-budget test requires a finite budget in addition to
its original lower bound. Those strengthened checks already passed before this
review fix. Ordinary invariance checks use the public harmonic solver wrappers;
symmetry checks obtain the damping metadata from the same underlying solve.
This restores the entry-point coverage checked by `make lint.engine` without
changing solver outputs or weakening the registry.

After the review fix, both new regressions pass without ignores. Targeted release
validation passed all five dynamic-accuracy tests and 18 harmonic regressions,
including both wrapper paths and the planted-error rejection checks. The
resonance sweep recorded 14 passes, zero failures, zero refusals, and zero
inconclusive outcomes. `make lint.engine`, `make check.changelog`, and
`make check.test-targets` passed. No full suite or extended seeded sweep was run.
