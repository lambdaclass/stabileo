### BREAKING (results)

#### Preserve spatial distributed loads on member reversal and refuse unplaceable planar point loads

Reversing a member now preserves the direction and endpoint profile of its distributed loads. Spatial analysis stops if a legacy planar point force or couple sits on a member with no usable projection in the load plane. Review the loads on previously reversed members and replace any refused planar point loads with explicitly oriented spatial loads before rerunning analysis. See [the results changes](../docs/results-changes/2026-11-member-load-orientation.md). (#2268, #2411)
