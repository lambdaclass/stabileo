# Concurrent member demands and physical storey cuts

Endpoint demands, station force tuples and section stresses require forces
from a single load state at each section. An envelope of a case with axial
force −100 kN and a case with bending moment 50 kN·m previously supplied both
values as one section demand. In the example, the two cases have zero
bending and zero axial force respectively. Demand and stress readers now
refuse that result, and the same check applies to every piece of a split
member. Independently enveloped values are available in component tables
and diagrams. Envelope readers refuse missing or invalid signed ordinates.

Storey sway takes both transverse shear components on the inward face of
the lower cut and orients them before adding their global components. In
the regression, two columns carry 50 kN each in the same lateral direction
at that cut. One column carries 10 kN at its upper end. With 2000 kN of
total axial compression, a 3 m storey height and 6 mm of drift, the
lower-cut shear gives (Q = 2000 \times 0.006/(100 \times 3) = 0.04) in
either member orientation. Using the local I end of the reversed column
gave (Q = 0.10) and classified the storey as sway.

The spatial moment heatmap uses the larger absolute bending component at
each shared cut. A section with bending components 3 and 4 kN·m has a
moment colour value of 4 kN·m. The shared sampler preserves both physical
faces at a jump. The shear heatmap evaluates its vector magnitude using
the two components from the same load state and cut.
