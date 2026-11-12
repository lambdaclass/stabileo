# Nonlinear support and soil convergence checks admissible equilibrium (2026-11-11)

PR #1940, issue #761, second review. Restrained-to-restrained forces do no work
on free DOFs. The branch used their norm to scale a free residual, so a direct
support reaction could make an unsolved transverse load appear converged. The
material Newton loop could accept that state before its first solve. The shared
metric now accepts a support-pattern factor, never a reaction vector. A nonzero
admissible external load always provides its own reference. With no such load,
the reference is the norm of the support-to-free elastic coupling forces, grouped
by support node before taking their combined norm. Opposite support motions can
balance at a free node without erasing the reference. Direct restrained reactions
cannot enter it. Material increments with prescribed motion require a Newton
solve before acceptance. No requested convergence tolerance is changed.

The geometric scale is the maximum distance from the arithmetic centroid. Points
are ordered geometrically for reproducible summation independent of node labels.
Every coordinate and DOF scale must be finite. A coincident model with a single
active dimension category uses a unit scale that cancels from its relative
metrics. Mixed translations and rotations use the square root of the ratio of
physical rotational and translational stiffness traces. Artificial stabilization
cannot supply that scale. A missing physical scale is refused. Point models with
free warping and no physical length are refused. P-Delta increments include the
prescribed support displacement scale, and the shared spatial displacement-vector
conversion includes warping in both linear audits and the P-Delta initial state.

Both path-following solvers test the admissible constrained reference norm.
A load acting only through an eliminated constrained DOF is rejected as a zero
reference. Arc-length uses that same physical norm for its load-factor term;
this can change the path sampled by a given numerical step, especially for
moment patterns and constraints. There is no load-vector roundoff clearing.
After the first review's compensated projection, rotated nominal support-only
patterns can contain a small real free component in their represented input.
Accepted paths are checked against that represented free load; a large load
factor alone does not establish fabricated equilibrium. Inclined displacement
control retains its existing explicit refusal.

Nonlinear SSI in both dimensions shares one relative secant-stiffness comparison,
without the former dimensional floor of one. Equal zero stiffnesses have zero
change; a transition between zero and nonzero stiffness cannot converge by that
comparison. Before acceptance, the shared physical metric also checks equilibrium
with the newly evaluated soil-curve secants. A previous secant solve alone is
insufficient. Under small force units, the old floor could declare convergence
with a substantial free force imbalance. Re-run SSI results, including direct
native and WASM inputs; stored models are flagged conservatively by analysis type.

Material yield utilization in both dimensions shares a capacity ratio with no
absolute positive-capacity floor. Fixed-stiffness beams with scaled transverse
loads and capacities remain numerically solvable below the old force floors;
the tests require yielding to remain active, an unfinished second iteration to
remain unconverged, and the completed secant answer to agree with the expected
stiffness reduction. Elastic controls keep their linear answers. This does not
change the secant material model or its existing treatment of nonpositive limits.

Regression coverage includes the review's settlement and transverse-load model,
coincident connectors and single-node springs, eliminated reference loads,
symmetric opposing settlements, warping-only torsion, actual nonlinear soil
springs, yielding fibers and material members, rotations, mirrors, unit changes,
non-finite data, zero limits and both sides of convergence tolerances. Native and
actual WASM calls use the same serialized witnesses. Extreme stiffness rescalings
that already fail a factorization remain explicit refusals; fixed-stiffness
witnesses separately exercise post-step yielding below the old force floors.

Re-check convergence status, load factors, iteration counts, displacements,
reactions, member forces and dependent design results. No advisory number is
assigned here; origin/main evidence is recorded in the worktree handoff for the
coordinator's assessment.
