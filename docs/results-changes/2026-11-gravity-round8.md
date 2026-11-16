# Representable member moment supports

PR #2219 round 8 corrects the unmerged member-moment density feature.
On a unit member a uniform torque density with integral 1 over
[-1e-14, 1e-14] previously assembled the entire torque outside and inside
the member. Recovery had already integrated half the load at the start,
so its start diagram differed from the solved start torque by 0.5.
The corresponding span straddling the far end had the same defect.

A single checked `MemberMomentSpan` now supplies assembly and recovery.
Both endpoints must lie within the existing 64-epsilon member-length
allowance. Canonical support is clamped to the member, and the total
endpoint correction must not exceed 128 epsilons of the original load
span. The endpoints must be strictly ordered in physical and normalized
coordinates. Polynomial ordinates remain defined in the local span parameter,
including when an interior physical midpoint rounds to an endpoint. A support that fails these
checks refuses before solving. The intensity ordinates are preserved;
loads remain member densities and are never replaced by nodal loads.

Native linear, prepared, P–Delta and corotational entry points and WASM
linear, P–Delta and corotational entry points cover both member ends,
all three moment axes, invalid and representable supports, and supported
cantilever torque diagrams and tip twist against direct integration.
Plane input continues to refuse member moment fields during decoding.

Regenerate affected loading and rerun analyses, diagrams, combinations
and checks. This endpoint defect is absent from origin/main, which has
no distributed member moment feature. No new advisory is assigned here.

Floor force profiles now coalesce all adjacent compatible pieces before emission,
and omit support coordinates only for an exactly full member span. The former
near-full shortcut widened a piece while retaining its neighbouring fragment.
The strengthened balanced-snow checks compare intensity over the union of layout
and generated-load breakpoints, plus force and first moment. Moment coalescence
uses one shared quadratic-profile routine before and after member clipping, with
the existing 32-epsilon arithmetic bound unchanged. Region moment coordinates
are mapped to the solver member length. The existing per-carrier hand controls
retain their shear, bending, torsion and deflection assertions.

Direct plane WASM decoding now explicitly recognizes and refuses the forbidden
`moments` field through shared plane-load input data. `deny_unknown_fields`
alone was insufficient for the JavaScript object decoder: JSON and native
entry points refused the field while the linear WASM path discarded it.
The shared decoder covers typed and legacy plane loads. Linear, P–Delta and
corotational WASM tests verify refusal on every moment axis and retain a
nonzero cantilever-force answer when the forbidden field is absent.
