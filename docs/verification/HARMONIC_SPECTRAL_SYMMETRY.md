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
| #1203 | 2026110201350 | 2D | harmonic | 2 passes | 2 inconclusive |
| #1204 | 2026110201350 | 2D | harmonic | 2 passes | 2 inconclusive |
| #1209 | 2026110205053 | 3D | harmonic | 2 passes | 2 inconclusive |
| #1215 | 2026110201737 | 3D | harmonic | 2 passes | 2 inconclusive |
| #1218 | 2026110200823 | 3D | harmonic | 2 passes | 2 passes |
| #1278 | 2026110303012 | 2D | harmonic | 2 passes | 2 inconclusive |
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
constraint reduction as the analysis. The new certificate is deliberately
limited to a positive, complete, finite dense pencil. Let its mass-normalized
computed eigenpairs be `(lambda_j, phi_j)` and

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

A nonpositive denominator is uncertifiable. The implementation also refuses to
certify this bound if it exceeds the existing `conditioning::INCONCLUSIVE`
fraction of the natural scale. It currently certifies direct harmonic sweeps;
modal truncation beyond the direct path requires a separate truncation
certificate and is inconclusive here. Missing mass-frame support, incomplete
finite pencils, nonpositive energy norms, and unbounded modal bases likewise
remain inconclusive. An eigenvalue uncertainty interval crossing the solver's
positive-mode cutoff cannot certify the selection of damping anchors either.
The five changed published cells are certification limits,
not successful comparisons with a larger allowed relative error.

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

The final targeted run passed 24 tests. `make check.changelog`,
`make check.test-targets`, and `git diff --check` also passed. `cargo-nextest`
is unavailable in the development shell, so the exact named tests were run
with release `cargo test` through `make shell`. No full suites were run.

Targeted tests cover all twelve published seeds, both load parities, sweeps at
modal resonances, the failing resonant-budget reproducer, physical-scale planted
errors in 2D harmonic, 3D harmonic, and spectral pair magnitudes, residual error
intervals crossing a truncation boundary, and an uncertifiable harmonic response
that must never pass even when its output is deliberately corrupted.

Only the metamorphic test harness and its fixtures/documentation change. There
is no production engine result change, results-change registry entry, or new
safety advisory. Previously documented engine fixes remain covered by their
existing results-change entries and advisories.
