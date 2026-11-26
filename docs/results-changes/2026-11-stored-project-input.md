# Invalid saved project input

Project open refuses duplicate keys in stored structural tables before installing the snapshot. Duplicate node keys could silently change a member span and its calculated displacement. A repeated connector key could retain only the last connector. In a frame with two parallel axial connectors, the resulting analysis used the stiffness of the retained connector and omitted the other connector's contribution.

Project open also refuses any explicitly saved drawing plane outside XY, XZ and YZ. Earlier versions could ignore an invalid plane and still return a planar result. Compact share links preserve the supplied plane through decoding so it can be checked. An omitted plane still opens in XY for a planar project. The refusal applies before analysis begins.
