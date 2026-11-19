# Fixture replay and framed model import (2026-11-19)

## Fixture loads

Fixture replay now passes the start and end stations of partial distributed loads and the case identifier of thermal loads to the same creation methods used for direct editing. This applies to example loading, workbook replay and fixtures that retain their original combinations. A fixture with a patch load previously applied the same intensities over the whole member. A thermal load previously fell into the default case, so a combination for its authored case could omit it.

For the regression cantilever, the load occupies stations 1 m to 4 m on a 6 m member at −5 kN/m. Integration over that span gives a vertical reaction of 15 kN. Whole-member replay gave 30 kN. The thermal regression uses a fully restrained member, with a nonzero case 2 reaction that carries into the combination selecting that case. Reload any affected fixture from its source and recompute its results.

## Framed inputs

Flat workbooks that declare axes now map vertical and normal-rotation spring stiffnesses to their respective planar degrees of freedom. Reimport affected workbooks and recompute. The importer blocks installation when a declared flat support has an out-of-plane component, a LoadData case cannot be resolved, or mixed standalone gravity and case weights cannot represent the legacy gravity rule.

Framed model code now uses spatial records to identify older spatial fragments whose nodes omit the third coordinate. A mode declaration records the coordinate dimensionality of newly exported selections. Reimport an affected fragment from the original code before recomputing.
