# Gravity member frames and envelope extrema

The gravity planner now uses the local axes returned by the floor-load calculation
when converting local member moments and concentrated loads to global components.
The producer resolves each member's custom local Y, roll and section rotation once;
both force and moment generation use that same frame. The planner also preserves
orientation metadata when building floor carriers. It no longer reconstructs a
default frame at either conversion boundary. Incomplete or non-finite custom
local-Y metadata is refused at the shared frame boundary rather than being
interpreted differently by force and moment generation.

The frame-conversion witness is a parallelogram with vertices (0,0), (6,2),
(6,6), (0,4), loaded at unit intensity in one-way global Y spanning. Each long
carrier receives two units of vertical tributary depth. Its lower carrier has
length sqrt(40), downward line loading 12/sqrt(40), and global distributed couple
(-12/sqrt(40),0,0). Its local torque density is -1.8. A local floor-load response
with a rolled or custom frame previously acquired spurious global couple
components when the planner interpreted it using default axes. The previous
planner also discarded orientation metadata before calling the floor generator;
for ordinary calls these two default-frame assumptions masked one another. The
regression exercises the conversion boundary with valid oriented floor output,
as well as complete generation and member-response paths.

Spatial envelopes now consume the same evaluated samples as spatial diagrams.
They retain all locally evaluated values, including multiple extrema with the
same representable normalized coordinate. Other cases are evaluated at the union
of sampling stations. Every retained or evaluated value still passes the finite
value guard before it contributes to the envelope.

The envelope witness uses a moment-density span of width 2^-32 starting at 0.5
on a member of length 2. Its density ordinates, multiplied by the span width,
are [1,-0.5,1]. Integration in the span's own coordinate u gives
u - 3u² + 2u³, with extrema ±sqrt(3)/18. Re-evaluating at the rounded global
station loses part of those extrema. Native and WASM tests cover both bending
axes and torsion, both signs, and ordinary-span controls.

Carrier tests compare per-member force and couple distributions with the hand
solution at rolls 0, 30 and 90 degrees, with custom axes, rotation, mirroring
and subdivision. Linear and P–Delta WASM tests check member shear, bending,
torsion, vertical deflection and twist. No numerical tolerance, load-support
limit, refusal, assertion or baseline was relaxed.

The diagrid CI failure on c9f28725f was a timeout in the physical-region test.
The mechanism messages in that log belonged to expected shed refusal tests.
Region-to-side transfer now constructs and orders each interval's polygon
chords once and reuses them for force endpoints and couple ordinates, preserving
the original arithmetic and physical partition. The test's existing timeout and
assertions remain unchanged.

Regenerate affected gravity plans and rerun analyses, envelopes and dependent
design checks. The new local member-density representation and this conversion
boundary exist only on the unmerged branch; no advisory is added or numbered.
