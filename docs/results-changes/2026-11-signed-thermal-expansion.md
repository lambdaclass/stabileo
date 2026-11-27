# Use declared zero and negative thermal expansion coefficients

Recalculate members and shells with thermal loads. A declared zero produces zero thermal strain. A negative coefficient causes contraction under heating. The former project converter substituted a family coefficient for both values. For the 4 m free-ended member heated by 20 °C in #2656, both inputs previously gave +0.0008 m. The corrected displacements are 0 m for α = 0 and −0.0004 m for α = −0.000005 /°C, from u = αΔTL. A prescribed initial strain still acts independently.

Unknown materials with an omitted coefficient retain the engine default and receive the missing-coefficient diagnostic. Native member input retains the unit-error refusal at |α| ≥ 0.001 /°C.
