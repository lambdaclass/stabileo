### BREAKING (results)

#### Refuse omitted plates and hanging wall–slab nodes in PRO (#2368, #2376, #2388)

Analysis stops and names invalid physical plates or wall–slab junctions with unshared edge nodes. The mesh generator requires every outline and hole field to be valid before Apply is enabled. The seven-storey gallery example has a conforming slab mesh at the core, which changes its displacements and internal forces.
