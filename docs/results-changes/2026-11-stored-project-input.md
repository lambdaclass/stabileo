# Invalid saved project input

Project open refuses duplicate connector keys before installing the snapshot. Previously a project file could retain only the last connector for a repeated key. In a frame with two parallel axial connectors, the resulting analysis used the stiffness of the retained connector and omitted the other connector's contribution.

Project open also refuses any explicitly saved drawing plane outside XY, XZ and YZ. Earlier versions could ignore an invalid plane and still return a planar result. Compact share links preserve the supplied plane through decoding so it can be checked. An omitted plane still opens in XY for a planar project. The refusal applies before analysis begins.
