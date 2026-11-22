# Exact directions for planar member loads

The 2D input adapter and its load check now use exact sine and cosine values for point and distributed member loads entered at multiples of 90 degrees, in both local and global axes. A computed residual in a perpendicular direction could cause a false moment mismatch when the adapter filtered it. For larger loads the residual could enter the solver and affect reactions, displacements and member forces.

The distributed-load interval validator still runs before component filtering and reports the existing geometry-limit refusal. The solver equations, interval limits and accounting tolerances are unchanged. Angles near a quarter turn retain their entered direction.
