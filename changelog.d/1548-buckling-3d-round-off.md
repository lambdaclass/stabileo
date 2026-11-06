### BREAKING (results)

#### 3D buckling refuses a model whose only compression is round-off (2026-11-06)

3D buckling took the round-off axial force of an uncompressed member for compression, as 2D did before #959. On a cantilever loaded only across its length, that force moved with the model's orientation and load scale, and the analysis returned load factors from 1.49e-3 to 3.1e7, or refused, depending on the rotation (#1548). When every member's compression is within the round-off of its own elongation, 3D buckling and its certificate now refuse as not determinable, naming the largest compression, as 2D does. A model with a resolved compression anywhere gives the same factors.
