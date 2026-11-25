# Use physical clearance for automatic gravity

Automatic gravity now retains the physical surfaces of the beam bays and member strips that carry loads. Where framing establishes low roof headroom, the planner removes only the overlap that lies within the local clearance band. For example, a lower bay at 3.0004 m under a retained bay at 5.1998 m is below the 2.2 m headroom limit. The level labels of 3.000 m and 5.200 m previously hid that difference and left load on the lower bay. A strip that crosses the limit keeps only the part outside the low-clearance overlap.

For member exposure, pitched-shell height and bare-beam alignment use the exact midpoint of the member endpoints. A bare beam must pass through that point in plan to provide cover. If an upper beam bay has noncoplanar corners and its height range straddles the 50 mm cover threshold, automatic generation reports that it cannot determine the height and returns no loads. A bay whose entire height range is on one side of the threshold can still be classified.

The hip-roof snow snapshot records near-zero pressure and residual changes after clipping the framing strips against their physical height surfaces.

Regenerate affected automatic gravity, roof wind and snow loads, then rerun analyses and combinations. For a noncoplanar bay whose height cannot be determined, define a planar deck or assign the loads explicitly.
