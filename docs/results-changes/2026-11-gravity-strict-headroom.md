# Clip gravity strips at physical headroom limits

Automatic panel gravity checks the physical overlap between a standalone member's tributary strip and retained framing bays. In the regression model, a 6 m strip with a 1 m tributary width rises from 2.9996 m to 3.0004 m under a bay at 5.2003 m. The last 0.75 m of the strip has less than 2.2 m of headroom. The previous planner kept 6 m² because its probes missed that part. The corrected planner keeps 5.25 m².

When a noncoplanar beam bay has only height bounds, the entire overlap must lie strictly inside the headroom band before the planner removes all its load. For a bay with three corners at 0 m and one at 0.0004 m beneath a shell at 2.2 m, the bounds allow part of the bay to have exactly 2.2 m of clearance. The planner blocks generation because the amount of low-headroom area is unresolved.

Regenerate affected automatic panel gravity and roof snow loads, then rerun analyses and combinations. Where the planner reports an indeterminate deck height, define a planar deck or assign the loads explicitly.
