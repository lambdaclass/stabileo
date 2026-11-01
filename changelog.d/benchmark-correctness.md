### Added
#### Trustworthy benchmarks, slice 1: check the model before trusting the comparison (2026-10-30)

Benchmark specifications now state the elements, geometry, restraints, loads, measured quantity,
units and tolerance, with two independent non-provisional references that must agree before a
solve (#862). A shared test-only generator checks applied loads, reactions, rigid motions,
support contracts, full versus reduced shell symmetry, and mesh convergence for Mattiasson,
the shallow-toggle truss and frame, Scordelis–Lo and the pinched cylinder.

Wrong variants from #845, #846 and #810 are kept as negative tests: the old elastica number,
a frame compared with a truss formula, and incorrect shell supports or loads must be rejected.
Convergence checks use every admitted reference, the finest mesh and extrapolation; a plateau,
growing error or oscillation reports a suspect model or reference. The two-element toggle gate
is a discrete comparison, not proof of continuum convergence.

Re-check the model and reference behind a failed benchmark before calling it an engine defect.
This slice changes tests and their evidence, not the production solver or existing accuracy
tolerances; previously solved user projects need no recalculation for it.
