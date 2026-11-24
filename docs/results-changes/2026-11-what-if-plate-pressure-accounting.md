# Independent pressure accounting in Explore

When an Explore slider changes pressure generated from a physical plate definition, analysis checks the assembled loads against the original pressure field and the requested slider factor. The force and moment check is independent of the load scaler. The pressure check compares values at each shell corner, or at the two endpoints of a varying pressure field. The expected pressure includes each applicable case factor. The combination check uses the verified cases.

Alternating pressure errors on a rectangular shell can change equivalent nodal forces while leaving the total force and moment equal to the request. A pressure mismatch beyond roundoff stops analysis and identifies the load case, shell and pressure value. Correctly scaled cases retain their results.
