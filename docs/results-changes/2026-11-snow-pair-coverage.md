# Refuse missing physical snow counterparts

Issues #2211 and #2233, round 9. Reproduced on unmerged branch head
969dbd17a. No new safety advisory is assigned by this change.

With physical S(A), flat-roof pf(A), and flat-roof pf(B), expansion accepted
a partially missing pair. Flat-roof companion combinations included roofs A
and B, while principal S and physical seismic combinations included only A.
The existing coverage check ran only when flat-roof snow was requested and
only checked physical cases against flat-roof cases. The complete A pair
therefore hid the missing physical B case.

Every active S term now uses one coverage rule toward its requested basis.
Every case in the other basis must have a counterpart in the same alternatives
group among the selected cases. Ungrouped coverage requires exactly one
ungrouped case of each basis. The same rule now checks flat-roof to physical
coverage when physical S is requested, retaining physical to flat-roof coverage
when pf is requested. Validation precedes missing-action omission and expansion.
All callers use expandCombinations; no preview, apply, 2D, 3D, nonlinear or
native copy of this validation exists.

The minimal witness uses case identity rather than a pressure derivation:
the unit-factor principal S specification must retain physical cases for both
represented roof groups. With physical B missing, returning physical A alone
is incomplete regardless of member loading or factor magnitude. This change
refuses that input with snow.refused.flatRoofCase rather than inventing a
physical field from pf. Adding physical B restores both roof case identities
at each specification's original factors. Physical-only inputs, a complete
single ungrouped pair, multiple complete grouped pairs, alternative physical
patterns, zero-factor S and combinations without S retain their answers.
Flat-roof-only requests retain their existing directed coverage requirement.

The two snow-pair-coverage-2233.test.ts files cover principal S, physical
seismic S with active and omitted E, mixed companion/physical specifications,
missing other actions, incomplete and complete grouped/ungrouped pairs,
patterns and sign options, preview and apply in 2D, 3D and Pro with linear and
P-Delta combination settings, and save/reopen. On production code identical to
969dbd17a, SNOW_ROUND9_REPRO=1 make test.web.unit
FILE=snow-pair-coverage-2233 VITEST_WORKERS=2 fails 17 tests and passes 14 controls.
After the fix all 31 pass without skips. No solver arithmetic, native/WASM
interface, load allocation, engineering tolerance or snapshot baseline changes.

The snow-pair-coverage registry entry applies to every snow model and requires
load regeneration. A new solve stamp alone cannot clear it; a current load-basis
stamp does. Regenerate snow loads and combinations and rerun affected analyses
and design checks. The pre-existing main-source wrong-result evidence remains
in the earlier snow-companion-basis record. This round establishes the missing
pair defect on the unmerged branch, without claiming a new silent wrong result
on current main or a released binary.
