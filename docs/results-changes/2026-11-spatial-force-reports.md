# Magnitude peaks and signed spatial force tables

The default 3D calculation report now prints each force and moment component's
exact whole-member peak for SRSS and ABS combinations. It labels the values as
magnitudes. If a component has only a conservative bound or its exact peak
cannot be evaluated, the summary cell says that the extrema are unavailable.

For the report regression, a simply supported 6 m member carries a triangular
load from zero to 10 kN/m. Its peak moment is (10·6²/(9√3)) kN·m.
Combining two identical diagrams produces 32.66 kN·m for SRSS and 46.19 kN·m
for ABS at the report's precision.

A spatial force table without resultant columns reads every selected station
and end from the signed solved cases of a bound envelope. The axial cases
+10 kN and −8 kN give a maximum of +10 kN and a minimum of −8 kN. The
max-absolute aggregate alone had produced +10 kN in both columns. An
aggregate with missing signed sources is refused.

An unavailable force query blocks the CSV download and gives the same
translated diagnostic as the table. Regenerate affected calculation reports
and force tables to obtain the corrected values.
