### BREAKING (results)

#### Use evaluated cages for CIRSOC 201 shear and torsion checks

- Fixed torsion reserves steel for the concurrent shear using the evaluated cage's concrete strength. Section verification refuses active torsion with unresolved secondary shear geometry, and an unresolved face governs member verification.
- Provided reinforcement checks use the code torsion threshold. Active wall torsion requires evidence of longitudinal reinforcement around the stirrup perimeter.
- Beam secondary shear can use a verified concrete-only capacity when the transverse reinforcement is not required for that demand. Column secondary shear uses the column spacing table. (#2171)
