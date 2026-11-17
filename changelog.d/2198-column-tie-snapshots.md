### BREAKING (results)

#### Register the audited column tie snapshot movements

Update the five affected RC design snapshots for the existing column tie and secondary-shear correction (#2198). Ordinary column tie selection reduces recorded shear capacities and raises ratios in `rc-design-qa-8`, `rc-design-qa-seismic`, `rc-qa-diagnostic` and the frame in `rc-footing-cad-poc`. In `rc-design-qa-row2`, removing the beam-only leg rule lowers primary capacity and removes the secondary-shear failure; the existing flexure warning remains. The [results audit](../docs/results-changes/2198-round18-column-secondary-shear.md#snapshot-audit-of-the-affected-design-corpus-cases) records all 112 changed values and their clauses. Footing results and analysis results are unchanged.
