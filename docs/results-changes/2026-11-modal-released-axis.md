# Spatial modal spectra with released end rotations

The archived spatial cantilevers from #1351 and #1635 each have a rotation
released at the free end. Their members have lumped translational mass. The
released rotation therefore has neither restoring stiffness nor inertia. The
rotation in #1351 and the member reversal in #1635 changed the rounded pivot
along this axis. A modal solve could then refuse to return the spectrum.

Spatial modal analysis now identifies the isolated released axes before mass
condensation. It verifies that the elastic force along each such displacement
is consistent with zero at assembly round-off and checks that the physical
mass rows do not use that axis. This lets the massless stiffness factorization
choose a representative mode shape. The factorization is scaled by the square
roots of the diagonal entries and checks relative pivot reliability. Frequency,
residual and completeness checks use the physical model. A rotation that can
carry inertia still goes through the existing modal classification.

Both archived models now return three finite modes in the archived transforms.
Mode shapes on an earlier successful solve may change along the released
coordinate. The certified export applies its independent checks to the returned
results and can report an uncertified result when it cannot enclose the spectrum.
Full-rank planar and spatial modal controls retain their exact output.

Re-run modal analyses and dependent response spectra for affected spatial
models.
