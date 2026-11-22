# Refuse non-finite solver inputs and preserve planar case factors

Web analysis checks solver input before creating JSON. For example, a non-finite optional spring stiffness previously became JSON `null`, which the harmonic and planar P-Delta solvers read as an absent spring. The solve now stops with the field path and the rejected value. Enter a finite value before rerunning the analysis.

A planar combination could also lose the factor of a load case named `__proto__`. The wire input now retains that name as a data key and uses the net factor returned by the shared exact resolver. Re-run planar combinations in projects that use this load-case name.
