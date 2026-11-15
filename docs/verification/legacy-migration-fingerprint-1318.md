# Legacy migration material and section fingerprint (#1318)

The cause:B defect is in the regression oracle. `modelFingerprint()` recorded only material
`e`, `nu`, `rho` and section `a`, `iz`, `iy`, `j`, `rotation`. Neither linear results nor that
fingerprint could detect strength loss. Steel `fy`, concrete's legacy `fy` and explicit `fc`,
`fu`, thermal expansion, timber references, section outlines, shear areas and design metadata
now pass through `model/result-properties.ts`.

The shared policy classifies every `Material` and `Section` field. Required mapped types and
an independent TypeScript AST test enforce completeness. Every property outside the types is
fingerprinted by default too, including historical `standard` and `region`. Nested objects
use exact canonical serialization. Only material display names and section editor input
history (`built`) are excluded with explicit reasons. Section names remain included because
catalogue resolution reads them. No result tolerance or assertion was weakened.

G is derived from E and nu (`section/tensors.ts`, `section/drawn.ts`); transformed sections also
carry `drawn.parts[].ratio.g`. All are covered. There is no `Material.fyt` field: fyt is a
reinforcement design input in `cirsoc201-beam-kernel.ts`, assembled by `cirsoc201.ts`.
This change classifies the actual material and section schemas, rather than inventing fields.
It does not extend the rest of the model fingerprint to reinforcement design settings.

## Evidence

The signed reproducer commit uses Vitest `it.fails` with #1318 in each title, the TypeScript
form supported by `scripts/issue-reproducers.py`. Against its parent, removing the markers
produces four assertion failures and one passing unchanged-project control. With the shared
fingerprint, all four pass as ordinary tests.

Additional tests mutate every populated material/section property, including nested fields,
in Basic 2D, Basic 3D and PRO; exercise individual project and session loading; distinguish
absent/undefined from null, zero and adjacent representable numbers; retain metadata and
key-order controls; and check all 187 real project migrations against their saved material
properties. Temporarily adding an unclassified optional material field makes the schema test
fail. The root handoff records commands, outcomes and the release-reference correction in #2091.

## Released corpus discrepancy

The direct material audit passes for all 187 projects: the current migration preserves their
saved material properties. No migration that silently drops or changes strength was found.
For example, `web/legacy-projects/v0.2.0/truss.ded` and its v0.3.0 counterpart have material 1
with `fy = 250 MPa` and no `fu`; opening them keeps exactly that state. Today's default material
in `store/model.svelte.ts` has `fy = 250 MPa`, `fu = 400 MPa`. `templates/load-fixture.ts` keeps
that default when a fixture names material 1 `Acero A36` with the default E, so the reference
example acquires Fu even when its fixture omits it. The new fingerprint reports
`material[1].fu: no longer produced` against this reference. The old fingerprint could not.

These are reference-default differences, not evidence that deserialization removed an
original strength. Round 2 (#2091) constructs the reference from the release's fixture and
recorded default material and section, keeping the exact fingerprint. No strength is added to
old projects. No engine result or migration changed, so no results-version registry entry is
added. The material-consumer audit below identifies separate candidates for the coordinator;
this PR changes none of their design code and creates no advisory.

## Release-reference semantics (#2091)

`legacy-projects/release-defaults.json` records each release's complete default material and
section from `store/model.svelte.ts`, with its commit, store blob and fixture-loader blob.
The records were extracted from the git tags, independently of the saved projects. v0.2.0 and
v0.3.0 have no Fu; v0.4.0 records Fu. Section values come from those same source declarations,
not from the fixture's possibly unused default-section row.

`againstExample` always reads the release's fixture by its recorded blob, verifies its bytes,
and calls the shared `openExample` with the release identity. The typed options require an
explicit fixture for a release reference. Unknown releases or a mismatched recorded commit
refuse instead of using current defaults. The release loader retained default material 1 and
section 1 (adding a differently named fixture material/section under another id); their whole
records are installed from the release source, with sections resolved through the current
canonical section path. Complete replacement also removes future or unknown default fields.
No values are taken from the migrated project to build its reference.

The released combination-retention rule applies independently of whether fixture bytes changed.
Both sides solve through the current WASM path. Today's committed example snapshots cannot be
used as release references: fixture equality does not imply default equality. The model
fingerprint remains strict and independent, with no registry explanation allowed to excuse a
model difference. A future release must supply its own source records. General replay of an
arbitrary historical loader is outside this corpus correction; new loader behavior needs its
own explicit recorded rule and reproducer.

Seven new reproducer cases fail on round 2's parent without expected-failure markers; an
unchanged/deleted/increased/decreased saved-Fu control already passes there. The fixed oracle
passes these cases, the tower and edited-fixture judge controls, the original #1318 tests,
and all 187 legacy projects, plus the recorded session. The new tests also refuse releases on
both sides of the recorded range and simulate future strength and section default drift.

## Material-consumer audit (design code unchanged)

Comparing the Material interfaces at v0.2.0/v0.3.0 with v0.4.0 and current main identifies
three added fields: `fu`, `fc`, `timber`. None is supplied by `restore`: materials are copied
from the saved records. The 187-project material audit proves preservation of all supplied
fields, including additional historical properties.

| Field/path | Behavior for an absent field |
| --- | --- |
| Fu, CIRSOC steel verifier, optimiser, tables | `missingSteelInputs` reports `ultimateStrength`; shared `checkSteelMember` returns null before any steel/net-section check. The steel panel lists the missing input. No assumed Fu. |
| Fu, independent AISC member checker | The adapter omits `fu`; Rust `tension_capacity` returns gross yielding alone, without flagging rupture in `unevaluated`. This can read as a pass. Candidate requiring follow-up. |
| Fu, joint typologies | `joint-typology.ts:sectionOf` supplies 370 MPa (also Fy 240 MPa if absent). Shear tabs/splices/gussets consume the member Fu for bearing. The resulting typology has no assumption for this substitution. Candidate requiring follow-up. |
| Fu, tubular joints | `special-connections.ts:memberOf` uses catalogue Fu if a grade id exists, then stored Fu, then 370 MPa (Fy defaults to 240 MPa). The inferred Fu can satisfy the applicability check and produce checked capacities without an assumption warning. Candidate requiring follow-up. |
| Fu, aluminium | `material-check.svelte.ts` reads a declared catalogue grade's strengths, or reports an unsupported grade; it does not fill legacy steel Fu. |
| Fu, composite members | Steel `fu` is optional and not read by the implemented composite formulas. Stud `fu` is a separate connection input. |
| f'c | `concreteFc` reads explicit `fc`, otherwise the legacy stored `fy`. This preserves the old representation instead of inventing a strength. Concrete checks share this helper. |
| Timber references | No timber strengths are inserted into old materials. Timber identification uses the declared grade/reference; without that data, a legacy strength-based family inference is caveated. No new default timber reference is invented. |

Alpha, gradeId, aggregate size, spacing margin and shotcrete already existed in v0.2.0's
Material interface. They remain absent at restore: alpha is explicitly inferred by the thermal
adapter from family/E (unknown families leave it absent so the engine warns
`thermal_default_assumed`); gradeId is optional catalogue provenance; aggregate size uses a
provenanced assumption (`resolveMaxAggregateSize`); no spacing margin means zero; shotcrete
is opt-in. This correction changes none of these policies.

`legacy-material-consumers.test.ts` reproduces the CIRSOC refusal, concrete alias and the
three candidate paths with actual legacy material records and minimal geometry. These are
characterization tests, not claimed corrections. They also pass using origin/main's
`legacy.ts`; all design/loader code they reach is unchanged from origin/main (v0.6.0).
The root handoff records exact models, observed outputs and commands for filing the candidates.
No advisory is assigned here.
