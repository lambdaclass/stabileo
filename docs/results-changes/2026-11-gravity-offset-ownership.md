# Block ambiguous gravity on attached shells and rafters

An upper horizontal shell within the storey headroom limit may be rigidly attached to an overlapping beam bay at matching plan stations. When the vertical separation exceeds the deck tolerance, panel gravity blocks before assigning separate loads to the shell and bay. The later ownership check extends the refusal to fully attached lower shells. [Lower shells and offset rafters](2026-11-gravity-lower-shell-and-shared-rafter.md)

For rafters connected to a loaded shell by rigid links that transfer vertical motion, a consistent offset can establish shell ownership through the existing coverage check. When at least two nearby vertical attachment stations overlap their linked shells but unequal offsets leave ownership unresolved, panel gravity blocks before assigning tributary width.

Regenerate automatic panel gravity in affected models. When the planner blocks, correct the attachment geometry or assign the area load once by hand.
