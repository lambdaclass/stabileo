# The public slab gallery uses hard simple supports on walls

This retrospectively registers [PR #1627](https://github.com/lambdaclass/stabileo/pull/1627),
merged on 2026-11-07. The public `slab-on-columns` gallery with walls selected
changed both its generated model and its displayed independent reference. This
is an intended example correction, not a same-input engine regression.

The old demo restrained vertical motion only. Its new hard simple boundary
also restrains `rrx` on the two constant-x edges and `rry` on the two constant-y
edges. The reference changes from the Kirchhoff Navier series to the
Reissner–Mindlin series with the shear term implemented in `mindlinCentre`.
The PR traces that series to the repository's Navier-plate research benchmark
and reports that its author could not verify the cited books' section or
equation numbers. This registration does not claim that missing source check
has since been performed.

For the audited walls boundary (`supports=1`, `bays=2`, `spacing=6`,
`thickness=0.22`, `load=8`), the archive records:

| Output | Before | After |
| --- | ---: | ---: |
| Maximum deflection, mm | 24.440127814642093 | 24.307234116900524 |
| Displayed reference, mm | 24.302769941419953 | 24.339803852876383 |
| Span / deflection | 490.9957955625254 | 493.6801917605486 |

Both runs solve. The newer engine value differs from its newer reference by
about 0.134%; this is within the existing 2% assertion. Changing the restraints
explains the deflection movement; including transverse shear explains the
reference movement. The PR's hard-support, shear-term and thick-slab tests
remain intact. The exact corpus now freezes the full public gallery outcome
for both wall and column selections. Presentation-only legends elsewhere in
#1627 are not assigned this numerical explanation.

The condition `gallery:slab-on-columns:walls` is supplied only by this gallery
capture, together with `analysis:linear`. `modelFeatures` never infers it from a
saved model. Thus `gallery-slab-hard-walls` matches the walls gallery boundary,
excludes the columns selection and cannot excuse engine drift in a saved shell
project. Its quantities cover gallery readouts, views and certificate, which
all appear in the archived transition. This avoids using the bundled-example
scope, which requires a bundled fixture and a two-engine equivalence proof and
did not support a generated public gallery. That existing proof is unchanged.

The old gate had no corpus case for this generated demo and the PR explicitly
omitted registration because the bundled-example scope rejected it. The new
exact gallery capture brings its frozen outcome into the same registration
gate. Saved models retain their original inputs and receive no recheck notice
for this demo correction. No solver result or safety advisory is changed here.

The exact wall-gallery freeze is recorded with the pinned Node 22 runtime.
Round 3 corrects its displayed reference from `24.339803852876386` mm to
`24.339803852876383` mm, matching both that runtime and the audit archive above.
Every other frozen field is unchanged. This repairs the capture; the formula,
engine output, registration scope and exact equality assertion are unchanged.
