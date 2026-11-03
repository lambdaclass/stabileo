### Fixed
#### The combination governing a member counts the forces inside it, not only at its ends (2026-11-02)

The combination named as governing a member's moment, shear, axial force or torsion was the one
with the largest value at either end. A beam whose largest moment is at midspan under one
combination and at its ends under another was credited to the wrong one, with an understated
value. The governing combination is now taken over the whole diagram, its interior stations
included, in 2D and in 3D. Design checks that already read station demands are unchanged; the
combination they name where no station demand exists is now the right one.
