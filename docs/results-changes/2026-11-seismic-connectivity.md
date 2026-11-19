# Static seismic loads require a single supported structure

PR #2316. 2026-11-19.

The static seismic planner checks that all geometry contributing seismic mass
or plan width belongs to one connected structure with a support. The same
component sets the datum and the plan widths. Member and shell boundaries and
rigid-floor diaphragm constraints provide connections. The diaphragm links
themselves add no width. Supports in the component must share an elevation.

The previous planner returned 8 kN of seismic weight and base shear for a
supported cantilever and an unattached quadrilateral shell under a manual
coefficient of 1. The same shell in its own supported structure also passed.
Both disconnected models now produce a refusal and no E cases. A disconnected
massless beam previously widened a two-column model from 4 m to 8 m. The
planner now refuses the detached beam and includes its width when attached.

A massless column connected to the seismic mass through a rigid floor can now
supply the datum. In the test model, the cantilever has a line weight of
2 kN/m over a height of 4 m. The planner accepts the datum at the connected
column's support and applies 2 kN/m over the upper 2 m of the cantilever at
a manual coefficient of 1. Unequal elevations at connected supports block
static load generation.

Regenerate affected E cases and repeat the analyses, combinations and design
checks that use them. A disconnected-structure refusal means the planner
cannot regenerate static seismic loads for that model.
