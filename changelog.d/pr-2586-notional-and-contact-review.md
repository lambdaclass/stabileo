### BREAKING (results)

#### Verify notional load sources before solving

Analysis checks each member and shell self-weight source before deriving notional loads. It also verifies each derived nodal action through case inclusion and combination factoring. A loss at a truss transfer cutoff or a changed nodal distribution stops the analysis. (#2586)

#### Accept conforming wall joints and tied gables

Spatial analysis accepts compatible skew wall–slab edges and point contact at a slab corner with declared compatibility. The seismic planner recognises a horizontal eave tie when each eave has one qualifying column. Planar analysis skips disabled self-weight rules. Regeneration notices use bounded roof gaps and compare generated line loads within effective cases. (#2586)
