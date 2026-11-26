### Performance
#### Find the flexural neutral axis in fewer evaluations (2026-11-17)

The CIRSOC 201 beam check located the neutral axis by bisecting down to
adjacent floats, about 57 evaluations of the section's equilibrium. Every
rounded operation in that residual is monotone in the neutral axis depth, so
its sign changes between one pair of adjacent floats, and a false-position
search that falls back to bisection reaches that same pair sooner. The depth
returned is bit-identical; the interval certificate is unchanged.
