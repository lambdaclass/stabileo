# Machine bend diameter for large reinforcement bars

The released BVBS listings writer classified every longitudinal bar above 25 mm in its 8db tier. An issued Ø40 longitudinal mark therefore produced a machine file with `@d40` and `@s320`. CIRSOC 201-2025 Table 25.3.1 assigns 10db to the 40 mm and larger standard-hook category. For the checked mark the corrected file contains `@s400`. The checked 16 mm transverse and 25 mm and 32 mm longitudinal controls retain their diameters and valid checksums.

Before fabrication, review large-diameter marks and regenerate affected machine files from the project. The machine record uses the common standard bend geometry. The finite-element solution and bar quantities are unchanged. The source is [CIRSOC 201-2025, Chapter 25, Table 25.3.1](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-25-detalles-de-armado.md#c25.3.1).
