# Minimum weak-axis modulus in the F.6 channel report

The TypeScript F.6 report on main at `668dcaeea` used the same extreme-fibre distance for I-sections and channels. For the regression section with width 0.1 m, centroid 0.025 m from the back and minor-axis inertia 0.000001 m⁴, it returned 0.000020 m³. The distant edge is 0.075 m from the centroid, giving 0.000001 / 0.075 m³. Anyone who used the report field independently should recheck that modulus.

The workbench now passes the section-constants calculation’s channel modulus to the report. Without a verified modulus, the channel report returns null for Sy. Symmetric I/H sections still use half the width. The workbench displays the slenderness, conditional critical stress and classification. It did not display Sy or use this field to calculate capacity. The native and WASM section-constants calculation, member checks and solver outputs retain their existing values.

The asymmetric channel and missing-modulus tests in `flange-local-buckling.test.ts` reproduced the midpoint result on the parent. The UPN test in `channel-constants.test.ts` also exercises the report with the modulus supplied by the production WASM calculation.
