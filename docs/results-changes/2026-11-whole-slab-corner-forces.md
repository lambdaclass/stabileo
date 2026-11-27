# Verify the force at every whole-slab cell corner

A whole-slab load now checks each cell corner against the consistent nodal force integrated from the floor-load definition and the cell geometry. Case reduction and inclusion factors carry those expected forces into each case. The same corner check applies when solver loads are factored for nonlinear combinations or direct analysis, and when the slab supplies gravity for notional loads.

For a unit square under a uniform downward pressure of 16 kN/m², each corner receives −4 kN. Alternating −3, −5, −3, −5 kN around the same square preserves the 16 kN downward resultant and both first moments. It changes the loads applied to the shell’s degrees of freedom and can change its bending response. Analysis stops when a corner force differs beyond the existing load-accounting roundoff bound. The diagnostic identifies the slab cell, node and component.
