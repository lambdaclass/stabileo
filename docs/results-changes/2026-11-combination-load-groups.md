# Saved combination rules respect load groups

A saved combination term could apply its factor to every load case of the same symbol. A term intended for roof live load could therefore include floor live load, and a rule with separate floor and roof factors could apply both factors to both cases. Rule templates also lost the group when imported.

The Loads tab and load-plan preview and Apply now use the same selection by load symbol and group. An ungrouped term takes the remaining cases of its symbol. A rule with no named groups still takes all cases of its symbol. An active term whose group cannot be resolved blocks generation before any loads or combinations are written.

The regression model has downward floor and roof loads of 3 and 5 kN. A roof-only rule with a factor of 2 previously yielded a 16 kN vertical reaction instead of 10 kN. This changed the 2D and 3D linear results and their envelopes, along with 3D second-order and direct analysis results. The inputs and expected reaction come from the test model.

Review and regenerate combinations previously created from grouped rules, including combinations written as composite cases, then rerun the analyses and envelopes. Concrete case-ID factors already saved to a project do not change when the project is opened.
