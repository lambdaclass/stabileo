# Refuse automatic panel gravity at attached rafter gaps

When attached roof decks leave an opening along an offset rafter run, automatic panel gravity stops and reports the run's member IDs and the opening's horizontal stations in metres. The check uses the shell trace belonging to the attached deck. An apparent fill from a detached shell cannot make an opening eligible for automatic transfer.

The previous planner could assign a tributary line load to the gap and treat the same inferred strip as cover over lower members. In the #2295 fixture, the two modeled decks end at stations 4 m and 6 m across a 10 m projected run. Panel mode now publishes a blocked plan with no generated load rows. If an attached deck spans the run continuously, automatic loading still applies pressure to the modeled shell cells. A gravity plan using explicit member tributary widths still uses the entered width.

Resolve the opening by modeling the deck over it or assigning its loads explicitly. Regenerate affected stored panel gravity and snow loads before solving again.
