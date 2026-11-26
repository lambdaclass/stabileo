# Attached roof gaps and snow drift geometry

## Keep the deck geometry of attached roof gaps

A rafter can be rigidly linked to roof shells both above and below it. If two separate planes each bound a gap along that run, their projected gaps can coincide even though both decks need gravity loads. Panel gravity now stops and names the unresolved member when separate attachment offsets would require more than one certified gap transfer on its run. A single deck split into coplanar shell cells still transfers the full gap to the rafter once.

Exposure is evaluated over the certified gap footprint at the attached roof plane. The generated line load uses the rafter’s own stations. In the regression model the rafter is 40 mm below the attached plane and a canopy is 30 mm above it. Measured from the rafter the canopy cleared the planner’s 50 mm cover threshold, so the previous planner applied floor live load or refused partial cover. Measured from the roof plane the same gap remains exposed.

Regenerate affected panel gravity loads and rerun the analysis. Where generation stops for multiple contributing decks, specify their transfers separately.

## Use physical roof edges and elevations for snow drift

The modeled adjacent-roof corridor compares an intervening roof’s elevation with the receiving edge over the part it crosses. A canopy wholly below the receiver leaves the drift path clear. A roof at or above the receiver can still block the covered interval. For a corridor covered by a verified pitched plane, the check uses that plane. Clipping in coordinates aligned to the corridor avoids spurious intersections at shared seams under rotation. If the available roof geometry gives overlapping elevation ranges and cannot certify the obstruction, positive modeled drift geometry requires the existing transfer refusal.

Step detection uses the established 10 mm plan coincidence distance and samples both physical edges when they are slightly skewed. Fetch grouping requires [physically continuous roof edges](2026-11-certified-bearings-and-snow-gaps.md#use-continuous-fetch-and-check-clear-snow-drift-spans). A measurable parallel open gap still uses its measured separation for adjacent-roof drift. The 10 mm distance is for geometric matching. Bearing integration keeps its existing precision requirements and refuses unsupported transfers.

Regenerate affected snow loads and rerun the analysis.
