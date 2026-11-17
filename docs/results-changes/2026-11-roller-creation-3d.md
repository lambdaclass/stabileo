# New 3D rollers keep their stated restraints

Issue [#2277](https://github.com/lambdaclass/stabileo/issues/2277), round 2 of
[#2276](https://github.com/lambdaclass/stabileo/issues/2276).

The [round 6 correction](2026-11-support-lifecycle.md) supersedes the placement,
copy and preset-edit behavior described here for the original round 2 change.

## What changed

The model store normalized every newly written `rollerY` to `rollerZ`, including
in Basic 3D and PRO. Following the #2276 refusal, such a newly created support
could not solve. A type-only edit also retained an old explicit mask, so changing
the direction could leave the previous restraints in force.

Single creation, bulk creation, copied entries and explicit type edits now pass
through `explicitRoller3D`. In a space workspace this writes an explicit mask for
each roller. A new bare `rollerZ` choice uses `rollerY`, matching the existing
3D gizmo's Y grouping. This creation rule does not migrate saved ambiguous models.
The XY, XZ and YZ types preserve the solver's sliding-plane definitions. Explicit
masks supplied by a caller take precedence. Changing a roller's type regenerates
the named mask unless that edit supplies its own mask; editing other fields keeps
the existing mask. Global 3D roller edits materialize a standing plane model before
writing space restraints, including its node, load and existing support coordinates.

The masks below come from `support-dofs-3d.ts`; `1` means restrained. Components
are translations X/Y/Z followed by rotations X/Y/Z.

| Newly chosen type | Stored type without a caller mask | Explicit mask |
|---|---|---|
| rollerX | rollerX | 011;110 |
| rollerY | rollerY | 101;110 |
| rollerZ | rollerY | 101;110 |
| rollerXY | rollerXY | 001;000 |
| rollerXZ | rollerXZ | 010;000 |
| rollerYZ | rollerYZ | 100;000 |

The existing viewport 3D tool, context-menu tool and PRO drawing draft already use
per-DOF masks. `Viewport3D.svelte`'s `toSupportType` is used only in its plane-workspace
branch and correctly retains plane `rollerZ`. The selected-support component now
edits explicit space restraints and omits the plane-only X/Z direction controls
for space models. Named space supports without a mask show the solver's restraints.
No UI strings change.

## Results and compatibility

The engine and adapter are unchanged. Newly created or explicitly redirected
supports can give different reactions, displacements and member forces because
they now carry the stated restraints. Under the immediate parent `e8ef72db1`,
a newly created Y roller was refused as ambiguous rollerZ. On origin/main
`44d527d64`, the same store normalization fed the silent six-restraint fallback
already documented by [the #2276 results-change record](2026-11-roller-z-fixed.md).
This round adds no advisory.

Saved bare `rollerZ` still refuses in genuine 3D. Editing an unrelated field does
not resolve it. An explicit type or restraint choice is required. Existing masks
are not bulk migrated, and plane creation retains its unmasked vertical-slider
meaning. Projects with rollers in Basic 3D or PRO receive the `roller-creation-3d`
recheck notice. Review the intended restraints before rerunning analysis,
combinations and design; review earlier deliverables where an edited direction
might have retained a prior mask.

## Verification

The reproducer commit skips known-wrong Vitest tests unless
`RUN_KNOWN_WRONG=2277` is set. On its parent, the initial targeted run gives
59 failing regressions and 21 passing controls. Removing the skips after the fix
makes those 80 tests pass. The final expanded 96-test set gives 74 failures and 22 passing controls against
the same parent production files, then passes after the fix. Standing-plane
transition cases cover each creation/type-edit entry point, and bare named space
supports display the effective solver mask. Separate registry checks pass too.

Component tests render all six checked/unchecked restraint labels, place sliders
along X, Y and Z and in XY, XZ and YZ through the production viewport and panel
helpers, and solve a small loaded beam using real WASM. Model tests cover both
Basic 3D and PRO, all roller names, explicit overrides, stale-mask replacement,
retained refusal of saved ambiguous data, unchanged plane semantics, and linear
and nonlinear input, sync, async, sequential-combination and parallel-combination
entry points. In Node the parallel worker attempt falls back to sequential
execution; actual browser workers are not exercised. Native Rust receives booleans, not these names;
there is no native creation-name path to change or test.
