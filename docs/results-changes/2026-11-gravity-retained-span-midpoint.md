# Check retained deck spans and physical member midpoints

Automatic panel generation measures the narrowest plan width of each connected portion of a bay left after headroom trimming. Generation refuses if a retained portion exceeds the existing maximum deck span. A low shell over a corner can leave nearly the whole bay unsupported, and low framing can leave an oversized bay even after the loads carried above are accounted for. A retained portion within the limit remains eligible. The industrial hall example reaches this refusal in automatic panel mode.

Member exposure now compares the cover elevation at the plan midpoint with the actual member elevation at that midpoint. For endpoints at 3.0000 m and 3.0004 m, the midpoint is at 3.0002 m. A shell at 3.0503 m clears the 50 mm cover threshold there, so the covered member receives floor actions where separate floor and roof pressures are used. It also stops qualifying as a roof carrier for wind and selected-roof snow.

Regenerate affected automatic gravity, roof wind and snow loads before rerunning analyses and combinations. Where automatic panel generation refuses, model the supporting framing or assign and verify the loads explicitly.
