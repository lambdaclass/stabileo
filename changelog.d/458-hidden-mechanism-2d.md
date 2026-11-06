### BREAKING (results)

#### 2D: a mechanism hidden behind a rigid link or diaphragm is refused, not solved and certified (2026-11-03)

A 2D rigid link with no DOFs listed (which ties rotation) or a diaphragm, from a node whose members are all hinged to a node that only the constraint holds in rotation (a truss end), is a mechanism: the linked pair turns about the hinge. The 2D solver gave the slave's rotation the all-hinged artificial spring, the constraint turned it into a real spring on the mechanism, and the model solved to meaningless displacements (3.99e5 m in the test case, flagged as excessive) that the assembled-level certificate certified (#458). Such a model is now singular and refused on every 2D path. Models where something real holds the pair are unchanged. The 3D case of #458 (a rotation unstiffened about a skew axis) is not part of this fix.
