# Snow factors follow each roof orientation

PR #2095 corrects two remaining orientation defects in generated
CIRSOC 104 snow. This correction is included in 0.6.1 (PR #2095). It creates no
advisory; advisory disposition remains with the coordinator.

Partial snow previously reduced every roof to one primary axis. When all
surfaces qualified for the gable exemption, that axis was omitted for the
whole model. For perpendicular gables this suppressed required partial cases
along the second ridge. The exemption now requires both the local surface's
slope/width condition and alignment between its ascent and the pattern axis.
Each distinct roof orientation supplies its own span coordinates. Parallel
pattern directions are enumerated once. Each tributary region retains its own
exemption, including when one panel or shared member touches several surfaces.

The shared partialSnowPatterns interface no longer accepts a global axis to
skip. Raw-factor deduplication is scoped to one axis because different axes can
exempt different surfaces. The snow generator evaluates every real surface's
exemption and pressure before averaging a shared member or integrating a panel.
It then deduplicates exact distributed/nodal load lists, without a tolerance.
A panel with flat or mixed tributaries cannot erase a required pattern through
an aggregate exemption. An all-full case remains distinct when the balanced
case also carries drift. The existing strict slope inequality and engineering
limits are unchanged.

Unbalanced cases previously assigned the mean of leeward and windward pressures
to any surface perpendicular to the wind. That surface is not two roof sides:
its ridge follows the wind, and it must retain its balanced pressure. The local
surface evaluator now does so. A ridge member still averages pressures of the
real surfaces returned by the shared surface model; a panel tributary integrates
its actual surface regions. No synthetic opposite face is introduced.

In the retained perpendicular-gable width-one witness, the parent returned
0.35082074049283163 on the crosswind eaves instead of their balanced
0.46776098732377547. These values are runtime output from the repository's
roofSnow calculation and generated load lists. The parent continuous-roof
witness emitted only X partial cases; the fix emits X and Y cases and preserves
each exempt transverse tributary at full balanced pressure. Tests exercise both
sides and equality of the existing exemption threshold, selection, projected
loads, width and panel layouts, public load planning, actual two-sided ridge
averaging, valid single ridges, planar 2D sections, independent oblique roofs,
and complete partial/unbalanced load lists under rotation and reflection.

Origin/main 013485aa2629a05672403919060cc1397f510fd1 was replayed in this
worktree with historical snow generation, drift and span modules restored in
a finally block. Those four modules are byte-identical at v0.6.0
(fb241aa04936a993a3ecd4a2ec4f9490669c1d34). It also silently omits one required
partial direction in the continuous perpendicular-roof witness. Its unbalanced
algorithm differs from the branch parent: in the +X case, first-roof crosswind
eaves receive 0.14032829619713266 rather than their balanced
0.4677609873237755, without refusal. These are public generator source replays,
not released-binary or downstream-solver executions. The coordinator decides
whether existing advisory coverage needs amendment; no new advisory is added.

Three existing snow snapshots intentionally change. Relative to 04e34b91ed,
the comparison reports changed/removed/added fields as follows:

| Snapshot | Changed | Removed | Added |
|---|---:|---:|---:|
| snow-perpendicular-ridges | 78 | 100 | 2 |
| snow-hip-facets | 1474 | 4 | 156 |
| snow-two-pitch | 47 | 0 | 0 |

Hip/perpendicular snapshots record the corrected orientation factors and
case lists, including the average of full and partial pressures on shared hip
members. The two-pitch changes retain balanced pressure for crosswind facets
and update the count of distinct partial cases. The other six snow snapshots,
including both step/drift cases, remain unchanged. No comparison tolerance or
assertion is relaxed. The snow-orientation-factors registry entry requires both
snow and generated loads. Manual snow and non-snow controls exclude it.
Regenerate affected snow loads, then rerun analyses, combinations, envelopes and
design checks; re-solving saved generated loads alone cannot repair them.

The advisory blog is restored byte-for-byte to origin/main in every locale,
including its existing SA-2026-061 publication revision. The prior branch-only
revision-note test is reverted with that edit; the #1846 tests are unchanged.
The coordinator-assigned SA-2026-065 and SA-2026-067 documents remain as drafts
under docs/advisories/drafts/, with their links updated and contents otherwise
preserved. They are not added to the public post or its top-level catalog.

Snow generation is shared TypeScript code before solver selection. There is no
separate native Rust, WASM, linear or nonlinear implementation of these factors.
The targeted tests exercise every generator entry path without running an
unrelated solver suite. Roof-skin persistence and solver refactors remain outside
this correction; the existing resolved-surface model supplies the needed local
geometry. Engineering rules are taken from the repository's CIRSOC 104-2005
chapter 5 and existing roofSnow implementation, not from recalled values.

The stronger committed snapshot gate against the reproducer commit exposed a
classifier defect: it recognized `snowDerivation.item0` but treated the actual
`snowDerivation[0]` family as a linear solver result. A separate reproducer/fix
pair covers changed, removed and added bracketed derivation fields. One shared
family parser now recognizes both property and array boundaries for analysis
and field applicability. Generated-load context, snow conditions, loads area,
quantity coverage and the prohibition on a fictitious linear solve remain
mandatory. This gate correction does not change engine results.
