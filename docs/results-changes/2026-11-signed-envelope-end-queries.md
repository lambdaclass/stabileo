# Signed bounds in spatial envelope end queries

The Pro query table and its CSV export now include each distinct signed
value at the inward side of a member end across the solved cases or
combinations in the displayed envelope. The minimum and maximum modes
can use those values even when every case has the same sign. For
example, if two cases yield +10 kN and +20 kN at an end, the minimum is
+10 kN and the maximum is +20 kN. The absolute threshold applies to
each available value.

Open the envelope and export the query again to recover the signed
values.

The spatial multi-case WASM adapter registers the returned combination
results as the constituents of its envelope. With a 10 kN downward
cantilever tip load factored by 1 and 2, section equilibrium gives
+10 kN and +20 kN shear at both inward ends. The signed query uses
those values and excludes any load case outside the combinations.
