# SA-2026-057: Checked 3D plastic analysis returned an incremental factor outside its certified collapse interval

| | |
|---|---|
| Severity | Medium; observed factors are conservative lower bounds |
| Status | Local fix prepared 2026-11-10; not released or deployed |
| Issues | [#1760](https://github.com/lambdaclass/stabileo/issues/1760), and the thirteen 3D artifacts in the exact plastic LP fuzz budget cluster |
| Fix | Local commit following the reproducer commit; no published PR |
| Affected versions | Confirmed at c420169e8 and reproducer commit e6d0818b3; introduction not bisected |
| Re-check registry | `plastic-3d-certificate-mismatch-refused` |

## Affected features

The engine/WASM combined `certify_plastic_3d` entry point. A certificate marked
`certified` establishes the exact collapse bounds; it does not certify the
incremental solver's separate `collapseFactor`. The raw `solve_plastic_3d` API
reports a biaxial-hinge lower-bound warning and remains an approximate analysis.
The app's certificate reader already has an outside-interval alarm. This advisory
does not establish that the app displayed these engine artifacts without it.

## What was wrong

The combined checked API returned an ordinary successful result even when its
`solverWithinBounds` field was false. A caller reading the incremental factor and
the certificate's `certified` flag without the comparison field could mistake a
conservative lower bound for the collapse load.

On the unchanged #1760 artifact, the incremental factor was 9.345131066713956 and
the exact interval was [11.574222305948126, 11.57476297081718]. All thirteen 3D
artifacts in this investigation returned an incremental factor below their exact
lower bound. They carried a warning that biaxial hinges retain their formation
moment vector. No unconservative factor or invalid exact interval was established
by these replays. The solver approximation is separate from the fuzz resource
budget problem.

## How to tell if your results are affected

A combined 3D plastic result has `solverWithinBounds: false`, or its incremental
factor lies outside either available exact bound. Inspect the lower-bound warning
on the incremental result. The registry flags 3D frame projects after plastic
analysis, including projects whose results agree and are unaffected.

## Fixed in

The local fix makes `certify_plastic_3d` refuse with the structured known-issue
error `PL-3D-CERTIFICATE-MISMATCH`. The comparison is strict: even a discrepancy
from round-off alone can cause refusal. It preserves the exact certificate checks and
the raw incremental solver's explicit lower-bound warning. It does not repair
the underlying biaxial hinge approximation. No release or deployment is claimed.

The single-artifact replay, exact input bytes, before/after table, allocation
measurements, and regression test are linked from
[the replay report](../verification/PLASTIC_LP_BUDGET.md).

## Workaround

Use independently verified collapse bounds or an independent collapse analysis.
Do not treat a conservative incremental factor as the exact collapse load.

## What to do with results you already have

Re-check uses of 3D incremental plastic factors against the exact bounds and the
solver warnings. Reassess any downstream calculation that required the collapse
load rather than a conservative lower bound.
