### BREAKING (results)

#### Interaction checks retain concurrent forces and provenance (#1316)

Member interaction checks now use each combination's concurrent station forces and retain that combination's name. CIRSOC 201 no longer pairs enveloped N, M, shear or torque; CIRSOC 301's endpoint and variable-section paths use concurrent tuples too. Steel moment-gradient capacity factors now use the same combination as the interaction forces, including the complete unbraced chain. The other-code dispatcher always checks the complete station set. Re-run saved concrete and steel member designs and review utilization, reinforcement and governing combinations. See [the results-change record](../docs/results-changes/2026-11-concurrent-design-demands.md). Fixes #1316.
