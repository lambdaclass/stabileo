# Diagram section limits and governing claims

Moving-load envelopes take the extrema of the recovered sections, including both limits at an interior concentrated force and the inside limits at the member ends. A load one floating-point step inside an end is treated as an interior load. The planar axial jump uses the same equilibrium sign as the spatial axial jump.

The extrema evaluator partitions at physical load coordinates and forms its derivative on each interval. If an interior extremum changes an ordinate and the normalized station rounds to an enclosing cut, recovery refuses the result. A point query also refuses a normalized coordinate shared by distinct cuts. A nested ABS or SRSS result that supplies an upper bound can only be ruled out of the governing search when an attained peak reaches or exceeds that bound.

The design span partition checks physical section axes in addition to material, section and group identity. End-for-end pieces can share a span when their physical section orientation is compatible. A half turn that puts the flange on the other face starts a new run. A run of sections without side-to-side reflection symmetry retains the members’ direction so the span chord preserves both transverse axes.

The mat foundation snapshot records the analytic My extrema and their governing values together. The footing snapshot adds the interior envelope stations on its beam members. The concrete flagship member fingerprint records the limiting checks of the actual provisional candidate found using the analytic station set. Member 195 remains unsupported and uncertified.
