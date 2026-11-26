# Resolve definite headroom and preserve rotated beam cover

Automatic gravity applies definite headroom clipping before deciding whether any remaining area has unresolved clearance. In the regression model, the shell at 1 m removes the entire lower bay from gravity loading. The clearance to the shell at the strict 2.2 m limit therefore does not affect any lower-bay load. Covering only half the bay still leaves unresolved clearance and blocks generation.

Beam cover preserves alignment through ordinary floating-point rotations. Both endpoints of the lower member must align with the upper beam within the existing coordinate roundoff bound to use a projected midpoint. The projected station must lie on the upper segment. A transverse crossing still requires the beam to pass through the exact midpoint, and the height comparison uses the exact midpoint in both cases. This preserves floor and roof classification for aligned members in rotated models.

Regenerate affected gravity, roof wind and snow loads, then rerun analyses and combinations.
