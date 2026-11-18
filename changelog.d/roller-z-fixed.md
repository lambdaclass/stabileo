### BREAKING (results)
#### Ambiguous or unknown 3D support names no longer become fixed (#2276)

3D solves now refuse an unknown support name instead of assigning six fixed restraints. Legacy `rollerZ` has conflicting 3D meanings and requires explicit restraints; its defined 2D projection is preserved. Saved 3D projects with `rollerZ` or a previously unknown support type receive a re-check notice. Review their intended restraints and rerun analysis, combinations and design. The bundled `rc-beam-flexure` bearing now has explicit restraints and recovers the simply supported reactions and moments. See [the results-change record](../docs/results-changes/2026-11-roller-z-fixed.md) and the requested [SA-2026-089 draft](../docs/advisories/SA-2026-089-roller-z-fixed.md).
