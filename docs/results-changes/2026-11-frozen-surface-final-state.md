# Frozen surface contacts validate the final geometry (2026-11-10)

PR #1921 final review; issues #432 and #417. Results-change entry `frozen-surface-final-state`.

The frozen 2D surface check projected the final undamped positions onto the normal and
interpolation coordinate from the previous iterate, while computing opening on the final
geometry. A master segment that rotated in the final solve could therefore produce a different
signed force for validation than the final surface law. Validation now uses the final signed gap
for both opening and force divided by stiffness: `gap - lambda / stiffness` for an active AL
pair, `gap` for an active penalty pair, and zero force for an inactive pair. The existing
contact tolerance and every bearing/opening/no-tension condition are unchanged.

The regression attaches the upper master endpoint of the existing bearing fixture to a frame,
instead of fixing it, multiplies its slave tangential load by four and limits AL to two passes.
The master rotates in the final correction, demonstrated by the assembled reaction's tangential
component differing from the reported friction force on the final tangent. The previous check
refuses this state; the corrected check returns a closed compressive pair satisfying the final
geometric law. It retains `converged=false`: this is a validation regression, not a claim of an
equilibrated converged solution. Existing valid-bearing and invalid-state controls remain enforced.

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
