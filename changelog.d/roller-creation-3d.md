### BREAKING (results)
#### New 3D rollers keep their stated restraints (#2277)

Creating or redirecting a roller with a defined direction in Basic 3D or PRO now stores explicit restraints. Y rollers keep their Y direction. Sliding-plane types keep their labelled planes, and changing a roller type replaces an old direction mask unless explicit restraints are supplied. The 3D editor no longer offers plane-only direction controls. A bare legacy `rollerZ` requires an explicit restraint choice. Review roller restraints and rerun analysis, combinations and design after edits. See [the results-change record](../docs/results-changes/2026-11-roller-creation-3d.md).
