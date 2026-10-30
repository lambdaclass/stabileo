### Added
#### Benchmark specs and model checks (2026-10-29)

Add a shared, test-only model generator and JSON benchmark specifications for
Mattiasson, shallow-toggle truss/frame, Scordelis–Lo and pinched cylinder.
Check reference agreement, loads, reactions, rigid motions, full-model symmetry
and mesh convergence before accepting benchmark comparisons. Preserve the
original wrong-model variants as negative tests and explicitly distinguish the
two-element toggle references from continuum convergence. No production solver
or existing accuracy tolerance changes.

Gate discrete toggle responses against every non-provisional pass/fail reference
using the declared response tolerance, independently of reference ordering.
