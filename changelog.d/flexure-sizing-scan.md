### Performance
#### Share the flexural sizing scan between moments (2026-11-17)

Sizing a concrete section for flexure scans the tension steel range before
bisecting the requirement. The ductile range and the strength at each scan
point depend on the section and the axial force, not on the moment, so they
are kept per section and reused by every moment asked of it. The requirement,
its bisection and the confirming check are unchanged, and results are
bit-identical.
