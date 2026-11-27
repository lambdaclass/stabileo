# Recheck the thermal coefficient of ungraded materials

Recalculate members and shells with a temperature load if their material has neither a declared expansion coefficient nor a known family. A saved elastic modulus alone could previously identify hand-entered glass as aluminium. The solver now receives an omitted coefficient and reports its default assumption. Enter the material's measured coefficient to use it for both free expansion and thermal curvature.

For the regression's 4 m member under a uniform 20 °C rise, the previous aluminium assignment of 23 × 10⁻⁶ /°C gives 0.00184 m of free expansion. The engine's reported assumption of 12 × 10⁻⁶ /°C gives 0.00096 m. A declared coefficient of 9 × 10⁻⁶ /°C instead gives 0.00072 m by αΔTL. A prescribed strain alone is independent of α.

Second-order member solves now carry the same coefficient and section-depth assumption diagnostics as their linear input.

A separate material import defect could discard the properties of the first workbook or generated material when its name and modulus matched the automatic seed. Reimport the original source to recover those values. For projects edited after import, compare the stored material against the source before recalculating. Assigning a profile now preserves an ungraded material unless its record explicitly identifies it as automatic.


## Thermal portal snapshot

The fixture heats member 2 between (0, 4) and (5, 4) m. Its ungraded material has no α. The former modulus lookup selected the concrete value in FAMILY_ALPHA. The new path reports the engine assumption. Free extension αΔTL changes from 10 × 10⁻⁶ × 30 × 5 = 0.0015 m to 12 × 10⁻⁶ × 30 × 5 = 0.0018 m. Free curvature αΔT/h likewise changes from 0.00020 to 0.00024 m⁻¹ for its 10 °C gradient and 0.5 m depth. With fixed supports and unchanged stiffness, linearity predicts a factor of 1.2 for every response. Independently, the new restrained beam extension from the nodal translations is 0.001795769348 m. Subtracting the free extension and multiplying by EA/L (30,000,000 × 0.1 / 5 kN/m) gives −2.53839 kN, the reported compression.

| Field | Previous | Regenerated | Hand check (previous × 1.2) | Reason |
| --- | ---: | ---: | ---: | --- |
| `base.diagnosticCodes` | warning:known_issue | warning:known_issue warning:thermal_default_assumed | — | Solver reports the omitted coefficient |
| `base.displacements[n2].ry` | -0.0002420453077 | -0.0002904543693 | -0.00029045436924 | Restrained thermal motion |
| `base.displacements[n2].ux` | -7.303224656e-05 | -8.763869587e-05 | -8.7638695872e-05 | Restrained thermal motion |
| `base.displacements[n2].uz` | 8.90458478e-07 | 1.068550174e-06 | 1.0685501736e-06 | Restrained thermal motion |
| `base.displacements[n3].ry` | 0.0002012623094 | 0.0002415147713 | 0.00024151477128 | Restrained thermal motion |
| `base.displacements[n3].ux` | 0.00142344221 | 0.001708130652 | 0.001708130652 | Restrained thermal motion |
| `base.displacements[n3].uz` | -8.90458478e-07 | -1.068550174e-06 | -1.0685501736e-06 | Restrained thermal motion |
| `base.displacements[n4].ry` | -0.0006344219836 | -0.0007613063803 | -0.00076130638032 | Restrained thermal motion |
| `base.elementForces[e1].mEnd` | -5.456006104 | -6.547207325 | -6.5472073248 | Member equilibrium and compatibility |
| `base.elementForces[e1].mStart` | 3.005297363 | 3.606356836 | 3.6063568356 | Member equilibrium and compatibility |
| `base.elementForces[e1].nEnd` | 0.6010594726 | 0.7212713671 | 0.72127136712 | Member equilibrium and compatibility |
| `base.elementForces[e1].nStart` | 0.6010594726 | 0.7212713671 | 0.72127136712 | Member equilibrium and compatibility |
| `base.elementForces[e1].vEnd` | 2.115325867 | 2.53839104 | 2.5383910404 | Member equilibrium and compatibility |
| `base.elementForces[e1].vStart` | 2.115325867 | 2.53839104 | 2.5383910404 | Member equilibrium and compatibility |
| `base.elementForces[e2].mEnd` | 8.461303467 | 10.15356416 | 10.15356416 | Member equilibrium and compatibility |
| `base.elementForces[e2].mStart` | 5.456006104 | 6.547207325 | 6.5472073248 | Member equilibrium and compatibility |
| `base.elementForces[e2].nEnd` | -2.115325867 | -2.53839104 | -2.5383910404 | Member equilibrium and compatibility |
| `base.elementForces[e2].nStart` | -2.115325867 | -2.53839104 | -2.5383910404 | Member equilibrium and compatibility |
| `base.elementForces[e2].vEnd` | -0.6010594726 | -0.7212713671 | -0.72127136712 | Member equilibrium and compatibility |
| `base.elementForces[e2].vStart` | -0.6010594726 | -0.7212713671 | -0.72127136712 | Member equilibrium and compatibility |
| `base.elementForces[e3].mEnd` | 8.461303467 | 10.15356416 | 10.15356416 | Member equilibrium and compatibility |
| `base.elementForces[e3].nEnd` | -0.6010594726 | -0.7212713671 | -0.72127136712 | Member equilibrium and compatibility |
| `base.elementForces[e3].nStart` | -0.6010594726 | -0.7212713671 | -0.72127136712 | Member equilibrium and compatibility |
| `base.elementForces[e3].vEnd` | -2.115325867 | -2.53839104 | -2.5383910404 | Member equilibrium and compatibility |
| `base.elementForces[e3].vStart` | -2.115325867 | -2.53839104 | -2.5383910404 | Member equilibrium and compatibility |
| `base.equilibrium.reactionForceSum[2]` | -3.005297363 | -3.606356836 | -3.6063568356 | Support equilibrium |
| `base.reactions[n1].my` | -3.005297363 | -3.606356836 | -3.6063568356 | Support equilibrium |
| `base.reactions[n1].rx` | 2.115325867 | 2.53839104 | 2.5383910404 | Support equilibrium |
| `base.reactions[n1].rz` | -0.6010594726 | -0.7212713671 | -0.72127136712 | Support equilibrium |
| `base.reactions[n4].rx` | -2.115325867 | -2.53839104 | -2.5383910404 | Support equilibrium |
| `base.reactions[n4].rz` | 0.6010594726 | 0.7212713671 | 0.72127136712 | Support equilibrium |
| `base.resultSummary.displacementResultant.maxValue` | 0.001423442489 | 0.001708130987 | 0.0017081309868 | Extremum of the scaled response |
| `base.resultSummary.displacementX.maxValue` | 0.00142344221 | 0.001708130652 | 0.001708130652 | Extremum of the scaled response |
| `base.resultSummary.displacementX.minValue` | -7.303224656e-05 | -8.763869587e-05 | -8.7638695872e-05 | Extremum of the scaled response |
| `base.resultSummary.displacementZ.maxValue` | 8.90458478e-07 | 1.068550174e-06 | 1.0685501736e-06 | Extremum of the scaled response |
| `base.resultSummary.displacementZ.minValue` | -8.90458478e-07 | -1.068550174e-06 | -1.0685501736e-06 | Extremum of the scaled response |
| `base.resultSummary.reactionResultant.maxValue` | 2.19906253 | 2.638875036 | 2.638875036 | Extremum of the scaled response |
| `base.resultSummary.reactionResultant.minValue` | 2.19906253 | 2.638875036 | 2.638875036 | Extremum of the scaled response |
| `base.resultSummary.rotation.maxValue` | 0.0002012623094 | 0.0002415147713 | 0.00024151477128 | Extremum of the scaled response |
| `base.resultSummary.rotation.minValue` | -0.0006344219836 | -0.0007613063803 | -0.00076130638032 | Extremum of the scaled response |

## Workbook and material edits

A project workbook exported its explicit expansion coefficient, but import blocked a populated coefficient column. Import now accepts finite coefficients within the material form’s range, including zero and negative values. A 4 m free bar with a workbook coefficient of 9 × 10⁻⁶/°C and a 20 °C rise extends by 0.00072 m in both 2D and 3D, under linear and second-order analysis. Older workbooks can lack the grade and provenance columns, so review the assumption on ungraded materials. Changing a material's mechanical definition now replaces its former concrete and catalogue properties. Renaming the material or changing only its coefficient preserves those strengths.


## Reading axial colors and spatial combinations

A fixed-ended bar with a central 10 kN axial load has equal support reactions by symmetry. The axial diagram has a 10 kN jump at the load, giving +5 kN on one side and −5 kN on the other. Both the plane and space axial color views now identify the mixed member and show the signed extrema. A space ABS or SRSS combination stores unsigned magnitudes, so its axial color view reports that signed forces are unavailable.

For the ABS combination of section moment vectors (10, 10) and (10, −10) kN·m, the possible vector sums have magnitude 20 kN·m. The separate component envelopes are 20 and 20 kN·m, giving an upper bound of √800 kN·m. Explore explicitly labels that bound for moment and shear.
