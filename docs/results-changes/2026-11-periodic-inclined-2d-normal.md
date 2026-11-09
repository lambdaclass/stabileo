# Multi-turn 2D inclined-support diagnostic count (2026-11-09)

Review of #1780 at head `146e26346` found that the diagnostic restraint counter constructed
its normal directly from an unreduced angle. With angle `20π` and a positive global Y spring,
the horizontal component from trigonometric roundoff exceeded the existing relative component
threshold. It incorrectly added a second independent translation restraint. The new regression
`issue_1780_inclined_2d_ten_turn_normal_and_global_y_spring_coincide` fails before the fix:
degree 1 instead of 0. Both positive and negative `20π` pass after the fix, with degree 0,
isostatic classification and zero mechanism modes.

The angle is now reduced to `[0, 2π)` before constructing the diagnostic normal. The existing
`8 * f64::EPSILON * normal_scale` threshold remains unchanged and handles cardinal roundoff
after reduction. Existing near-cardinal and oblique direction-rank assertions remain enabled.
This counter changes only degree, classification and diagnosis. Solvability still comes from
input validation and stiffness rank; stiffness, loads, displacements, forces and reactions do
not change. There is no saved-solve result change to register and no demonstrated incorrect
engineering response requiring a safety advisory. This is an unreleased local correction.

## Curved-beam load review

The reported dropped-load regression is not reproducible at the reviewed head.
`expand_curved_beams_3d` clones the input, generates nodes and frame elements, and removes
resolved curved-beam definitions. It never changes the load vector. `CurvedBeamInput` has no
member ID for loads to address; original element loads must reference original frame elements.
Loads naming only a generated segment are refused during original-input validation. This is
covered through direct solving, the typed input boundary and load-session construction.

`issue_1780_loaded_curved_arch_matches_segments_direct_session_and_typed` compares all serialized
displacements, element forces and reactions exactly against the explicitly expanded model.
It passes both before and after the code change, for the original load, twice that load and zero
load, through the direct, prepared, session and typed paths. A separate control applies a load
to a generated segment after session preparation and confirms exact agreement with an explicit
segmented solve. The 2D direct/session/typed parity control also passes before and after.

The one-shot unconstrained 3D linear and buckling-preload callers now explicitly use
`prepared.input.loads`, so preparation and solving refer to the same model. Original-input
validation remains in preparation before expansion. Sessions continue using each supplied load
case on their immutable prepared model; substituting initial loads there would break their API.
There is no curved-beam expansion in the corresponding 2D preparation path.
