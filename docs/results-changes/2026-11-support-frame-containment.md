# Roller edits that require an explicit support frame

Issues [#2289](https://github.com/lambdaclass/stabileo/issues/2289), [#2294](https://github.com/lambdaclass/stabileo/issues/2294) and [#2304](https://github.com/lambdaclass/stabileo/issues/2304).

## What changed

- Space transforms now refuse a non-translational edit of a memberless, unmasked `rollerZ` before moving or copying any geometry. Current main already refuses the ambiguous support when it builds spatial solver input.
- A local plane roller can use every incident member to define its axes. Copy and clipboard capture refuse a selection that omits one of those members. Users can include the members or make a copy without supports.
- Snapshots and restores keep the recorded support type. Older files can have a `rollerZ` label on the native `rollerY` preset mask. A type-only re-selection of `rollerZ` on that record requires an explicit mask before the 3D model can solve.

## Results and applicability

The changes apply to model edits and persistence in the web app. The analysis engine receives the same restraints for identical inputs. Geometry and supports from refused transforms remain as they were before the edit. Existing snapshots can still contain a roller with the wrong axes after an earlier copy or change of type. Review the recorded bearings and rerun the affected analyses, combinations and design checks.

On the prior main revision, copying the node of a local plane roller from a vertical member and connecting it to a horizontal member gave zero vertical reaction at the copy under a unit downward load. A copy that retained its vertical member carried the unit load at the bearing. On the same revision, a native Y roller reopened under a Z label and a type-only change to Z still gave a positive unit vertical reaction. Supplying the intended Z-release mask gave zero. For the memberless quarter-turn, current main refuses rather than returning a fully fixed result. The issue records that earlier behavior.

## Verification

The WASM regressions exercise in-place and copied quarter-turns, direct and detached copies, clipboard capture, snapshot replay and linear and nonlinear 3D solves. The controls exercise known restraint masks, copies with their reference members, and the legacy plane alias. The refusal happens before the solver for geometry edits and in the common 3D support mapping for an ambiguous preset.
