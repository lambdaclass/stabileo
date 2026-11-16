# Snow panels follow physical roof geometry

Issue #2172 corrects silent mesh dependence in explicit-panel snow generation.
On origin/main `9d925a78093db05bf8b50eb125aa829fa5dd955d`, the square-rim faceted
dome has rim (0,0,3), (8,0,3), (8,8,3), (0,8,3) and crown (4,4,5), with each
facet's edges modeled as beams. CIRSOC 104 snow uses pg = 1, terrain C,
partial exposure, normal thermal condition, category II, slippery dome and no
slope override. Explicit panels use `loadEveryPanel: true` and unit tributary depth.

The coarse model has 5 nodes and 8 panel pieces. Dividing one sloped rafter into
eight members gives 12 nodes and the same 8 panel pieces. Main changes the eave
panel from roof to floor and drops its balanced eave intensity from
0.5441560854747155 to zero without refusal or a classification warning. The
independent physical expectation is 0.7 × (70 − atan(2 / hypot(4, 4)) × 180/π) / 65.
These witness values are not an error bound. Earlier introduction and historical
release binaries were not assessed. The correction is not assumed conservative.

Raw member fragments previously counted as higher coverage of a panel. Inserting
a node changed a sloped fragment's minimum elevation, so the same physical roof
could cover its own eave panel. The common geometry layer merges connected
collinear fragments into complete physical runs before coverage is evaluated.
Gravity panel geometry and snow roof surfaces use that same normalization.
A run belongs to a panel's own roof only when its eave lies on that panel's
boundary at the panel level and its entire plan segment stays in the footprint.
The containment check partitions the segment at polygon crossings, including
concave footprints. This association prevents the roof covering its own eave
panel. Other runs are tested at their interpolated local elevation over the query
point, through the one coverage function used by panel, piece, point, member and
roof-area classification. Real upper decks and existing attic-floor controls
retain their coverage. The snow generator uses the same physical roof-surface
profile as #2175 and #2176.

Class tests also exposed rounding of tributary widths and loss of the moment of
a varying pressure times a varying width. The floor allocation kernel now has
a physical output path that preserves full precision; its display output retains
its existing rounding. Both call the same calculation. Snow reconstructs complete
physical tributary strips before restricting the load to mesh members. Quadratic strip intensities use bounded piecewise linear loads, conserving
force and both plan moments on every subcell; the bound and beam-response
regression are documented in [the intensity correction](2026-11-snow-quadratic-intensity.md). Strip boundaries and internal
knots follow geometry, not member subdivisions. The independent triangular-strip
regression checks both force and moment; the thirds regression detects the old
six-decimal width quantization. On the parent source, the thirds width is
2.666667 instead of 8/3, and the isolated triangular-strip moment is
−34.825989470381785 instead of −29.021657891984827 kNm. The force still agrees.
The independent strip expectation uses p(x) = p_e(1 − x/8) and triangular
tributary depth x on [0,4], 8 − x on [4,8], with
p_e = 2 × 0.7 × (70 − atan(2 / hypot(4,4)) × 180/π) / 65. Integration gives
force −8 p_e and moment −80 p_e / 3 about x = 0. The tests replay the parent
source in temporary sibling modules in this worktree; those modules are removed
after the replay. No engineering tolerance or assertion is loosened.

The reproducer commit marks its tests `known wrong result: #2172` and enables
them with `RUN_KNOWN_WRONG=2172`. The fix activates them and the earlier faceted
dome reproducer from #2175. The final tests fail on the parent source and pass
with the correction. They check the exact witness, direct generation and full
load planning, explicit panels and default/projected tributaries, individual
edge subdivision, symmetric and asymmetric meshes, rotated physical geometry,
and independent physical eave pressure. The shared remesh helper compares
pressure fields plus distributed force and moment per original physical edge
and each side of the physical ridge. Higher physical panels still cover lower
floors, including both sides of the existing vertical coverage threshold.
Default overlapping-tributary diagnostics are retained. Additional drift controls
integrate the independent triangular drift profile over lower roof lengths 6,
10 and 30, with rotated geometry and subdivisions 3, 7 and 11 in both width and
panel allocation. Their pressure fields, force and moment also pass on the main
source, establishing an unchanged correct control around drift termination.
The drift height is read independently from the checked-in CIRSOC Figure 9
row for ground snow 1 and upwind fetch 30; density and width use the expressions
printed in the drift module. The flat balanced pressure includes the existing
low-slope minimum.

Generation precedes 2D/3D, linear/nonlinear and native/WASM solver selection.
Regenerate all affected generated area loads in saved projects, then rerun analyses, combinations
and design checks. Re-solving stored generated loads alone does not correct
them. The notice applies conservatively to all generated area loads because the shared
classification and full-precision widths also affect roof/floor loads. It persists
after a new solve until the loads are regenerated.
The coordinator reserved [SA-2026-074](../advisories/SA-2026-074-snow-panel-subdivision.md).
Fix PR #2197. The polygon classification is also used by other generated
roof/floor area loads; their roof-dependent classification follows the same
physical correction.

The deliberate snapshot refresh in #2197 covers `snow-subdivided-override`,
`snow-hip-facets` and `snow-roof-rotation`. The first corrects the ridge-side
pressure applied to varying tributary widths; the hip case retains every committed physical load value and adds only the
explicit intensity-bound derivation. Candidate duplicated hip loads were
rejected by the independent oracle before the final refresh. Element IDs and
stations are compared as geometry, not treated as physical quantities moving
up or down. The rotated
roof changes two numerical zero residues only; their magnitudes decrease.
See the intensity correction record for the independent checks and derivation.

## Local coverage correction in PR #2197 round 4

The unmerged branch at `074a898f8ac6d9f5f7f725bd536b4651e87d3efa`
incorrectly put an entire merged run at its minimum elevation. Connected rafters
(0,0,3) → (4,0,5) → (8,0,7) were discarded above a separate panel at z = 4,
although the rafter's local height over (6,0) is 6. The regression panel is the
rectangle [5,7] × [−1,1]; its area is 4. With synthetic floor/roof dead pressures
1 and 3, its resultant must be 4, rather than 12. It is a covered floor and must
receive no generated snow. These pressures are arbitrary test inputs, not
code-prescribed design values. The width-mode equivalent is the segment
(5,0,4) → (7,0,4) with unit tributary width, area 2.

The complete origin/main load source at
`e6cf6cb0a` passes this exact connected-rafter witness. The branch parent fails
it. Coarse single-member equivalents expose main's pre-existing endpoint-height
limitation; the same shared local-height correction removes that mesh dependence.
For the width equivalent, main returns roof classification, dead intensity −3
instead of −1 and a generated lower snow load without notes or snow refusal.
The panel equivalent also has wrong area loads, but its snow generation explicitly
refuses `snow.refused.roofPlane`. These are separate observations from the
branch-only regression; the coordinator decides any advisory action.
The exact main witness is not evidence for a new advisory: the regression was
introduced on the unmerged branch. Historical releases were not assessed.

Regression coverage checks both plan and vertical coverage boundaries, both sides
of the own-roof association tolerance, external eaves at the same level, concave
footprints, reversed members, plan rotations, subdivisions 1/2/3/8, covered and
uncovered controls, gravity allocation, area-load generation, snow generation and
the complete planner. These TypeScript generators run before solver dimension,
analysis method or native/WASM selection; there is no separate native generation
implementation. The existing broad `snow-panel-geometry` registry entry covers
this corrected classification within the same unmerged PR. No result baseline,
engineering tolerance or assertion is relaxed.

## Connected footprint correction in PR #2197 round 5

Own-roof containment uses the union of panels at the eave elevation. The
complete run must stay inside one connected footprint, including its holes
and concavities, rather than inside one artificial panel. Local-height
coverage over separate lower panels remains unchanged. See the
[member-loading record](2026-11-snow-member-loading.md) for the supplied
adjacent-panel witness and the member-response regression evidence.
