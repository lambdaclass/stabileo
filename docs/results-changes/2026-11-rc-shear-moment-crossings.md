# Curtailed beam shear at moment transitions (2026-11-21)

A span shear check can be governed by a cut between solver stations when the demand crosses the hogging threshold while substantial shear is still acting. The station at the start of the interval can be sagging and the station at the end can have negligible shear. With curtailed reinforcement, the steel that remains at the interior cut can justify the assumed effective depth and still provide less concrete shear resistance than the bottom cage.

Verification and candidate ranking now include cuts on both sides of that moment threshold for each combination where the existing retained-layout check applies. Each cut uses the concurrent forces and the same retention, depth, and transverse cage checks as the other cuts. A supported hogging cut uses the retained top steel area in [CIRSOC 201-2025 Table 22.5.5.1](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-22-resistencia-de-las-secciones-de-los-elementos.md#c22.5.5.1), row (c). The same formula and the existing drawn-reinforcement evidence requirements apply. A formerly passing span shear row can now fail at the interior cut.

A refused primary seismic beam or column now shows its applicable capacity-shear and detailing checks as unevaluated in the report, with the reason for the refusal in each row.

Re-run affected reinforced concrete member checks before issuing an updated report.
