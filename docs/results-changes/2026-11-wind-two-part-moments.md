# Interior member forces under regenerated wind loads

PR #2529 changes the distributed loads written when generating W and Wa cases. The previous generator repeatedly subdivided curved wind pressure until each linear part matched all four work moments. The new generator can fit those moments jointly with two linear parts. It retains single-part fits and subdivides when a candidate fails its checks.

Matching the four work moments preserves the equivalent beam end loads to the integration tolerance. Shear at an interior station depends on the pressure integrated up to that station. Bending moment also depends on how that pressure is distributed along the partial span. The two representations can therefore give different interior diagrams and different demands derived from them.

In the existing planar linear cubic-grid case, the analytic shear at the tested station is 0.030799999999999994. The two-part generator gives 0.030799998692103793. The cubic-grid and physical-apex regressions compare interior diagram samples against their analytic fields. These sampled comparisons do not establish a bound for every station or pressure field.

Regenerate the wind cases to use the compact representation. Then rerun analyses, combinations and checks that depend on member forces. Opening or solving an older project uses its stored loads until they are regenerated.
