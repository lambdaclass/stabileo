# Global axes input conversions (2026-11-16)

Integration of PR #1986 preserves the canonical solver frame. Selecting a presentation
frame must not mutate an existing saved model or change its solver input or result.
No numerical solver algorithm or tolerance changes here.

The unmerged axes branch inferred a spatial snapshot from any explicit node `z`,
even when the snapshot explicitly declared 2D analysis. Explicit 2D now wins.
Nonlinear support curves now transform both force and displacement with their axis
sign, and retain ascending displacement order. Member-local curves stay local.
The shared snapshot transformer applies this rule to both model-code directions
and project-workbook export.

The workbook importer inversely maps directional support names and maps flat
spring and settlement columns to the plane's internal fields after header unit
conversion. Template examples use the same selected directions, including nonzero
plane couples. These corrections affect models entered through the new frame
feature, which is absent from origin/main at d877e0b53. Reimport code or workbooks
created while testing that unmerged feature before relying on their results.

`LoadData` and `SelfWeight` project workbook sheets are not supported by this
importer on main or this integration. They are explicitly returned in
`unknownSheets`; this change does not claim a complete project-workbook import.

Regressions exercise all 48 signed frames, explicit 2D snapshots with zero depth,
both spatial modes, asymmetric and local spring curves, workbook support fields
and their units, and nonzero template couples. Tests compare the sign and physical
meaning, as well as round trips; a wrong forward/inverse pair cannot pass merely
by cancelling itself. The reproducer-only commit is a0191e25c; enabling its skipped
cases before the correction produced 15 failures, recorded in `.handoff.md`.
