# Snow fetch follows continuous roofs and selected geometry

Review #2095 round 9 corrects two regressions on the unmerged snow branch.
Regenerate affected snow loads, then rerun analyses, combinations and design
checks. Re-solving stored generated loads alone does not correct them.

The branch grouped roof panels by comparing elevations only at the endpoints
of their shared overlap. Equal endpoints can conceal an intermediate valley.
The resulting group extends the fetch used for step, parapet and adjacent
structure drifts and can receive sliding snow across a discontinuity. The join
predicate now consumes the same surface-partitioned edge-height query as the
crossing preflight and exterior-edge classification. That query checks every
surface breakpoint, including both one-sided facet limits. Resolved unequal
surfaces stay separate; unavailable or nonfinite continuity refuses before
loads are emitted. Existing geometric matching tolerances are retained.

A selected roof previously inherited its frame from the first inferred plane
among all exposed roofs. An unrelated X-sloping roof could make a selected
barrel curving along Y lose both unbalanced cases and receive incorrect balanced
pressure. The common surface model now exposes the supporting planes of its
target members as one selected set, retaining their original surface order.
The frame, width and transverse sense use this set and the target members; a
selected horizontal eave keeps its supporting roof pitch. A selected flat roof
uses its own fallback direction. Existing wind-case enumeration across sloped
roofs remains intact. Other exposed surfaces remain available for drift and
sliding interactions. No independent
coordinate repair is added to the shaped-roof allocator.

The six initial public witnesses all fail on 82d39c29b2 and pass on origin/main
at 013485aa2629a05672403919060cc1397f510fd1. Three valley locations compare the
adjacent-structure surcharge with the repository's stepDrift calculation using
the separate receiver's fetch. Three selected-barrel cases compare projected,
width and panel loads with the same roof in isolation, preserving physical
endpoint intensities and sorting only load-array order. These comparisons
establish branch regressions; no advisory is added.

Class coverage checks step fetch on both sides, parapets, sliding containment,
rotations, reflection, translation, reversed members, planar sections, spatial
roofs, incomplete surface refusal, both sides of the existing height and overlap
join limits, selected flat roofs and complete load planning. Valid continuous
roofs retain their fetch; isolated selected roofs retain their loads. Native
and WASM, linear and nonlinear analyses consume the same TypeScript-generated
loads. Their solver implementations are unchanged.
