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
fail. The root handoff records commands, outcomes and the remaining corpus failures.

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
original strength. The existing corpus assertions remain strict and fail on those differences;
this change does not add a strength to old files or suppress the comparison. Resolving the
reference's historical defaults requires a separate reviewed change. No engine result or
migration changed here, so no results-version registry entry or safety advisory is added.
