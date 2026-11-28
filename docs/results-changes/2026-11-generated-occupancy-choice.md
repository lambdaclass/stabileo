# Verify occupancies used in generated floor and roof loads

In an integration build, opening the regulation load generator could replace an unavailable saved floor or roof occupancy with the first row of the current table. Applying the plan could then generate live loads for that replacement. Main preserved the saved choice.

The editor now displays the unavailable row and the plan blocks until the operator chooses a supported occupancy. For a previously generated plan, check the floor and roof occupancies against the project's intended use. If either was replaced, select the documented use, regenerate the loads with replacement, and rerun the affected analyses.

A saved load basis identifies the row used but cannot distinguish an intentional choice of the first row from an automatic replacement. The recheck notice therefore includes both. Appending loads or solving again preserves the notice while potentially affected loads remain.
