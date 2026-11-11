# Frozen surface final-geometry validation, superseded (2026-11-10)

PR #1921 final review; issues #432 and #417. Results-change entry `frozen-surface-final-state`.

The contact correction recorded here was introduced in `4b88059be` and superseded by
`5103f27d7`. The cable and replay changes below remain applicable. For the current contact
behavior, see [assembled spring traction](2026-11-frozen-surface-assembled-traction.md).

The superseded check used the final signed geometric gap for both opening and force divided
by stiffness: `gap - lambda / stiffness` for an active AL pair, `gap` for an active penalty
pair, and zero force for an inactive pair. It accepted the rotating-master fixture as closed
and compressive with `converged=false`. That acceptance was wrong: the final geometric gap
can indicate compression while the spring in the actual final assembly carries tension.

Current validation checks the signed spring traction from the actual final assembly, using
its normal and interpolation weights, the reference-position term and the AL multiplier.
The opening check still uses the final geometric gap. Reported normal force uses the same
assembled spring force. The contact tolerance and bearing, opening and no-tension conditions
are unchanged.

The regression attaches the upper master endpoint of the existing bearing fixture to a frame,
instead of fixing it, multiplies its slave tangential load by four and limits AL to two passes.
This rotating-master fixture now requires a structured `contact_state_invalid` refusal with
severity `error`, phase `node_to_surface` and slave node 2, withholding the result. The identical
assembled-force and rotating-master tests have been consolidated into
`nl_contact_review_rotating_master_cannot_hide_assembled_tension`. Fixed-master frozen and
unfrozen AL bearing controls still converge and retain their force and equilibrium assertions.

The web flexibility wizards caught and replaced the structured cable error with generic
stability errors. They now validate cable identity before entering their solve catches.
Direct analysis now refuses cable inputs before skipping unloaded combinations. Moving-load
sweeps now refuse cable inputs before opening a load session, instead of swallowing the cable
error at each position and returning an empty envelope with failed positions.

Executable SA-2026-059 replays now live in the web engine unit area. Deliberate failures proved
that both files are collected. They assert structured refusals without force payloads for every
unsupported documented route, including both teaching methods, direct analysis, dynamics,
creep, imperfections, influence lines and moving envelopes. They also assert the actual panel's
translated refusal and withheld result, and retain dedicated-solver slack and tensile equilibrium
controls. The tensile control applies the retained fixture's load upward and requires positive
cable force and frame-plus-cable axial force equal to the applied load at both ends.

The legacy cable-as-truss web test is replaced by the structured refusal contract. The axial
span regression preserves its truss/frame end-force and interior-force assertions and explicitly
requires cable refusal in linear and corotational analysis. Linear certificate fixture generators
now generate truss braces in place of cables, preserving random draw order and every original
certification count and bound. Separate cable variants require the structured refusal.

Provenance recognizes native cables as axial members and excludes gap/contact members from
frame-scoped claims. The cable/contact notice remains feature-scoped. Historical main silence
is already documented by SA-2026-059 and its retained evidence; no new advisory is introduced.
