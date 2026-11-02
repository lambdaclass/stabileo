### BREAKING (results)

#### Cutting a 3D model to 2D refuses the cuts the plane solver would get wrong (2026-11-02)

A cut or projection is now refused when the 2D model would not be the 3D one. On the Y–Z or X–Y plane: a constraint in the cut would be read as if the model stood in X–Z (#466), or a frame member bends in that plane about another section axis than the 2D solver uses (#1238). An I-section portal standing in Y–Z came out about 13 times too stiff. On any plane, X–Z included: a member whose section is turned so that its principal axes are skew to the plane couples in-plane and out-of-plane bending, which a 2D model cannot represent (#1238). Other X–Z cuts, and cuts whose constraints and members mean the same on their plane, are unchanged. Re-check 2D results taken from Y–Z or X–Y cuts of models with I or rectangular members or with constraints, and from cuts on any plane of members with turned sections.
