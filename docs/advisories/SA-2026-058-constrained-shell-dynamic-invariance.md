# SA-2026-058: A constrained 3D frame and shell model gives different dynamic results after relabelling, rotation or unit conversion

| | |
|---|---|
| Severity | High |
| Status | Recorded 2026-11-10; unfixed |
| Issue | Found in the analysis-error-model 200-seed investigation, seed `2026110200131`; no issue has been filed by this work |
| Fix | None in this change |
| Affected versions | Verified at development commit `8f4c3ee6c`; earlier releases have not been bisected |
| Re-check registry | None yet: no engine fix or result-version change is included |

## Affected features

3D harmonic analysis and forced time history on the retained mixed frame, truss and quadrilateral-shell model with an EqualDOF constraint. The extent beyond this model has not been established.

## What was wrong

Equivalent descriptions of the same model return materially different displacements. This is a separate engine finding, not one of the eight published issue models fixed by the harness investigation. It remains a failure under the new error budgets.

The retained input is
[`seed-2026110200131-3d.json`](../../engine/tests/metamorphic_corpus/nightly/analysis-accuracy/seed-2026110200131-3d.json).
Its metadata preserves the original case name and densities, which are needed to reproduce the transforms.

| Check | Original / expected | Equivalent model / actual |
|---|---:|---:|
| Harmonic imaginary translation, relabelling | −0.24914829621 | −0.26766596275 |
| Harmonic imaginary translation, rotation | 0.52404119283 | 0.29853247644 |
| Time-history translation, relabelling | −0.0061489286069 | −0.0048659700825 |

These are recorded engine outputs in the reproducer's units, not engineering reference values. At least one result in each equivalent pair is wrong; this investigation does not establish which side is correct or a conservative error direction.

An additional operator audit found that mass transformed covariantly to relative roundoff (`4.568283148204278e-16`), whereas the assembled stiffness discrepancy after undoing the unit conversion was `9.99999e-5` of its largest entry. Rayleigh coefficients also changed beyond their dimensional rescaling. Artificial rotational stiffness based on a maximum that mixes translational and rotational units is a suspect; the complete engine root cause has not been established or repaired here.

## How to tell if your results are affected

The demonstrated model combines shells, frames, a truss and a constraint. Renumbering the nodes, rotating the full model, or changing all physical units must preserve the physical response. A material change under those operations is an affected result. Passing this check alone does not certify an arbitrary dynamic analysis.

## Fixed in

Unfixed. The harness change preserves the harmonic and time-history failures for this model. It does not return different engine numbers or silently mark the model passed or inconclusive.

## Workaround

Independently verify dynamic results for a model exhibiting this sensitivity. No conservative correction factor has been established.

## What to do with results you already have

Do not rely on dynamic demands from a model that changes materially under equivalent descriptions. Verify them with an independent analysis before using them for design.

To reproduce, enter `make shell` in this worktree and run:

```sh
NIGHTLY_MODEL="$PWD/engine/tests/metamorphic_corpus/nightly/analysis-accuracy/seed-2026110200131-3d.json" \
NIGHTLY_RESULTS="$PWD/.seed131-results.json" METAMORPHIC_SEED=2026110200131 \
cargo test --release -p dedaliano-engine --test metamorphic metamorphic_replay \
  -- --ignored --exact --nocapture
```

Failure is expected. The complete report may contain findings outside the five analyses in the targeted sweep.
