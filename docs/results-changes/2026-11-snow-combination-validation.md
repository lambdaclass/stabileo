# Refuse ambiguous or unavailable companion snow

Issues #2211 and #2233; advisory
[SA-2026-082](../advisories/SA-2026-082-snow-companion-basis.md).

The unmerged correction aa75ce1db treated every legacy snowAsFlatRoof note as
an instruction to reinterpret S as pf. Legacy seismic combination 5 may already
carry the raised physical f2=0.7 factor. Selecting pf at that factor loses the
required physical 0.7*S combination; matching resultants would not establish
member equivalence. Reconstructing two specifications from an ambiguous saved
one is unsafe, so expansion now refuses it until combinations are regenerated.
An explicit snowBasis remains authoritative; regenerated specifications keep
physical f2*S and 0.2*pf separate, with their original member case identities.
The legacy refusal covers every active E term, independent of the spec ID,
factor, sign-expansion option or missing other symbol.

Required snow availability is resolved before the missing-symbol shortcut.
Both no-S input and physical-S-without-pf input refuse when pf is required,
including when a separate required action is absent. Zero-factor snow terms
remain inactive. Complete, explicit specifications retain their answers;
nonseismic legacy flat-roof notes still select pf. A complete pf field with
another missing symbol retains the existing omission behavior.

The tests in snow-legacy-2233.test.ts failed before the production change:
RUN_KNOWN_WRONG=2211 make test.web.unit FILE=snow-legacy-2233 VITEST_WORKERS=1
reported two failed reproducer tests and one passing correct-input control.
The tested production expander at signed test commit 4ce7ed815 is byte-identical
to aa75ce1db. Both reproducers pass after the fix. The shared validation executes
before any solver selection; there is no native copy of this TypeScript expander.
The preview previously copied selected case fields and dropped snowBasis, refusing a valid generated plan. Its projection now preserves all planned-case metadata. The save/apply regression demonstrates that failure before the preview fix and verifies both preview and apply refusals for the two review defects.
No solver arithmetic, load-allocation algorithm or snapshot baseline changes.

The earlier main-source silent-result evidence and independent per-carrier
member-response oracle are retained in
[the original record](2026-11-snow-companion-basis.md). Round-2 branch defects
are distinguished from that main defect in the advisory. No historical release
binary exposure is claimed. Regenerate snow loads and combinations and rerun
analyses and design checks.
