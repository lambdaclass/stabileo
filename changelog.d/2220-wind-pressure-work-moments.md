### BREAKING (results)
#### Wind pressure work moments and sign forces (2026-11-16)

Wind pressure integration independently checks moments through degree three and
preserves one-signed member pressure, correcting cubic densities that could
silently change member forces and deflections on unmerged PR #2220. Solid-sign
force reports now integrate the applied physical width. Regenerate W/Wa and
rerun analyses, combinations and design checks. See the
[results-change record](../docs/results-changes/2026-11-wind-pressure-work-moments.md).
