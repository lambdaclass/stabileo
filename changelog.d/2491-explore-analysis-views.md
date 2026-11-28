### BREAKING (results)

#### Preserve twist in Explore and retire stale analysis views

Explore preserves torsional stiffness when changing bending inertia, includes conservative bounds for nested spatial force combinations, and checks the resolved joint before moving a support. Editing thermal expansion clears the displayed diagram. Missing load cases return to the labeled all-loads view, and refused named envelopes withhold their diagrams until another envelope is selected. A refused settlement case withholds combinations that depend on it while independently solved combinations remain available. Advanced analysis options follow the displayed result. (#2491)
