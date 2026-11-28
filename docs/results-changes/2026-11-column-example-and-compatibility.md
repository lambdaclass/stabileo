# Tie spacing in the public column example

The reinforced-concrete column example identifies its edition as CIRSOC 201-2025. Its elevation and spacing readout used 12 longitudinal-bar diameters as one of three limits. Article 25.7.2.1(b) specifies the least of 16 longitudinal-bar diameters, 48 tie diameters and the least column dimension. With the example’s 400 × 500 mm section, 20 mm longitudinal bars and 10 mm ties, the former spacing was 240 mm. The governing limit is 320 mm. The example now calls the same edition-specific rule as the detailing and verification paths. Check drawings or notes copied from the public example. Saved reinforcement designs use their original edition-specific rule. [CIRSOC 201-2025, Chapter 25](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-25-detalles-de-armado.md#c25.7.2.1)

## Global force balance in the compatibility lesson

The lesson used a display cutoff when assembling axial point loads. On a 4 m cantilever with two local axial point loads of 0.0000000005 kN each, at 1 m and 3 m from the support, the lesson returned a zero axial reaction. The reaction is −0.000000001 kN. The global-force row also appended a checkmark to every result, including that nonzero imbalance.

The lesson now accumulates every axial point load. It prints the checkmark only when both displayed force sums are zero after the existing rounding rule. A surviving force imbalance produces a warning. The joint force and moment residuals are checked separately. Rebuild previously copied compatibility worksheets for the affected cases. The production structural solver and its saved results use a separate assembly.
