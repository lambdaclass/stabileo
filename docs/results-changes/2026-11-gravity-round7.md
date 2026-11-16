# Gravity density extrema and finite carrier intervals

PR #2219 round 7 corrects the unmerged density feature and its geometry integration.
It does not assign a new safety advisory.

The Rust and TypeScript diagram paths each use one station builder for plane and
spatial diagrams. It includes the regular grid, concentrated-load sides, all
force and moment density endpoints, and critical points of each polynomial piece.
The spatial canvas also includes stations within collapsed variable-member pieces.
A cantilever of fixture length 100 with torque densities +1 on [1,2] and -1 on
[2,3] has zero end torque and an interior peak of 1 at x=2. Its reported extrema
now retain that peak. Sign reversal, quadratic densities and bending axes are
covered through native and WASM linear and P–Delta solves.

Carrier grouping stores the union of the actual member projection intervals.
A gap cannot compete for ownership as a fictitious carrier. The notched panel
(0,0), (10,0), (10,10), (7,10), (5,9), (3,10), (0,10) retains its full area 98.
A small region near (5,8.9) reaches its actual vertical carriers as force and
eccentric moment densities. Per-carrier profile and cantilever shear, bending,
torsion, deflection and twist checks cover rotation, reflection and subdivision.

Adjacent geometric moment pieces that represent the same quadratic within the
existing profile arithmetic roundoff coalesce before member-coordinate conversion.
This avoids converting artificial sub-ulp splits into collapsed supports.
Coalescence checks all three defining ordinates of both original polynomials.
Distinct density changes retain their intervals, and unsupported physical spans
still refuse. Endpoint mapping uses the solver member length and avoids an
extra normalization when the source and member lengths already agree.

Moment refusals in plane solves and on trusses now use typed errors recognized
by the localized solve refusal channel. All supported languages carry the keys.
The snow control checks each carrier's aggregate emitted load against the full
layout share, so absence of an exact individual fragment cannot excuse lost load.

Regenerate affected generated gravity and floor loading, then rerun analyses,
diagrams, combinations and checks. Unmerged density sampling failures do not
establish a released exposure. Existing main-line point-station exposure is
recorded separately in the worktree handoff for the coordinator.
