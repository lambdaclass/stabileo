# Modal seismic load generation requires scalable base shear

PR #2316. 2026-11-18.

INPRES-CIRSOC 103-I (2018) §7.2.5 requires scaling a modal base shear
below 85% of the static base shear up to that minimum. When the
retained modes produced zero shear in a requested direction, the
load planner left the scale at one and allowed an empty seismic case
to be applied despite the positive minimum.

The planner now blocks Apply and identifies each direction whose shear
cannot be scaled. The check covers the axes used to generate a 45°
case as well as individually selected axes. A positive modal shear
below the minimum still scales to the required value.

Review existing generated E cases if an affected direction was included.
Check the model restraints and modal participation, then regenerate the
loads and repeat the affected analyses, combinations and design checks.
