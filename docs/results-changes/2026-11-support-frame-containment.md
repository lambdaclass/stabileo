# Roller edits that require an explicit support frame

Issues [#2289](https://github.com/lambdaclass/stabileo/issues/2289), [#2294](https://github.com/lambdaclass/stabileo/issues/2294) and [#2304](https://github.com/lambdaclass/stabileo/issues/2304).

## What changed

- Space transforms now refuse a non-translational edit of a memberless, unmasked `rollerZ` before moving or copying any geometry. Current main already refuses the ambiguous support when it builds spatial solver input.
- A local plane roller can use every incident member to define its axes. Copy and clipboard capture refuse a selection that omits one of those members. Users can include the members or make a copy without supports. Moves, copies and insertions now check the final member geometry before applying the edit. A weld, a repeat link or a rotation can redirect an existing or carried local roller. The edit is refused if the final frame differs from the expected frame, including for a rigid turn without welds or links.
- Snapshots and restores keep the recorded support type. Older files can have a `rollerZ` label on the native `rollerY` preset mask. A type-only re-selection of `rollerZ` on that record requires an explicit mask before the 3D model can solve.

## Results and applicability

The changes apply to model edits and persistence in the web app. The analysis engine receives the same restraints for identical inputs. Geometry and supports from refused transforms remain as they were before the edit. Existing snapshots can still contain a roller with the wrong axes after an earlier copy or change of type. Review the recorded bearings and rerun the affected analyses, combinations and design checks.

On the prior main revision, copying the node of a local plane roller from a vertical member and connecting it to a horizontal member gave zero vertical reaction at the copy under a unit downward load. A separate paste-in-place reproducer carried the complete vertical member and welded it to an existing horizontal bearing. The weld changed the existing vertical reaction from 1 to approximately 0.5 and introduced a horizontal reaction of approximately −0.5 under a unit downward load. The edit returned success. On current main at `09c800543`, the same reaction change occurs when a quarter-turn moves a member onto the stationary bearing. A rigid quarter-turn of three rays at 0°, 45° and 135° resolves to a frame of 30° instead of the carried 150° frame, even with no welds. That copy also returned success and a reaction along the wrong axis. On the prior revision, a native Y roller reopened under a Z label and a type-only change to Z still gave a positive unit vertical reaction. Supplying the intended Z-release mask gave zero. For the memberless quarter-turn, current main refuses rather than returning a fully fixed result. The issue records that earlier behavior.

## Verification

The WASM regressions exercise in-place and copied quarter-turns, direct and detached copies, clipboard capture and placement, paste in place, snapshot replay, and linear and nonlinear solves. The local roller regressions check the refusals, the preserved model and undo history, and the bearing reactions through the direct, asynchronous, combination and second-order plane solvers. The controls exercise known restraint masks, copies with their reference members, and the legacy plane alias. The refusal happens before the solver for geometry edits and in the common 3D support mapping for an ambiguous preset.
