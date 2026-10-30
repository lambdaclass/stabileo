# Safety containment diagnostics

PR #807, issue #447. Known-issue warnings added; affected unsafe results are withdrawn. Numerical values of retained results are unchanged.

The snapshot diagnostic strings now name known issues. Numerical kernels and numerical baselines are unchanged. Structured refusals withhold affected unsafe results, including 2D plastic (#758), non-XY solid shells (#757), and distorted MITC4 membrane bending (#798). See [the containment ledger](../verification/CONTAINMENT.md) for all predicates and controls.

The determinism corpus requires six 2D plastic refusals: two fixtures × solve, certification and bundle export. Bundle exports propagate the structured solver refusal rather than discarding it before computing independent bounds. All four 3D plastic certification/export cases still succeed, and both 3D certificates must certify. Cross-runtime output comparisons remain exact, including refusal diagnostics.

Review follow-up adds SH-MITC4-CONVERGENCE warnings (#810) to MITC4 analyses, without numerical changes or new input refusals. The buckling matrix helper omits affected solid-shell stresses; spectral and kinematic operations use non-static validation policies. Failed advanced reruns retire their panel, store and report state; exports enforce the same disposition as the displayed results.

After merging main, three further PRO snapshots receive only the #810
`SH-MITC4-CONVERGENCE` warning. In each listed path, `diagnosticCodes` changes
from `""` to `"warning:known_issue"`:

| Snapshot | Exact changed paths |
| --- | --- |
| `pro-deep-beam-shell` | `base.diagnosticCodes`, `case[1].diagnosticCodes`, `case[2].diagnosticCodes`, `case[3].diagnosticCodes`, `case[4].diagnosticCodes`, `combo[1].diagnosticCodes`, `combo[2].diagnosticCodes`, `combo[3].diagnosticCodes`, `combo[4].diagnosticCodes` |
| `pro-rc-qa-diagnostic-shells` | `base.diagnosticCodes`, `case[1].diagnosticCodes`, `case[2].diagnosticCodes`, `combo[1].diagnosticCodes`, `combo[2].diagnosticCodes`, `combo[3].diagnosticCodes` |
| `pro-mat-foundation` | `base.diagnosticCodes`, `case[1].diagnosticCodes`, `case[2].diagnosticCodes`, `case[3].diagnosticCodes`, `case[4].diagnosticCodes`, `combo[1].diagnosticCodes`, `combo[2].diagnosticCodes`, `combo[3].diagnosticCodes`, `combo[4].diagnosticCodes` |

All 24 changes are mandatory shell convergence warnings; no numerical value,
added/removed quantity, or tolerance changes. The tests also assert the exact
`warning:SH-MITC4-CONVERGENCE` finding, independently of the snapshot strings.
