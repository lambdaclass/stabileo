# Modal analysis of massless released frame ends (2026-11-25)

In #1635 a spatial frame has a released tip bending rotation. Its member
mass is lumped on translations. The released rotation carries neither
stiffness nor inertia. Modal analysis in one representation factored a
rounded stiffness in that direction. Reversing the member could make the
same factorization refuse.

Modal preparation now uses the frame release proof and verifies that the
coordinates of the rotation occur in none of the physical massive rows
after constraint reduction. It sets a reference for that rotation before
condensation. The finite pencil still passes the physical eigen-equation
and completeness checks. A rotation with any physical inertia in its
coordinates follows the existing modal treatment. Recheck affected modal
and dependent spectral results.
