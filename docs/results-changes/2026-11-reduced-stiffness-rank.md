# Refuse unresolved reduced stiffness rank (2026-11-25)

In #2266 and #2380, one planar frame is hinged at its fixed support. Its
free end can translate and rotate about the hinge without straining the
member. The applied loads act entirely on the restrained coordinates.
On origin/main at `363131079`, the original frames returned zero
displacements and the stability check reported Stable. Rescaling #2266
or rotating #2380 could instead cause a stiffness factorization refusal.

The stability check now propagates an entrywise rounding margin from the
reduced physical matrix into the basis used to assess stiffness. It
requires a positive factorization with that margin subtracted. The check
runs before a load residual can influence acceptance and uses stiffness
from the supports, springs, connectors and independent constraints
included in the analysis. Accepted solves use the same stiffness and
solution algorithms as before.

Recheck saved results that relied on an unresolved stiffness direction.
Affected models now return a rank diagnostic in the covered analyses.
A frame with an independent restraint, or with sufficient spring or
connector stiffness against the free motion, can still be solved.

The PR #2584 review extends the same entry to support-coordinate rounding,
unresolved constraint rank in material, modal and SSI preparations, and
corotational equilibrium. The support transformation carries the scale of
stiffness terms before cancellation, including terms involving a restrained
normal. Kinematic checks report the same refusal for an unresolved rank.
Corotational equilibrium is checked on the current reduced tangent,
including on native planar continuation. Tangents whose signed stiffness
cannot be resolved can now refuse even when the equilibrium residual is zero.
The checks do not change the assembled stiffness, loads, or residual tolerances.

The material nonlinear solver now requires a resolved physical tangent
before it accepts a zero-residual load increment. For example, a
horizontal truss with an unrestrained transverse tip previously reported
convergence under a load applied at the fixed end, although the transverse
displacement was undetermined. Adding independent transverse stiffness
restores the zero-displacement solution. Harmless released rotations are
still allowed.

The current corotational rank check uses both diagonal and off-diagonal
terms when scaling signed tangents. It checks the physical directions
after excluding verified rotation gauges in the current member frames.
An unresolved physical tangent still blocks convergence.

SSI checks the rank of the current structural and soil secant before
factoring it, including when a restrained load leaves a zero free residual.
A positive pivot within the assembly rounding margin now produces a rank
refusal. Resolved negative corotational stiffness can coexist with a verified
release gauge. The rank check in that case assesses the remaining physical
directions.

Modal analysis checks for a massive null translation and for unresolved
stiffness rank after validating mass and before computing modes. When the
mass and stiffness checks identify a specific null translation, the modal
refusal reports its node and dominant displacement component. Otherwise the
rank check can still refuse when assembly or constraint rounding leaves the
stiffness unresolved. Kinematics reports the unresolved rank and marks the
model unsolvable even if the rounded mode count is zero.

A restrained load on parallel trusses can leave the transverse displacement
undetermined. Repeated weak member contributions can bias a diagonal of the
assembled tangent and give the transverse mode an apparent stiffness. The
corotational check now includes a summation bound for each tangent entry and
carries that bound through inclined support and constraint transformations.
The solver refuses the unresolved equilibrium. Restraining the independent
transverse motion gives a resolved result.

SSI checks both the secant used for each solve and the secant evaluated at the
returned displacement. A loaded spring can begin with a resolved tangent and
enter a plateau where the remaining secant stiffness cannot be distinguished
from assembly roundoff. This can now give a refusal when the iteration budget
ends after that update.

Kinematics labels an unresolved elastic rank as indeterminate. The response
still blocks the elastic solve and retains the localized rank diagnosis.
The kinematic calculation reports its own solvability flag alongside the
mode count. Plastic limit analysis checks its existing uniform-stiffness
model for mechanisms and uses the same model to compute the equilibrium
fields for its collapse calculation.

## Refuse pinned axial pile mechanisms in SSI

The frozen SSI corpus includes two axial piles,
`solve_ssi_2d-c703b27bda5f4eb8.json` and
`solve_ssi_2d-169f627ba8e7f8cf.json`. Each is vertical, has a pinned
base, and has soil springs parallel to the pile axis. An infinitesimal rotation
about the base pin produces transverse displacement proportional to height
above the pin, zero axial strain and zero curvature. The axial soil springs
have zero displacement in that motion, so they provide no restraint against it.
Both models returned converged results with a NUM-INVARIANCE warning on
origin/main at `adf9de0ca`. Their frozen outputs now record the blocking
`reduced_stiffness_rank` diagnosis. The previous numerical outputs are in
`web/results-frozen/` at that revision. For each input, a transverse soil
spring above the pin restores a converged solve under the same axial load.

## C08 rank verdicts

The C08 fixtures for #973 and #1029 each have one member whose supported
end can rotate. In #973 the member is released at the fixed support. In #1029
the support is a pin and the member is released at the free tip. A rigid
rotation about the support has zero member strain in both fixtures. The
static rank verdict now classifies both as singular at assembly precision.
The replay checks the refusal from modal analysis for #973 and from the
no-foundation Winkler solve for #1029. The #1041 time-history replay uses
the #1029 model and shares its static rank verdict. Time integration keeps
its existing treatment of this model.

### Artificial rotational stiffness in nonlinear rank checks

The corotational and material nonlinear rank checks use the physical
stiffness before artificial rotational pins are added for factorization.
An offset rigid link can turn a rotation released by all incident beams
into a translation of the slave. That motion still needs physical
restraint. A coincident link can leave the same unloaded rotation as a
gauge, so the model can solve.

In the spatial material regression, a slightly skewed cantilever has a
tip torsion release. A second member joins two fully fixed nodes. Making
that member stiffer can increase the artificial pin derived from the
largest assembled diagonal. It cannot change the free stiffness at the
cantilever tip. The material rank check now accepts the same equilibrium
as the linear solve for both tested stiffnesses of the fixed member.

## Check SSI secant rank using physical stiffness

SSI now checks the unpinned structural and soil stiffness together. Both the
initial secant and the secant after each soil update must resolve the physical
motion, including after reduction by rigid links and other constraints.
Only verified rotation or warping gauges with no resolvable load work can
receive numerical regularization. Equilibrium, reactions and refinement use
physical stiffness and soil forces.

For example, a spatial beam released about its weak bending axis at its base
can sway without straining the beam. An artificial pin on its tip rotation
previously supplied rank and produced a finite displacement under transverse
load. The solver now refuses with `reduced_stiffness_rank`. Adding a transverse
soil spring at the tip restrains the sway. Its reaction balances the
transverse load, and the tip rotation follows the sway allowed by the hinge.
Recheck saved SSI results for models whose behavior depends on released or
weak rotational directions.
