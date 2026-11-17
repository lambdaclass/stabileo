# Validate snow provenance and ungrouped pairs

Issues #2211 and #2233, round 8. These two defects were reproduced on the
unmerged branch at 8fba1ca53. This record creates no safety advisory.

A saved combination-5 variant can omit E while retaining the snowAsFlatRoof
note and a physical f2 snow factor. Filtering active terms before identifying
seismic provenance made such a variant appear nonseismic. The expander silently
substituted flat-roof snow for physical S. Snow regeneration alone did not fix
the ambiguity in the saved combination.

For the [documented witness](2026-11-snow-companion-basis.md), projected length
is 10 m, slope 20 degrees, tributary width 1 m, and pf = 0.7. Physical balanced
pressure is 7/13. The omitted-E variant at f2 = 0.7 therefore requires the
physical contribution 0.7 * (7/13) * 10 = 49/13 kN, approximately 3.769230769 kN.
The incorrect substitution gives 0.7 * 0.7 * 10 = 4.9 kN. The linked record
contains the checked-in normative references and independent member-response
derivation. This correction does not recalculate those pressures.

Seismic provenance is now resolved from the original specification: basic
combination 5, any E term including zero, the seismic-companion note, or E in
the omitted-action note. The saved rule ID and displayed label are not used.
An active, untyped S term with both seismic provenance and the legacy flat-roof
note refuses with snow.refused.legacyCombination before missing-action omission.
Regenerate combinations rather than inferring a snow basis from a scalar
factor. Explicit flat-roof terms remain authoritative, and regenerated physical
specifications without the legacy note retain physical S. Zero or omitted S
continues to be inactive.

The second defect rejected a correct physical/pf pair when both alternatives
fields were unset. Coverage now permits that pair only when there is exactly
one ungrouped physical case and exactly one ungrouped flat-roof case. Explicit
groups still require a flat-roof case in the same group. Multiple ungrouped
physical or flat-roof cases, missing companions and mismatched groups refuse.
An ungrouped pair now returns its original factors and case identities.

All callers pass through this validation in expandCombinations, including
preview and apply. No solver arithmetic, native generator, WASM interface,
load allocation, tolerance or snapshot baseline changes. The expander has no
native counterpart and runs before linear/nonlinear solver selection.

The two snow-provenance-2233.test.ts files cover direct expansion plus preview
and apply in 2D, 3D and PRO with linear and P-Delta combination settings, sign
expansion, save/reopen, both legacy snow factors, zero/absent actions, missing
other actions, and valid and invalid pairing boundaries. Final regression tests
replayed against the original expander, preview and apply sources from
8fba1ca53 fail with 29 assertion failures and two passing controls. With the fix,
all 31 pass. The existing nonseismic control now declares basic combination 2;
its former basic: 5 metadata described the newly refused seismic state. Its
flat-roof factor assertion is unchanged.

The new registry entry applies to every snow model and requires load-basis
regeneration, preserving notices after merely re-solving saved combinations.
Regenerate snow combinations and rerun affected analyses and design checks.
