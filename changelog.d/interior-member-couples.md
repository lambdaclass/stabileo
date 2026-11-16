### BREAKING (results)
#### Interior deflection and rotation retain concentrated member couples (2026-11-15)

Member hover readings and deformed shapes now include concentrated couples inside a span. The hover and both spatial bending curves use the engine's shared recovery, including point and distributed loads and released ends. Reopen saved projects with member loads, rerun analysis, and review displayed deflections and serviceability checks. Loaded recovery without sufficient bending stiffness is refused explicitly. Nodal solutions and member forces are unchanged. See [the results-change record](../docs/results-changes/2026-11-interior-member-couples.md) ([SA-2026-070](../docs/advisories/SA-2026-070-interior-member-couples.md), #2143; PR #2170, pending merge and release).
