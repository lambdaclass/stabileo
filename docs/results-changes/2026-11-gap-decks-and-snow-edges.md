# Attached roof gaps

## Keep the deck geometry of attached roof gaps

A rafter can be rigidly linked to roof shells both above and below it. If two separate planes each bound a gap along that run, their projected gaps can coincide even though both decks need gravity loads. Panel gravity now stops and names the unresolved member when separate attachment offsets would require more than one certified gap transfer on its run. A single deck split into coplanar shell cells still transfers the full gap to the rafter once.

Exposure is evaluated over the certified gap footprint at the attached roof plane. The generated line load uses the rafter’s own stations. In the regression model the rafter is 40 mm below the attached plane and a canopy is 30 mm above it. Measured from the rafter the canopy cleared the planner’s 50 mm cover threshold, so the previous planner applied floor live load or refused partial cover. Measured from the roof plane the same gap remains exposed.

Regenerate affected panel gravity loads and rerun the analysis. Where generation stops for multiple contributing decks, specify their transfers separately.
