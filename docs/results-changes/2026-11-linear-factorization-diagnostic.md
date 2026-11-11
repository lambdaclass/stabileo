# Unconfirmed linear factorization failure reports unresolved accuracy

PR #1753. The existing `linear-stability-refusals` registry entry covers this
clarification; its applicability and quantity declarations are unchanged.

A Cholesky failure after the stability check previously said that a negative
spring or member property made the structure unstable. The factorization failure
alone does not establish that diagnosis: numerical loss of positive definiteness
can also cause it. The shared dense and sparse fallback refusal now reports that
numerical accuracy is unresolved and returns no result. A confirmed negative mode
still receives the negative-stiffness diagnosis from the stability verdict.

No solve/refuse decision, displacement, force, tolerance or results-version rule
changes. This changes the explanation of an existing refusal on this unmerged
branch, not a silently returned numerical result on main. No advisory is added.

The diagnostic regression fails before the fix and passes afterward. The existing
negative-spring path test continues to require refusal, and the negative-node-mode
tests continue to require the confirmed negative-stiffness diagnostic. Seed 20761
now unconditionally requires the loaded-release refusal, even if a dropped moment
would otherwise yield stable, unit-invariant displacements.

The legacy deep-beam-shell failure is separate: the harmonic notice legitimately
applies to a saved file with unknown analysis history. Main-first merge history
orders `harmonic-omitted-modes` before `linear-stability-refusals`, whereas the
branch history does the reverse. The exact notice expectation now follows registry
versions, date and id, with both histories exercised. Stress changes remain
explained and a fabricated displacement change remains unexplained.
