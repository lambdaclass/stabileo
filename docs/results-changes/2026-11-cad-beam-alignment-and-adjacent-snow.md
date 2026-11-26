# CAD beam alignment and adjacent-roof snow coverage

## Require aligned CAD wall and beam joints

CAD draft generation refuses a wall end that is within the configured CAD snap tolerance and off the beam trace. The message names the wall quad and the beam. An aligned wall joint can split a beam along its existing line. Beam segments within a conforming slab must match certified slab mesh edges before the draft can be generated. Regenerate affected CAD drafts and connect the wall end and beam in the drawing.

## Apply entered adjacent-roof drift on clear eave spans

The entered adjacent-roof surcharge is evaluated along the clear spans of the receiving eave. Projected overlap with modeled geometry excludes only the covered intervals, including short spans. The drift pressure calculation uses the existing inputs and equations. Regenerate affected snow cases and solve again.
