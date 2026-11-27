# SA-2026-131: Analysis could silently drop or misread structural input

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-26 |
| Issue | Input validation findings in [#2588](https://github.com/lambdaclass/stabileo/pull/2588) |
| Fix | PR [#2588](https://github.com/lambdaclass/stabileo/pull/2588), merged as `bcf4aab49` |
| Fixed release | the next release after 0.6.4 |
| Affected versions | Through 0.6.4. The direct combination, time-history and spatial stage decoders shipped by 0.2.0 (`addd0e94a`, `c57dfb7bb`, `7a6f0d0d7`, `0a53a08cb`). The same release shipped the direct planar constraint projection (`3b09dc11a`), member stiffness modifiers (`c435b094c`) and the spatial axial load field (`a0da54317`). Recorded support restraint masks shipped in 0.6.2 (`bc8a9a05b`). |
| Re-check registry | [`malformed-structural-input`](../../web/src/lib/provenance/result-changes/malformed-structural-input.json), [`reduced-planar-mpc`](../../web/src/lib/provenance/result-changes/reduced-planar-mpc.json), [`xy-constraint-projection`](../../web/src/lib/provenance/result-changes/xy-constraint-projection.json), [`stored-project-input`](../../web/src/lib/provenance/result-changes/stored-project-input.json), [`ambiguous-engine-tables`](../../web/src/lib/provenance/result-changes/ambiguous-engine-tables.json) and [`staged-unknown-fields`](../../web/src/lib/provenance/result-changes/staged-unknown-fields.json) |

## Affected features

Basic and PRO analysis of malformed authored or restored models,
and native JSON and WASM analysis of malformed solver requests.
The affected paths include direct planar constraint projection, load
combinations in both dimensions, planar and spatial time histories,
and spatial construction stages. Check saved files and integration
inputs, including requests used to generate result certificates.

## What was wrong

Some input readers ignored unknown fields or defaulted malformed values
before analysis. The solver then returned results for the model it had
received after decoding. A typo in `dofs` could make a rigid link use
its default restraints. A misspelled support mask could also restrain
a translation that was supposed to be free. A misspelled member
stiffness modifier could leave nominal stiffness in use. A supplied
nonzero `rhs` on a homogeneous multipoint constraint could be ignored.
The direct planar path could drop an entire equation when it contained
terms outside the plane, even if those terms cancelled and left an
in-plane restraint. The XY projection could also use the normal
offset of an eccentric connection as an in-plane offset.

Repeated keys in saved or solver tables could replace a structural
record. The connector reproduction returned the response from only the
last connector, omitting the other connector's stiffness. A WASM
quadrilateral with an extra connectivity entry could also be solved
using only the first four nodes. In the spatial distributed-load
reproduction, `qXi` in place of `qXI` omitted the start axial intensity.

In the direct 2D and 3D combination regression, a request carrying
`method: "SRSS"` returned the signed sum of the case reactions without
warning. The tested reactions of −3 and +4 gave +1, while their
root-sum-square magnitude is 5. An unknown authored combination method
could also fall back to a linear sum. A repeated combination ID could
replace the earlier result.

In the time-history regressions, ground acceleration sent using the
other dimension's fields produced the same result as omitted ground
motion. Using the intended field changed the peak displacements. A 3D
construction stage using `loadsIndices` instead of `loadIndices`
likewise returned the unloaded response. The minimal staged replay
returned zero tip displacement for the typo and a positive displacement
with the intended loads active.

[Structural input results-change record](../results-changes/2026-11-malformed-structural-input.md),
[ambiguous engine tables](../results-changes/2026-11-ambiguous-engine-tables.md),
[stored project input](../results-changes/2026-11-stored-project-input.md)
and [unknown stage fields](../results-changes/2026-11-staged-unknown-fields.md).

## How to tell if your model is affected

Inspect the inputs that were actually used, including the original
saved file or request sent by an integration. Compare structural
fields, restraint masks, releases, stiffness modifiers, connectivity
and load components with the intended model. Check for repeated
table keys and combination IDs. Verify that the selected combination
method is supported by the entry point, the ground motion uses the
fields for the analysis dimension, and the intended loads are active
at each construction stage. Check direct planar constraints against
the chosen drawing plane.

## Fixed in

The next release after 0.6.4. PR
[#2588](https://github.com/lambdaclass/stabileo/pull/2588) validates
these fields before applying defaults or assembling the model. It
reports invalid or unsupported input and repeated keys. The shared
planar constraint conversion reduces terms on the same degree of
freedom before projection and refuses a remaining cross-plane coupling.
XY uses its own axis mapping for eccentric offsets.

## Workaround

Check the original input against the documented fields for the chosen
analysis and use distinct identifiers. Use an analysis entry point that
supports the intended combination method. Verify the effective supports,
constraints, load cases, ground motion and stage load lists against
the intended model.

## What to do with results you already have

Correct affected inputs and rerun the applicable analyses, combinations,
time histories and construction stages. Regenerate any certificates
and envelopes based on those analyses, repeat dependent design checks
and update reports.

## Credits and references

See [PR #2588](https://github.com/lambdaclass/stabileo/pull/2588), the
[authored-input regressions](https://github.com/lambdaclass/stabileo/blob/bcf4aab49/web/src/lib/engine/__tests__/authored-structure-input.test.ts),
the [WASM wire regressions](https://github.com/lambdaclass/stabileo/blob/bcf4aab49/web/src/lib/engine/__tests__/canonical-model-wire-aliases.test.ts)
and the [native decoding and staged regressions](https://github.com/lambdaclass/stabileo/blob/bcf4aab49/engine/src/reproduce.rs).
