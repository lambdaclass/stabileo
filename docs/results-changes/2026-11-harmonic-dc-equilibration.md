# Unit-independent direct harmonic stiffness at zero frequency

At zero frequency the harmonic dynamic stiffness is the elastic stiffness.
In #2115 the old factorization ratio depended on the units of the force and
moment equations after scaling only the columns. The same stiffness passed in
the original units and could fail after conversion.

Both direct harmonic factorizations now normalize the zero-frequency rows
and columns by the square roots of their own stiffness diagonals. They apply
the existing relative pivot test to that matrix and check the response in
the original equations. The prior answer is retained when it also passed
its factorization and residual checks. This change applies to zero-frequency
points computed by the direct solver, including points taken from the modal
sweep for direct calculation.

The archived model returns its zero-frequency response in all three unit
conversions. A singular zero-frequency stiffness still refuses. Re-run
affected harmonic sweeps that include zero frequency.
