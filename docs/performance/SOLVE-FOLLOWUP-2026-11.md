# Further solve analysis — 2026-11-16

The boundary-path and interpolation-preparation recommendations were implemented
and measured on November 17. See [solver kernel results](SOLVER-KERNELS-2026-11.md)
for the corrected baseline, exact-output comparisons, and additional speedups.

This investigation follows the four commits on `perf/solve-and-results` at
`0923adb97`. It adds measurements and recommendations, not another production
optimization. Temporary source instrumentation and the preparation prototype
were reverted. [Raw evidence](solve-followup-2026-11-16.json) accompanies this report.

## Correct the standalone benchmark before further comparisons

The standalone benchmark's generated `pruneModel` contains:

```js
for (const id of model.nodes.keys())
for (const l of model.loads) {
  const n = l.data.nodeId;
  if (n !== undefined && !heldByAny.has(n)) used.add(n);
}
```

The source's first loop has a conditional body. This bundle only uses
`solvableModel`, so bundling specializes `dropLoose` to true and removes that
body. The following load loop becomes its body instead. This changes a linear
load scan into a node-count-times-load-count scan. Repeated additions to the set
are idempotent, so numerical parity checks do not expose the performance defect.

A normal application build using the repository Vite configuration, with
minification disabled for inspection, retains the conditional loop correctly.
Both `activeModel` and `solvableModel` are used by the application. **The observed
half-second overhead must not be attributed to the application.**

A temporary source rewrite puts the node loop inside `if (!dropLoose) { ... }`
and explicitly braces its body. In the standalone benchmark:

| Model | Baseline warm parallel solve | With preparation correction |
|---|---:|---:|
| Diagrid tower | 1,545.8 ms | 1,019.3 ms |
| Building | 68.95 ms | 61.40 ms |
| Industrial frame | 1,512.15 ms | 1,500.15 ms |

Tower preparation itself drops from 511.3 to 1.75 ms. Other phase differences
include run-to-run variation. These are benchmark corrections, not application
speedup claims. Seven rounds were run per model; medians exclude the first.
Both runs passed the existing within-round numerical comparisons; full outputs
were not retained for a separate baseline-versus-prototype comparison.

Before using this harness for further optimization claims, apply the explicit
block rewrite and add a bundled-runtime regression that counts load visits as
node count increases. A source-level unit test alone would miss this issue.
Refresh absolute solve and design timings afterward. The earlier same-input
combination-kernel comparisons exclude preparation and remain useful, while the
earlier full-workflow measurements retain this benchmark caveat.

## Where the linear solve now spends time

Unprofiled phase timers around the existing calls give these warm medians after
the temporary preparation correction:

| Phase | Tower | Building |
|---|---:|---:|
| Solvable-model preparation and plan | 1.75 ms | 0.20 ms |
| Worker solve and result return | 462.25 ms | 23.95 ms |
| Batched combinations | 359.65 ms | 16.85 ms |
| Envelope | 177.10 ms | 16.55 ms |

The worker measurement includes dispatch, cloning, worker input validation,
solving, finishing, and return. It is not a factorization measurement. Phase
medians need not sum to the whole-call median. Worker initialization was measured
separately and negligible on warm runs.

## Next changes, ordered by scope and evidence

### 1. Avoid allocating diagnostic path strings for every finite value

The main-thread CPU profile restricted to actual parallel-service envelope calls
attributes approximately 29.0% of samples to `boundary::outgoing`, 33.4% to input
deserialization, and 17.1% to `compute_envelope_3d_checked`. These are sampled
inclusive costs across building and tower runs, not per-run wall-clock budgets.

`engine/src/boundary.rs` constructs `format!("[{i}]")` for every sequence element
and `key.to_string()` for every field, even when all values are finite. Represent
the traversal path as typed segments: static field names, numeric indices, and
owned dynamic map keys. Render the path only on failure. Continue traversing
every number and invoking the existing containment logic.

Validate exact refusal paths and traversal order for nested structs, sequences,
maps, enum variants, custom serializers, NaN, and both infinities, including the
intentional unbounded-ratio representation. Measure allocation and export cost
before claiming a speedup. This is narrower than changing the envelope API and
can benefit other large result exports too.

### 2. Prepare invariant work inside span-rotation checks

For actual parallel-service batch calls, `largest_span_rotation` accounts for
approximately 65.4% of sampled inclusive time. Its source in
`engine/src/known_issues.rs` rebuilds interpolation-node data and allocates a
three-element `Vec` for each interpolation term, plane, and station interval.
The same profile also identifies `MemberDeflection::load_terms` and cubic-root
evaluation as substantial costs.

Start by using fixed-size arrays and preparing interpolation-node differences
outside the station loop. Preserve arithmetic order where possible. Next measure
whether repeated load evaluation can share an immutable per-member preparation.
Keep the same interval breaks, exact-root evaluation, thermal curvature, shear
flexibility, twist, and non-finite behavior. Reducing station count or omitting
the small-displacement checks would change the numerical contract.

Use the existing span-rotation regressions and near-limit refusal cases to check
the result before whole-model snapshots and browser comparisons. Any arithmetic
change needs particular scrutiny near the refusal threshold.

### 3. Fuse combination and envelope processing if transfer remains material

The batch API returns combinations to JavaScript; `computeEnvelope3D` immediately
deserializes them into Rust again. The profile confirms that this extra input
transfer is material. A fused API can retain combined results in Rust and return
both combinations and the envelope once.

The current service recovers shell stresses between these calls. Establish
equivalence for that ordering before applying fusion to shells. Also preserve
duplicate combination IDs, absent cases, repeated/zero factors, settlement and
case-displacement reconstruction, active scopes, magnitude combinations, and
containment refusals. Start with an isolated API comparison on identical case
results, then measure the real service. Do not treat the entire envelope phase
as removable transfer time.

### 4. Investigate nonlinear preparation reuse separately

The industrial frame still spends about 1.5 seconds in the synchronous nonlinear
plan. In sampled nonlinear calls, numeric Cholesky accounts for approximately
22.4%, AMD ordering 8.4%, symbolic factorization 4.4%, and span-rotation checks
21.2%. These figures include all nonlinear iterations and both service entry
points across seven rounds; they are not timings of one factorization.

Investigate whether ordering and symbolic structure can be reused for identical
active-member/support patterns. Numerical factors are reusable only when the
stiffness values and relevant conditions also match. Active-set changes, uplift,
springs, and P-Delta changes require explicit invalidation. Collect active-set
and matrix-pattern counts first to establish likely reuse.

Moving nonlinear and P-Delta workflows into workers is also valuable for
responsiveness, independently of total solve time. Preserve stale-result
handling, refusal propagation, and the existing serialized first-execution
mitigation; do not replace these solves with linear superposition.

## Measurement limits and artifacts

- Measurements used the same local native toolchain and Chromium harness as the
  first audit, with no competing benchmark or build running.
- CPU profiling and unprofiled timing were separate runs. The saved profile
  summaries filter batch and envelope samples to `solveCombinations3DParallelCore`
  so isolated comparison calls are excluded. Worker CPU is not captured.
- The normal application Vite build completed successfully. Its generated
  `pruneModel` excerpt is included in the evidence JSON. This was a bundle
  inspection, not a browser end-to-end timing of the application.
- The temporary loop prototype passed the harness's solve and combination parity
  checks on all three models. No production optimization from this follow-up
  has been retained, and no new numerical snapshots were generated.
- Local detailed artifacts: `/tmp/stabileo-tower-profile-0.cpuprofile`,
  `/tmp/stabileo-solve-phases-unprofiled.json`,
  `/tmp/stabileo-solve-preparation-prototype.json`, and
  `/tmp/stabileo-instrument-solve.py`.
