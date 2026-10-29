# Safety containment diagnostics

PR #807, issue #447. diagnostic only: known-issue warnings added, no number changed.

The snapshot diagnostic strings now name known issues. Numerical kernels and numerical baselines are unchanged. Structured refusals withhold affected unsafe results, including 2D plastic (#758), non-XY solid shells (#757), and distorted MITC4 membrane bending (#798). See [the containment ledger](../verification/CONTAINMENT.md) for all predicates and controls.

The determinism corpus requires six 2D plastic refusals: two fixtures × solve, certification and bundle export. Bundle exports propagate the structured solver refusal rather than discarding it before computing independent bounds. All four 3D plastic certification/export cases still succeed, and both 3D certificates must certify. Cross-runtime output comparisons remain exact, including refusal diagnostics.
