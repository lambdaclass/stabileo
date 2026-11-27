# Governing member combinations use inward end faces

The governing combination for each member force component now uses the same
diagram extrema as the calculation report. The search includes the right face
at I, the left face at J, and both faces of an interior jump. Previously, the
governing comparison also included the two raw end forces.

In the endpoint shear fixture, the member shear ranges from −5 to 2. The
exterior value of 30 at J previously won the comparison. The magnitude for that
combination is now 5, so another combination with a constant shear of 6 governs.
The same selection applies to planar and spatial models.
