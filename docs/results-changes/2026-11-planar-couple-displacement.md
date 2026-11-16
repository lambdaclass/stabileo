# Planar displacement recovery retains concentrated couples (2026-11-15)

Registry entry `planar-couple-displacement`, review #2099 round 8.

The diagram game reduced member point loads to distance and transverse force,
dropping their concentrated moments. The shared TypeScript displacement helper
also accepted only those two fields. Nodal rotations alone reconstruct a cubic;
a member couple requires a jump in curvature inside the element. A cubic can
agree with every nodal value and still give the wrong displacement between nodes.

Recovery now accepts the engine's complete point-load type. The game passes
that array directly. The shared recovery adds the derivative, with respect to
load position, of the fixed-fixed point-force Green function, multiplied by the
couple. Its end curvatures also enter the existing release correction. Sampled
2D curves share this couple recovery with point queries. When WASM is ready,
its existing force-load curve receives the helper’s couple-only correction
by linear superposition; the force-only export cannot silently discard the
moment. This also preserves its nonuniform distributed-load solution. Without
WASM the helper evaluates the whole curve as before.

The tests derive independent displacement fields by integrating curvature.
For the cantilever witness, with couple C at a and constant EI,

    v(x) = C [x² - max(x-a, 0)²] / (2 EI).

It has continuous displacement and slope and a curvature jump of -C/EI.
The game tests compare the complete trace and its normalized shape, not only
the tip. Further tests cover signed and combined loads, couples at and near
both ends, fixed and released endpoints, and sampled versus point recovery
with WASM ready and unavailable. Existing force-load and rigid-motion controls
remain enabled. No tolerance or frozen result was changed.

This changes reconstructed 2D displacement curves, hover values and game
answers that consume the shared helper. It does not change the solver's nodal
results, force recovery, native Rust implementation or the separate 3D
recovery. The game has only a planar linear solve entry. Existing nonlinear
callers that request load-free interpolation keep that behavior.

The same missing couple term is present in origin/main's TypeScript helper.
A direct test against origin/main returns zero at an interior station of a
fixed-fixed member where the integrated solution is nonzero, without a helper
warning or refusal. This evidence is recorded in the handoff for the
coordinator's advisory decision; no advisory is assigned here. Reopen affected
models to redraw their recovered displacement fields.
