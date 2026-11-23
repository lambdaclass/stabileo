# SA-2026-108: Planar projection could drop an out-of-plane nodal force

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-22 |
| Issue | — |
| Fix | PR [#2470](https://github.com/lambdaclass/stabileo/pull/2470), merged as `918a76194` |
| Fixed release | the next release after 0.6.4 |
| Affected versions | Confirmed in 0.6.4. Earliest affected release is unconfirmed |
| Re-check registry | [`solve-load-accounting-inputs`](../../web/src/lib/provenance/result-changes/solve-load-accounting-inputs.json) |

## Affected features

Web analysis of spatial models projected onto the XZ or YZ plane when
a nodal force has a nonzero component perpendicular to the analysis
plane.

## What was wrong

Before PR #2470, XZ projection could drop the nodal force component
`Fy`, and YZ projection could drop `Fx`. The solve succeeded without a
diagnostic for the missing force.

In a WASM probe on main before the fix, each projected reaction vector
was identical to that of its vertical-only control. Spatial analysis of
the same inputs returned `fy = -2.220446049250313e-16` in the XZ probe
and `fx = -2.220446049250313e-16` in the YZ probe.
[Results-change record](../results-changes/2026-11-solve-load-accounting-inputs.md).

## How to tell if your model is affected

Check the original spatial model and the plane used to analyse it. In
each load case, look for nonzero global Y components of nodal forces
when the plane was XZ, or nonzero global X components when it was YZ.
An affected planar result could look like one from a model without
those force components.

## Fixed in

The next release after 0.6.4. Before solving, PR
[#2470](https://github.com/lambdaclass/stabileo/pull/2470) compares
each load case's entered total force and moment about the origin with
the totals assembled for the solver. If they differ beyond roundoff,
analysis stops with a translated diagnostic naming the load case and
the mismatched component.

## Workaround

Use spatial analysis with the intended nodal forces. Verify the
reactions against the entered loads before relying on the results.

## What to do with results you already have

Review the entered nodal forces and rerun affected analyses and
combinations in 3D. Check reactions, repeat dependent design checks
and regenerate affected reports.

## Credits and references

See [PR #2470](https://github.com/lambdaclass/stabileo/pull/2470) for
the load accounting check and the XZ and YZ regression tests.
