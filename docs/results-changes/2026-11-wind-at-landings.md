# Generated wind at intermediate levels

The building wind planner now partitions wall pressure at the elevations it already uses for the model's levels, including stair landings between the ends of a column. A pressure interval and an adjoining mesh can therefore use the same physical elevation. The wind pressure law, load interval limit and checks on the integrated pressure still apply.

In the party-wall gallery building the landing is at 7.2 m and the column starts at 5.8 m. The old generated interval began 1.3999999999999995 m from the column end. The mesh cut was 1.4000000000000004 m from the same end. Splitting generated a positive interval too short for analysis, and the solver refused it. With pressure integrated at the declared landing, the whole building completes its cases and combinations.

Regenerate previously generated wind loads and run the analysis again. Stored member loads keep the stations saved with them.
