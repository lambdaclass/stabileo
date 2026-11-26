# Whole-member demands and concurrent heatmap forces

Planar axial labels show the signed force that drives the member colour.
An axial force running from 0 to 10 kN now shows +10 kN. Calculation report
envelope rows use the selected envelope's curves and lengths by member ID,
including when the report receives a copied results record.

Storey sway and the direct-analysis stiffness iteration use the most
compressive section along their respective members or solver pieces.
Opposing 100 kN axial actions can compress the segment between them while
both member ends carry zero. In direct analysis, a balanced triangular axial
line load can similarly produce 100 kN of compression inside a single solver
piece. With a squash load of 150 kN, this gives a bending stiffness factor of
`4 × (100/150) × (1 − 100/150) = 8/9`.

Steel verification without station demands uses individual extrema and
concurrent force tuples at the member's critical cuts. A simply supported
6 m beam with a 10 kN/m uniform transverse load gives a peak moment of
`10 × 6² / 8 = 45 kN·m` at midspan.

Spatial force heatmaps find each shear or bending resultant within a solved
constituent, then select the largest concurrent resultant at each shared
cut and face. Components of 3 and 4 in one case give a resultant of 5.
The same two components in separate cases give an envelope value of 4.
Without constituent forces the resultant is unavailable. Spatial stress
heatmaps require a concurrent force tuple and refuse envelopes and
magnitude combinations.
