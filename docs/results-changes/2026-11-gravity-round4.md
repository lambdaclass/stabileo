# Gravity torque recovery, projection and carrier geometry

PR #2219 round 4 corrects the unmerged branch at `ddbd4e06b`. The
assigned SA-2026-079 and SA-2026-080 remain the gravity advisories; this record
allocates no new advisory or historical release exposure.

Concentrated member torques now retain their physical stations when cut members
are reassembled. The result carries `pointTorques`, with positions and signed
couples, alongside `memberMoments`. Rust native and WASM diagram recovery and
the TypeScript evaluator add the concentrated steps to the distributed integral.
Diagram sampling includes each jump and both neighbouring stations. Typed output,
serialization, combinations and unit transformations preserve this information.
Web result combinations scale and sum both moment-density profiles and concentrated
torque steps, including negative and zero factors.
Existing piecewise results continue to evaluate on their physical pieces.

For a fixed-ended beam of length L with a couple C at a, torsional compatibility
gives T(0) = -C(L-a)/L. Equilibrium gives T(x) = T(0) + C for x > a.
Thus C = -0.5, a = 1.5 and L = 6 gives 0.375 before the couple and -0.125
after it. A uniform torque density q adds q(x-L/2). The same jump remains when
a bending-only moment density is present. Tests compare the endpoints and
stations on both sides in linear, P–Delta and corotational native results,
and in linear and P–Delta WASM results and both diagram implementations.

Force and moment densities now share one frame conversion. A projected global
component k is multiplied by sqrt(1-ex[k]^2) before resolution into local axes.
The frame-edit operation calls this same conversion. On the sloped fixture with
one horizontal unit and one vertical unit, a unit projected component about
X integrates to one unit of moment over the member, rather than sqrt(2).
Tests also check unprojected controls, both handedness conventions, each component,
frame round trips, and torque and midpoint twist against compatibility.

Carrier collinearity now requires both endpoints of the shorter segment on the longer supporting line,
within the existing floating-point positional bound. Floor contour grouping
and generic carrier grouping share that predicate. Extended groups retain the
actual extreme endpoints; they do not reconstruct shared vertices arithmetically.
Distance bisectors at a shared endpoint use that endpoint as their origin and
the sum of the unit directions, avoiding cancellation between almost equal
normals. Exact orientation signs choose the convex path; even a tiny concave
kink must use the path that enforces carrier projection limits. Coverage checks compare area and
both first moments and refuse a deficient partition. No tolerance is relaxed.

The six-vertex review fixture uses epsilon = 1e-7. Its bottom first carrier has
tributary depth d(x) bounded by the left-side bisector d=x, the opposing-line
bisector d=(1+epsilon-epsilon*x)/(1+sqrt(1+epsilon^2)), and the adjacent-side
bisector x=1-r*d with r=epsilon/(sqrt(1+epsilon^2)+1). The resulting three
linear intervals give member force density -d and torque density -d^2/2.
The regression integrates these polynomials independently. Fixed-end reactions
follow from zero end rotation and displacement; interior curvature and torsional
compatibility give deflection and twist. Floor and generic-region paths are checked
at member stations under rotations, mirrors and unequal subdivision. The existing
rectangle tests independently check all four carriers. Positive and negative
near-collinearity perturbations and exactly collinear controls also check area,
first moments and carrier profiles.

Regenerate affected floor and area loading, then rerun analyses, combinations,
diagrams and checks. Re-solving saved generated loading does not repair its
partition. Every applicable floor correction notice now compares its introduction
version with the stored floor-load generation version, including orphaned shares;
re-solving alone cannot clear it. Current regenerated loading clears the notice.
The previous round-3 short-span mitigation and the separately ignored
engine issue #2222 are unchanged by this round.
