# Snow cases cover every ridge orientation

PR #2095 corrects the shared roof-surface model. This change is included in 0.6.1 (PR #2095). Advisory decisions remain with the coordinator; this
change creates no advisory.

Unbalanced snow now enumerates both senses of every distinct surface ascent
orientation, identifying opposite gradients as the same orientation. Every
case still uses each tributary region's own pitch and width. Perpendicular and
L-shaped gables therefore receive their governing leeward case. In the retained
unit-width perpendicular-gable witness, the second gable's eaves previously
received 0.35082074049283163 in both cases; their new governing case receives
0.7016414809856633, calculated by the repository's roofSnow implementation.
A single ridge retains its original two cases. Parallel faces do not duplicate
orientations. Bounded hip facets are retained even when another facet sharing
their rafter has greater support length. Closing a missing ridge requires an
existing horizontal member in the connected support graph; two rafters meeting
at a corner cannot create an extra diagonal roof face.

Selection-aware roof detection supplies the target set before exposure outside
the selection can discard a covered lower roof. The complete member geometry
remains available to infer its surfaces. Both flat and sloping selected lower
roofs retain their loads; selected upper roofs remain correct.

A shared segment/polygon partition replaces the source endpoint/midpoint test.
It checks every intersected interval, including collinear boundary overlap, and
the source elevation along that interval. An indeterminate spatial source
crossing a narrow receiver refuses snow generation and direct surface/drift
queries. Sources outside or below the receiver retain their answers. The same
partition supplies tributary integration and the surface regions along an edge.
Near-parallel determinants use a floating-point roundoff bound; existing spatial
clearances and engineering limits are unchanged.

Adjacent-structure and parapet reporting now partition the edge by surface
boundaries and the drift eligibility limits. Each interval identifies its
stations from the first vertex of that edge and reports values at its midpoint,
using the local receiver elevation. The same local drift function supplies the
surcharge and interval derivation. References are included when any interval
applies. In the retained pitched receiver, the parent generated six surcharge
pieces while reporting no adjacent drift and no references. The corrected
report distinguishes stations 0–2.640 m without drift from 2.640–6.000 m with
drift. The more precise applicability crossing in the test is
2.6397562833206396 m. A valley control applies only in an interior interval that
neither edge endpoint nor its midpoint detects. Separation controls on both
sides of the existing limit retain the original acceptance rules. The
eligibility constants are shared with stepDrift; their values are unchanged.

The origin/main reference fb241aa04, also v0.6.0, was replayed inside this
worktree. It also lacks the per-orientation case family, but its aggregate
geometry gives different numerical errors: the retained gable witness has
0.8419697771827959 and 0.14032829619713266 on both slopes rather than the local
leeward/windward pair. The specific half-leeward governing underestimate is a
branch regression. Main already accepts a selected covered lower roof, so that
selection loss is confined to this branch. Main does not reject the unresolved
crossing source. Main reports adjacent drift with references in this witness;
the contradictory no-drift report is confined to this branch, while main's
flat receiver assumption is already covered by the roof-plane correction.
No claim here relies on a missing historical module: the replays call the public
load interfaces and use source files restored in a finally block.

The new regeneration notice requires snow AND generated loads. Manual snow and
non-snow controls do not receive it. New perpendicular-gable and hip snapshots
retain complete generated cases. The existing two-pitch snapshot gains the
additional orientation's cases without changing or deleting its old values.
The snapshot applicability gate now parses snowRoof corpus sources and routes
them through the same openedFeatures path used by the snapshot harness, without
requiring a bundled example or saved project. Generated-load, snow-result and snow-derivation fields are checked as
load generation before a solve: they require generated-load model context, a
loads-area entry, matching conditions and declared quantities. They do not
claim that a linear solve ran. Missing corpus context still fails. All other existing snow snapshots remain unchanged. No comparison tolerance or
baseline assertion was relaxed.

The initial blog revision-note change is superseded by
[the orientation correction](2026-11-snow-orientation-factors.md), which restores every locale to
origin/main and keeps the coordinator's snow drafts in docs/advisories/drafts/.

Validation covers projected-width, width-layout, panel-layout, surface-query,
drift/sliding and load-planner interfaces, with perpendicular and L-shaped
gables, hip roofs, selection, narrow crossings, valley applicability, and
rotation/translation/reflection of complete load lists. These TypeScript loads
are generated before solver selection; there is no native Rust snow generator
or separate linear/nonlinear snow implementation. Existing planar-section
controls exercise the 2D extrusion path. The engineering rules used here come
from the repository's CIRSOC 104-2005 extraction, chapters 6–8 and Figure 9, and
the existing snow/drift implementations, not recalled engineering values.
