### BREAKING (results)
#### Empty member-force intervals and load IDs retain their input meaning (2026-11-17)

Fix #2219: discard exactly empty finite manual distributed-force intervals in the shared 2D/3D solver-load path, while retaining refusals for unsupported positive spans and distributed moments. Explicitly accept existing numeric distributed-load IDs in the shared raw/typed plane schema so 2D plastic requests reach the required #758 refusal. These restore behaviours lost only on the unmerged gravity branch. Re-run affected models. See [the results-change record](../docs/results-changes/2026-11-member-load-input-compatibility.md).
