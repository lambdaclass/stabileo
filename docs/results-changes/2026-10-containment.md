# Safety containment diagnostics

PR #807, issue #447. Known-issue warnings added; affected unsafe results are withdrawn. Numerical values of retained results are unchanged.

The snapshot diagnostic strings now name known issues. Numerical kernels and numerical baselines are unchanged. Structured refusals withhold affected unsafe results, including 2D plastic (#758), non-XY solid shells (#757), and distorted MITC4 membrane bending (#798). See [the containment ledger](../verification/CONTAINMENT.md) for all predicates and controls.

The determinism corpus requires six 2D plastic refusals: two fixtures × solve, certification and bundle export. Bundle exports propagate the structured solver refusal rather than discarding it before computing independent bounds. All four 3D plastic certification/export cases still succeed, and both 3D certificates must certify. Cross-runtime output comparisons remain exact, including refusal diagnostics.

Review follow-up adds SH-MITC4-CONVERGENCE warnings (#810) to MITC4 analyses, without numerical changes or new input refusals. The buckling matrix helper omits affected solid-shell stresses; spectral and kinematic operations use non-static validation policies. Failed advanced reruns retire their panel, store and report state; exports enforce the same disposition as the displayed results.
