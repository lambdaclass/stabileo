# Global axes input conversions (2026-11-16)

Integration of PR #1986 preserves the canonical solver frame. Selecting a presentation
frame must not mutate an existing saved model or change its solver input or result.
No numerical solver algorithm or tolerance changes here.

The unmerged axes branch inferred a spatial snapshot from any explicit node `z`,
even when the snapshot explicitly declared 2D analysis. Explicit 2D now wins.
Nonlinear support curves in canonical model axes store the nonnegative branch
of a symmetric law; signed asymmetric canonical branches remain refused by the
engine. The initial integration incorrectly treated their coordinate pairs as
magnitudes during framed serialization. Round 3 below supersedes that conversion.
Member-local curves stay local.
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

## Round 3: quantity kinds and all output paths (#2259)

A shared typed quantity transform distinguishes vectors, pseudovectors,
magnitudes, and displacement/force spring pairs. Result adapters select magnitude
semantics from the result metadata. Signed forces and displacements retain their
signs, moments and rotations retain their axial-vector sense, and SRSS/ABS
components only permute. Plane tables, CSV, Excel including totals, and the raw
forces report now share that rule with the spatial result tables and reports.
The source guard scans production output files and rejects primitive matrix
imports, direct frame-row transforms, axis-sign multiplication, and the observed
plane-result bypass. It includes deliberately invalid examples so removing the
checks does not make the guard pass.

The modal table and PRO report display the engine's nonnegative massRatio fields,
permuted without signs. The engine's participation fields are signed modal
participation factors, not mass ratios; they remain available as signed factors
in the educational explanation. The cumulative mass calculation is unchanged.

A framed nonlinear spring serializes both displacement and force with the axis
sign, then restores displacement ordering. Both import and export use the same
pair transform. The nonlinear engine still receives canonical positive branch
coordinates on a valid round trip and still refuses unsupported signed
asymmetric canonical curves. This affects experimental framed code and workbooks;
reimport those experimental inputs. Canonical saved models retain their solver
answers. No numerical engine algorithm, tolerance, refusal, or results version
was changed.

Generated combination display names are rebuilt from their constituent cases
and factors through the existing definition formatter. Only cases marked
axisNamed transform their names. User names and user-renamed combinations remain
literal. Explore renders signed plane nodal loads; global and projected creation
fields share axis names and component conversion. Reversed hydrostatic elevations
are checked through the actual shell card rather than a cancelling helper pair.

The requested global px report sign change was not applied: stored plane px is
member-local even when the transverse p component has isGlobal set. The existing
inclined-member regression and both model builders confirm that contract.
Changing only its report would misstate the physical direction of an existing
load. The coordinator must resolve this scope conflict before a stored-load
contract change or migration is attempted.
