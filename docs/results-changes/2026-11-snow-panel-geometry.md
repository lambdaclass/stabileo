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
could cover its own eave panel. The common geometry layer now merges connected
collinear fragments into complete physical runs before coverage is evaluated.
Gravity panel geometry and snow roof surfaces use that same normalization.
Panel, piece, point and roof-area classification continue through one physical
coverage decision. A fragment cannot raise the minimum elevation of its physical
run. Real upper decks and the existing explicit attic-floor controls retain
their coverage. The snow generator uses the same physical roof-surface profile
as #2175 and #2176.

Class tests also exposed rounding of tributary widths and loss of the moment of
a varying pressure times a varying width. The floor allocation kernel now has
a physical output path that preserves full precision; its display output retains
its existing rounding. Both call the same calculation. Snow reconstructs complete
physical tributary strips before restricting the load to mesh members. Each
quadratic strip intensity is integrated with a pair of affine segments whose
force and first moment agree with that profile. Strip boundaries and internal
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
Regenerate affected saved-project snow loads, then rerun analyses, combinations
and design checks. Re-solving stored generated loads alone does not correct
them. The notice applies conservatively to all generated area loads because the shared
classification and full-precision widths also affect roof/floor loads. It persists
after a new solve until the loads are regenerated.
The coordinator reserved [SA-2026-074](../advisories/SA-2026-074-snow-panel-subdivision.md).
Fix PR pending. The polygon classification is also used by other generated
roof/floor area loads; their roof-dependent classification follows the same
physical correction.
