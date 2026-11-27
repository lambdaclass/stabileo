# Warp containment for flat quads

The MITC4 and MITC9 warp checks now read the same corner and midside node
records as stiffness assembly. A direct 3D input can use labels for its node
map keys. Previously the solver connected shells by numeric node ID while
the check looked up those IDs as map keys. A missing key skipped the twist
measurement and could also trigger a panic during MITC4 distortion recovery.
The existing #1057 twist times thickness bands still govern warnings and
refusals for both families.

Basic 2D and Basic 3D now refuse a model with shell elements. Open it in PRO
to include shell stiffness. Direct 2D solver payloads also refuse nonempty
shell maps and lists. Plane inputs with empty shell collections still solve.
On main at `b78c25769`, a frame with a drawn warped quad returned a
Basic 3D frame result with the quad omitted. A direct 2D payload with a
nonempty quad map was accepted as the frame alone. The same drawn quad was
already refused by PRO with the usual numeric node keys.

The seven-storey building regression also reproduced the omission on main.
Basic 3D passed the global reaction balance after discarding all 189 meshed
slab quads. PRO included all 189, recovered their shell stresses, and
returned different displacements.

Re-run affected results with their full structural model. A flat quad within
the existing acceptance band still uses MITC4. An explicit curved quad uses
the curved formulation. The change adds coverage for the checks and leaves
the stiffness and recovery formulas intact.
