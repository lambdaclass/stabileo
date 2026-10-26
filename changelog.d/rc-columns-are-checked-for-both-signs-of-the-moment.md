### BREAKING (results)
#### RC columns are checked for both signs of the moment (D4-01, 2026-10-22)

A CIRSOC 201 column whose bars are not symmetric about the bending axis gets the capacity of its
weaker side; some columns that passed now fail, and the designer may pick more bars. The station
moments are magnitudes, but the uniaxial column capacity was solved with the +y face compressed
only, and the designer's 6, 10, 14… bars (and faces entered with nTop ≠ nBottom or nLeft ≠ nRight)
put more bars on the other side: 30×30 with 6 Ø20 at Nu = 100 kN carries 101.57 kN·m one way and
78.57 the other, and passed Mu = 100 at 0.98. The column kernel (`column_capacity_kernel.rs`) now
solves both signs and returns the weaker, with the governing sign (`momentSign` on the column
result); the station verifier, the designer and the engine gate all read it. Symmetric layouts are
solved once, bit for bit as before. The biaxial check already took the worst quadrant. Projects
solved before are told so on opening (re-check entry `column-capacity-both-signs`, results
version 3). Advisory SA-2026-023 (#590).
