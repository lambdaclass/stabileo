# Global axes input conversions (2026-11-16)

Integration of PR #1986 preserves the canonical solver frame. Selecting a presentation
frame must not mutate an existing saved model or change its solver input or result.
No numerical solver algorithm or tolerance changes here.

The unmerged axes branch inferred a spatial snapshot from any explicit node `z`,
even when the snapshot explicitly declared 2D analysis. Explicit 2D now wins.
Nonlinear support curves store the nonnegative branch of a symmetric law.
Their magnitude pairs are retained when directions are permuted, including under
reflection. Signed asymmetric branches remain refused by the engine. Member-local
curves stay local.
The shared snapshot transformer applies this rule to both model-code directions
and project-workbook export.

The workbook importer inversely maps directional support names and maps flat
spring and settlement columns to the plane's internal fields after header unit
conversion. Template examples use the same selected directions, including nonzero
plane couples. These corrections affect models entered through the new frame
feature, which is absent from origin/main at d877e0b53. Reimport code or workbooks
created while testing that unmerged feature before relying on their results.

Main reports `LoadData` and `SelfWeight` as unsupported sheets. Round 2 adds
validated import of explicit case `SelfWeight` rules, with inverse direction and
factor conversion in every frame. All-member and explicit-member scopes are
supported. Standalone sources and group scopes are reported as unsupported;
the importer never broadens them to the entire model. `LoadData` remains an
unsupported sheet, so this is not a complete project-workbook importer.

Regressions exercise all 48 signed frames, explicit 2D snapshots with zero depth,
both spatial modes, valid symmetric and refused asymmetric spring curves, workbook support fields
and their units, and nonzero template couples. Tests compare the sign and physical
meaning, as well as round trips; a wrong forward/inverse pair cannot pass merely
by cancelling itself. The reproducer-only commit is a0191e25c; enabling its skipped
cases before the correction produced 15 failures, recorded in `.handoff.md`.


## Round 2: draft and result semantics (#2259)

Changing axes clears frame-dependent shell draft values, including coordinates,
partial extents and point components. A pressure cannot retain a magnitude while
its axis selector silently switches direction. Re-entering a valid load still
uses the same canonical builder.

SRSS and ABS results carry component-magnitude semantics. One shared result-frame
conversion now permutes their translational and axial components without signs;
signed results still receive the vector or pseudovector transform. Multi-source
and current tables, calculation and PRO reports, workbook rows, CSV and Excel use
that conversion. This corrects presentation of existing magnitude results;
it does not change the numerical solver. Influence-envelope negation exchanges
upper and lower bounds and preserves the absolute plotting scale.

The registry no longer claims that this input/presentation work explains every
numerical difference. Its applicability uses the axes feature's `axisNamed` case
marker, absent from canonical pre-feature files. It declares no numerical
quantities: saved canonical inputs retain their exact solver answers. Historical
files without that marker do not receive this notice. The instruction to reimport
experimental inputs remains in this write-up and is translated in all supported
locales; canonical files cannot reveal which experimental UI originally entered
their values.

Round 2 regressions fail on `ab1156eab`, including browser draft and modal-note
checks. Additional table and download reproducers fail on the same parent sources.
Committed files produced with the pre-axes serializer are independently compared
with the existing exact linear/P-Delta oracle in every signed frame. No tolerance,
numerical baseline or assertion was relaxed. No engine algorithm changes.
