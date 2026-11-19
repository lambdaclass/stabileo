### Fixed

#### Preserve loads and coordinate conventions across replay and workbook exchange (#2364)

- Preserve partial distributed load spans and thermal load cases when replaying fixtures. Show existing axial distributed loads when the global axes switch is off.
- Use the export frame for workbook reactions, displacements and their extrema. Convert declared flat support components and refuse out-of-plane supports, unresolved load cases and incompatible standalone gravity rules.
- Distinguish transverse translation from normal rotation in the stiffness wizard. Preserve spatial coordinates in framed model-code fragments.
