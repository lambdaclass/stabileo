### BREAKING (results)

#### Cutting a 3D model to 2D refuses the cuts the plane solver would get wrong (2026-11-02)

A cut or projection on the Y–Z or X–Y plane is now refused in two cases: a constraint in the cut would be read as if the model stood in X–Z (#466), or a frame member bends in that plane about another section axis than the 2D solver uses (#1238). An I-section portal standing in Y–Z came out about 13 times too stiff. X–Z cuts, and cuts whose constraints and members mean the same on their plane, are unchanged. Re-check 2D results taken from Y–Z or X–Y cuts of models with I or rectangular members, or with constraints.
