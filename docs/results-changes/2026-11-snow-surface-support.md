# Snow tributaries use interior roof surfaces

Review #2095 round 5 corrects two defects in inferred snow-roof surfaces.
This branch is unmerged and unreleased. No advisory is created here.

A tributary strip now takes its interior normal from the panel's signed
winding and the overlapping boundary edge, with the member's direction
accounted for. A vertex average can lie outside a concave panel and cannot
establish its interior. Surface eligibility likewise uses partitioned edge
intervals and shared-edge winding, including coincident concave footprints.
The L-shaped witness's recess edge previously received a flat-roof line load
of 0.2; its correct pitched line load is 0.1264093762098026, calculated by the
repository's roofSnow implementation and the witness's tributary depth.
Every quarter-turn, reflection, panel winding and member direction retains
that absolute answer. A pitched carrier whose strip has no resolved plane now
refuses with snow.refused.roofPlane instead of substituting flat pressure.
The shared preflight prevents a partially generated case from escaping.
Genuinely flat roof panels retain their flat-roof answer.

Member support now partitions the complete projected member against each
coplanar facet footprint. Only positive-length contact establishes support;
a corner touching a ridge, including its midpoint, contributes no load.
The same support classification controls plane inference, member membership
and every memberPlanes query. Point-only contact cannot re-enter through the
old membership fallback. The retained ridge witness previously received
0.5225229518988548 instead of 0.46776098732377547 in its balanced width load;
its unrelated touching facet also changed unbalanced loads.

A positive but incomplete overlap now refuses rather than averaging a facet
across the entire member. Previously, partial support had no consistent
handling: midpoint overlap averaged the facet over the whole member, while
an off-midpoint overlap was ignored. Existing tributary-piece integration
partitions area strips by surface, but projected-width and width-member
pressure do not carry longitudinal facet shares. All generator modes therefore
refuse incomplete member support through the shared preflight and direct
surface queries refuse it too. Zero contact is excluded, complete support is
included, and a selected fully supported member retains its answer even when
another member extends beyond a facet. Longitudinally varying member support
is deliberately left for a separate representation change.

The local origin/main reference 013485aa2629a05672403919060cc1397f510fd1
was replayed in this worktree through the public generator. Its snow-loads.ts
and snow-drift-loads.ts were restored byte-for-byte afterward. It silently
returns wrong loads for the concave panel-strip witness and the point-contact
ridge witness, although it does not contain this branch's surface-inference
mechanisms. In 60 selected public-interface cases, 44 fail numerical assertions
and 16 pass; these are not missing-module failures. Advisory disposition and
numbering remain with the coordinator and are recorded in .handoff.md.

Regenerate affected snow loads before rerunning analyses, combinations and
design checks. The registry notice requires both snow and generated loads;
manual snow and non-snow projects do not receive it. The change affects the
shared TypeScript load generator before solver selection. There is no separate
native Rust, WASM, linear or nonlinear implementation of this generator.
Targeted coverage includes direct surface and tributary queries, projected
loads, width layouts, panel layouts, drift/sliding preflight and load planning.
Existing 2D section and 3D surface controls remain required. No engineering
rule, comparison tolerance, baseline or assertion has been loosened.
