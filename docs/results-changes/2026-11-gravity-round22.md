# Released torsion and rotated member couples

The shared spatial load validation now admits a doubly torsion-released member
only when its applied quadratic torque density has exactly zero resultant.
The resultant test sums the endpoint ordinates and four copies of the midpoint
ordinate using the existing exact rational accumulator. Nonzero resultants,
including arbitrarily small ones, remain refused with an equilibrium reason.
The release-condensation boundary also asserts a zero resultant before removing
both equivalent end torques. Balanced density integration makes those torques
exact opposites, avoiding a numerical residual from separate quadrature sums.
The member still retains its distributed couples for diagram recovery.

Spatial corotational recovery rotates each distributed-couple ordinate and each
concentrated-couple vector using the same reference-to-final-frame projection
as its recovered end actions. Concentrated torque metadata retains transverse
components after rotation; native and web diagrams and combinations carry them
through. The existing scalar `p` is the longitudinal component; optional `y`
and `z` components default to zero for older data. Linear and P–Delta reference
frames are unchanged. Plane member-couple input remains refused.

The native rigid-rotation witness checks rotations about each axis, both signs,
and zero rotation. Its longitudinal-axis rotation has a nonzero integrated
couple and the diagram agrees with the recovered end actions. Other rotations
use balanced densities so a prescribed nonequilibrium pose does not mix this
metadata check with dead-force moment equilibrium. A WASM cantilever with a
large twist and a transverse distributed couple verifies actual solved recovery.
Balanced and unbalanced release cases run through linear, P–Delta and
corotational solves in native and WASM entry points.

The earlier member-frame registry entry is restricted to spatial floor couples
on the same rolled, custom-axis or section-rotated carrier. Spatial combination
envelope extrema have their own entry that explains only envelope values.
An ordinary bridge displacement, reaction or member force cannot be explained
by either entry. Saved affected floor plans still require regeneration;
envelopes and corotational results require rerunning their analyses.

Both couple metadata fields and the distributed-member-couple input path are
absent on origin/main at 44d527d64933c07c8a812f04ad2373e4d83eb72c.
These changes repair the unmerged branch. No advisory is added or numbered.
No tolerance, baseline or assertion threshold is relaxed.
