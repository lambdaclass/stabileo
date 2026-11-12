### Fixed

#### Preserve stage reaction coordinates and plastic hinge mechanisms

- Preserve the sparse 2D inclined-support coordinate basis when rebuilding cumulative stage loads for internal reaction recovery, including prestress equivalents. Public staged inclined-support refusals remain unchanged.
- Restore valid 3D plastic joint-moment collapse mechanisms and hinge-induced soft-state handling after yielding, while preserving initial elastic and structured containment refusals. Raw and certified solves share the state distinction (#1846, PR #1943).
- Require complete finite member-force comparisons in the archived staged regressions, clarify the inactive-load refusal scope, and update applicable result recheck notice expectations.
