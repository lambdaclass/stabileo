# SA-2026-062: An initial elastic refusal could become a silent zero plastic collapse factor

| | |
|---|---|
| Severity | High |
| Status | Draft 2026-11-12; local fix awaiting review and release |
| Issue | Found in final review of PR #1943 |
| Fix | PR [#1943](https://github.com/lambdaclass/stabileo/pull/1943); propagate the initial regular elastic solve before any hinge fallback; pending review and release |
| Affected versions | Source-confirmed in v0.2.0, v0.3.0, v0.4.0, v0.5.0 and desktop-v0.1.0-alpha.1 through alpha.3; silent raw result replayed on main `c11af4e36316a0c1251a7175cb4fe16660090778` |
| Re-check registry | [`initial-plastic-refusals-and-stage-cancellation`](../../web/src/lib/provenance/result-changes/initial-plastic-refusals-and-stage-cancellation.json) |

## Affected features

Incremental plastic collapse analysis of 3D frames with an initial elastic
stiffness that the regular linear solver cannot resolve. Native
`solve_plastic_3d` and the public WASM `solve_plastic_3d` share the defective path.
Near-mechanism stiffness can cause kinematic rank analysis to report an
unsolvable model even though the members have positive bending stiffness.

The combined native `certify_plastic_3d` and WASM `certify_plastic_3d` call the same
raw solver. The listed release sources return its collapse factor unchanged in
`results`, alongside the separate certificate. Current main already replaces
that factor with the certified lower bound and warns about a mismatch, as
explained below. This advisory does not claim that current main silently
returns zero as its certified `results.collapseFactor`.

The changed path is specific to 3D plastic analysis. Regular linear analysis
already refuses the retained model. Existing 2D plastic containment is unchanged.
Staged construction, P-Delta and material nonlinear analyses do not call this
plastic carry path; the separate staged cancellation correction in the same
results-change entry is not this advisory's defect.

## What was wrong

The plastic solver used kinematic rank metadata to choose between the regular
elastic solve and a soft-spring fallback intended for states after plastic
hinges form. That choice was also used for the initial, unhinged state. When
rank metadata was unsolvable, the initial state could skip the regular elastic
solve, fail the fallback's member-force balance check, and return a successful
plastic result with a zero collapse factor, no hinge steps, and no warnings or
structured diagnostics.

A numerical inability to solve the intact elastic model does not establish
plastic collapse at zero load. The reported zero is conservative in this witness,
but it is still a wrong analysis result and can incorrectly classify an intact
model as a mechanism. It must be an explicit refusal rather than a collapse answer.

## Confirmed result on main

The exact retained [fixture](../../engine/tests/fixtures/final-review-plastic-conditioning.json)
is an oblique single-frame cantilever. Its loaded end holds rotations and leaves
translations free. Both bending inertias are positive. Replaying frozen main
`c11af4e36316a0c1251a7175cb4fe16660090778` production sources in this worktree gives:

- Regular linear: explicit mechanism refusal at node 2.
- Kinematic analysis: unsolvable, with two reported mechanism modes.
- Raw plastic: successful result, `collapseFactor: 0`, `isMechanism: true`, empty
  steps and hinges, and empty warnings and structured diagnostics.
- Combined certified plastic: a positive certified lower bound in
  `results.collapseFactor`, raw zero retained in `certificate.solverCollapseFactor`,
  `solverWithinBounds: false`, and an explicit `PL-3D-CERTIFICATE-MISMATCH` warning.

The [replay JSON](replays/SA-2026-062.json) retains the complete observations,
fixture hash, exact source revisions and source-only release evidence. The
positive exact certificate independently demonstrates that the raw zero does not
represent plastic collapse of this fixture. No historical release binary was run.

The prior retained main replay at
`02b4dd5d2b07e14faf2d7f53b78c986b0ff4b031` also records a silent raw zero and a
regular mechanism refusal. On PR parent `6d2d7082ef46066290f244da325665ff971430e8`,
the same regular solve instead refuses at its conditioning limit. The underlying
initial-state dispatch failure is the same. Refusal wording must not be used as
proof that the plastic result is valid.

## Affected-version evidence

Commit `7dbe2624d4cd918142e8e4fc8d7f5777a8144b79` introduced the rank-dispatched
soft-spring carry path. Every listed release tag descends from it and retains
that dispatch for the initial plastic state. Every listed release's combined
certification function returns the raw `results` unchanged, together with the
certificate. These are source findings, not release runtime measurements.

Commit `aa4119f787c9ef2bd2a8181f6daa7f795617b55f`, already present on the tested
main, separately makes the combined certified API return its exact lower bound
and warn for raw mismatches in either direction. That prevents a silent zero in
the current combined result for this witness, but leaves the raw solver defect.
PR #1943 corrects the initial-state refusal in both entry points.

## Fixed behavior

Every initial 3D plastic state goes directly through the regular linear solver,
whose error propagates unchanged. A distinct `CarryState::Hinged` is required
before the shared carry function can enter the hinge fallback. Raw and combined
certified native and WASM exports all use this function. Kinematic rank metadata
can no longer divert an initial state around the regular solve.

Targeted regression tests cover the retained model, coordinate permutations,
dense and sparse paths, raw and combined certified exports, conditioning and
rank boundaries, and a valid plastic-collapse control. The
[results-change write-up](../results-changes/2026-11-initial-plastic-refusals-and-stage-cancellation.md)
describes the correction. No released fix or deployed build is claimed by this draft.

## How to tell if a saved result is affected

Review saved 3D plastic results from the affected builds, especially results with
a zero raw collapse factor, `isMechanism: true`, and no steps or hinges. Absence
of a warning does not establish that zero is a physical collapse. Compare the
same initial model with regular linear analysis: a refusal there means the old
raw collapse answer cannot be accepted. A zero factor alone is a screening clue,
not proof that every such model has this defect.

For a combined result, inspect `certificate.solverCollapseFactor`,
`solverWithinBounds`, the interval endpoints and warnings as well as
`results.collapseFactor`. On corrected-certificate main builds, the raw zero can
be present only in the certificate metadata while the displayed factor is the
positive lower bound. Incremental steps and hinge classifications still come
from the raw solver and are not certified by that interval.

The re-check entry selects 3D member models with recorded or unknown plastic
history, and also saved construction phases for its separate staged correction.
An unstamped project is selected conservatively. A known linear-only frame
without construction phases is not affected by this entry.

## What to do with previous results

Re-run affected plastic results with the corrected build from PR #1943 and
reassess conclusions derived from the old mechanism classification, collapse
factor or hinge history. Until that fix is available, do not treat a zero returned
for an elastically refused initial model as an established collapse load. Verify
the model and its stability independently with a solver that can resolve its
physical stiffness, or retain an explicit inability-to-solve outcome. Do not add
artificial restraint or change physical stiffness merely to suppress the refusal.

A positive current-main certificate bounds the ideal plastic collapse factor;
it does not validate the raw incremental hinge history or remove the initial
elastic conditioning problem. Preserve its mismatch warning when reviewing or
sharing that result.
