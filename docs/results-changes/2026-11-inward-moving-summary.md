# Inward faces in planar moving-load summaries

Results-change entry `inward-moving-summary` for PR #2581.

Planar moving-load member summaries now reduce the signed envelope
bounds on the inward face of each member end and on both sides of any
interior jump. A stationary point force applied at a fixed end can
appear on the exterior face even though the support carries the force
directly. Including that face in the member summary could make the
exterior force govern.

The regression adds a 10 kN downward point force at the I support of
a fixed-ended member and sweeps a 4 kN downward axle. The axle's
interior approach gives shear limits of +4 kN at I and −4 kN at J.
The paired envelope retains the exterior I ordinate of −10 kN.
The axle merge retains the cut marker even when the two face bounds
become equal.

The paired payload is exercised at the branch's browser envelope
boundary. The checked-in WASM producer canonicalizes endpoint cuts,
and the browser's train-only sweep strips stationary loads.
