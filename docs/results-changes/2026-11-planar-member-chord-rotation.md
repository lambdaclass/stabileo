# Recover planar member forces from the chord rotation (2026-11-25)

PR #2567, review of issue #2560.

In the review model, a frame with reference chord (3, 4) stretches by (3, 4).
Its axis keeps the same direction. With axial rigidity 2 and an extension
equal to the reference length, the elastic axial force is 2. The transverse
end load of 2^54 has no axial component in the final member frame.
The review parent recovered 2.4 at the far end after projecting the
displacement through rounded reference direction cosines. The same
model recovered 2 on origin/main.

Planar arc-length, displacement-control and co-rotational recovery use
the dot and cross products of the reference and displaced chords to
rotate dead mechanical member actions. The products accumulate before
the rotation is normalized and rounded. If the represented inclined
support basis exactly matches the member basis, the displacement
transformation uses the corresponding chord components. This preserves
the alignment used in load assembly.

Recheck member end forces in saved planar nonlinear runs with member
loads. The affected part of recovery is the rotation of mechanical frame
loads into the final member axes.
