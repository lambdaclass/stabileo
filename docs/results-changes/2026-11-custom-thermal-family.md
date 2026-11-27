# Recheck the thermal coefficient of ungraded materials

Recalculate members and shells with a temperature load if their material has neither a declared expansion coefficient nor a known family. A saved elastic modulus alone could previously identify hand-entered glass as aluminium. The solver now receives an omitted coefficient and reports its default assumption. Enter the material's measured coefficient to use it for both free expansion and thermal curvature.

For the regression's 4 m member under a uniform 20 °C rise, the previous aluminium assignment of 23 × 10⁻⁶ /°C gives 0.00184 m of free expansion. The engine's reported assumption of 12 × 10⁻⁶ /°C gives 0.00096 m. A declared coefficient of 9 × 10⁻⁶ /°C instead gives 0.00072 m by αΔTL. A prescribed strain alone is independent of α.

Second-order member solves now carry the same coefficient and section-depth assumption diagnostics as their linear input.

A separate material import defect could discard the properties of the first workbook or generated material when its name and modulus matched the automatic seed. Reimport the original source to recover those values. For projects edited after import, compare the stored material against the source before recalculating. Assigning a profile now preserves an ungraded material unless its record explicitly identifies it as automatic.
