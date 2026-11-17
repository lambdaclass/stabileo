# Generation refusals hold member and document verdicts (2026-11-17)

A provided cage can pass its local strength checks while its physical detailing
cannot generate or verify all of its reinforcement. The member verdict and the
document readiness gate previously recognized anchorage, cover, clashes and
splice refusals, but omitted generation refusals. A generator warning therefore
did not prevent a member from reading as approved on the desk, viewport,
memoria, workbook or IFC.

Both consumers now use `isDraftOnlyIssue`. In addition to the existing blockers,
it accepts every `detailing.generation.*` refusal, legacy `generation` conditions
and `memberNoBars`. Scoped members remain held even with passing section checks;
a document containing these conditions remains a draft even if its persisted
assembly state claims it was reviewed or issued. Clearing the condition restores
the original verdict. Other members retain their answers.

## Recorded fixture

The existing slab-free span fixture, with its 400 mm square columns, generates
beam cages with four declared secondary legs for members 5, 7, 10 and 12, among
others. `generate-beam.ts` explicitly reports
`detailing.generation.beamSecondaryLegs`: the required horizontal crossties are
not generated. This is not proof of a complete physical cage.

The fixture has no open laps. Its former lap assertions missed the generation
refusal and consequently never exercised the surfaces for these members.
After independently collecting the actual generation conditions, the test
reports 82 surface violations on parent `1d5698282`. The fix removes all of
them. Members 5, 7, 10 and 12 change from `warn` to `fail` with a detailing
hold; members 18, 20, 23 and 25 change from `ok` to the same held state. Member
8 remains refused. Local section results and the solved forces are unchanged.

Replaying only the pre-round-20 torsion module gives identical selected cages
and generation refusals. The round-20 directional torsion minimum is not the
cause of these missing lap holds. The secondary leg distribution remains
subject to CIRSOC 201-2025 [§9.7.6.2.2](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-9-vigas.md#c9.7.6.2.2);
passing a strength check does not supply crossties the generator cannot produce.
No engineering limit, tolerance, baseline or local strength assertion changes.

The same predicate covers beam and column refusals in both analysis modes;
it is independent of whether the saved solve was linear or nonlinear. The
policy runs in TypeScript after structural analysis; there is no native Rust
member-verdict or document-readiness implementation. Tests retain all existing
surface checks, exercise scoped holds and clearing them, and cover document
states on both sides of the readiness gate. Clean cages keep their answers.

## Batch preview

A support batch edit also updates explicit start and end overrides on this
branch. Previously its summary compared only the support default. An unchanged
default could hide a real change to a denser end cage. The preview now compares
each explicit end through the same stirrup comparison as the default and span.
It reports the changed end and counts the member as changed. Unselected fields,
absent ends and genuinely identical cages retain their existing behavior.
This preview correction does not change the engineering verification formula.

## Exposure

The structured directional generation refusals and the batch propagation to
explicit support ends were added on this branch. Main already reports other
legacy generation warnings in assemblies, so this work does not establish a
silent wrong numerical result on main or a release. No new advisory is assigned
or created here. The existing SA-2026-075 text is corrected to describe the
round-20 torsion minimum already included in this branch.
