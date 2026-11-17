### BREAKING (results)

#### Check fixed beam stirrup spacing in both directions

Concrete beam element checks now reject user-provided stirrup spacing above the along-member limit in either shear direction, including a secondary row evaluated for torsion (#2198). Strength passes and sufficient leg counts no longer hide excessive spacing. Column rules and section strengths are unchanged. Recompute fixed-cage beam checks and review any new spacing failures. The [results write-up](../docs/results-changes/2198-round19-fixed-beam-spacing.md) records the model, clause, main-source exposure and unchanged flagship digest.
