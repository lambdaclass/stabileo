# SA-2026-104: Member reversal could redirect distributed loads and analysis could omit planar point couples

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-21 |
| Issue | [#2268](https://github.com/lambdaclass/stabileo/issues/2268), [#2411](https://github.com/lambdaclass/stabileo/issues/2411) |
| Fix | PR [#2456](https://github.com/lambdaclass/stabileo/pull/2456), merged as `88a19d917` |
| Fixed release | Next release (0.6.4) |
| Affected versions | Confirmed in 0.6.3. Earliest affected release is unconfirmed |
| Re-check registry | [`member-load-orientation`](../../web/src/lib/provenance/result-changes/member-load-orientation.json), [`planar-point-load-projection-refusal`](../../web/src/lib/provenance/result-changes/planar-point-load-projection-refusal.json), [`planar-start-couple-without-projection`](../../web/src/lib/provenance/result-changes/planar-start-couple-without-projection.json), [`planar-point-couple-aliases`](../../web/src/lib/provenance/result-changes/planar-point-couple-aliases.json) |

## Affected features

Planar and spatial members reversed after distributed loads were applied,
including local axial loads and spatial loads in global or projected
axes. Also affected are legacy planar member point actions carried into
spatial analysis and planar couple records with a zero `my` and nonzero
`mz`, including in planar analysis.

## What was wrong

Reversing a member changes its local axial direction. The reversal
commands could keep the axial load ordinates in the old order and with
the old signs, reversing the applied physical force or placing a
varying load on the wrong end. They could also change the direction of
a global or projected transverse load. In the cantilever reproducer the
axial reaction changed sign after an end-for-end reversal.

Spatial analysis could drop a legacy planar point action if the member
had too little projection into the load plane. A cantilever parallel
to global Z gave a zero reaction moment even though the report listed
the applied couple. A zero `my` could also mask a nonzero `mz` in the
same record, removing the moment jump even on a member with a usable
projection. The solve could succeed without a warning.
[Member orientation and projection](../results-changes/2026-11-member-load-orientation.md),
[planar couple aliases](../results-changes/2026-11-planar-point-couple-aliases.md).

## How to tell if your model is affected

Compare distributed loads on reversed members with the original load
directions, loaded intervals and end ordinates. Check imported or saved
planar point actions on spatial members with a small or zero projection
in the original load plane. Check saved planar couple records for both
moment fields, particularly `my: 0` with a nonzero `mz`.

## Fixed in

Next release (0.6.4). PR [#2456](https://github.com/lambdaclass/stabileo/pull/2456)
preserves the physical load directions and profiles in both reversal
commands. The solver uses an unambiguous nonzero planar couple in
either field and refuses conflicting nonzero values. With insufficient
projection, it applies an unambiguous pure couple at the authored start
node and refuses actions that still need a projection.
[Start couples](../results-changes/2026-11-planar-start-couples.md).

## Workaround

Re-enter distributed loads using their intended physical directions
and end positions. For a spatial model, replace an unplaceable planar
action with an explicitly oriented spatial point load at the intended
position. Enter legacy planar couples in a single moment field and
verify that the saved load and the moment jump match the intended
couple.

## What to do with results you already have

Check and repair the saved loads before rerunning affected analyses and
combinations. Verify reactions and member forces against the intended
loading. Repeat dependent design checks and regenerate affected reports.

## Credits and references

See [PR #2456](https://github.com/lambdaclass/stabileo/pull/2456) for the
reversal, projection and moment-alias reproducers.
