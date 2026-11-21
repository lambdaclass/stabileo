# SA-2026-098: Concrete detailing checks could overstate the reinforcement provided

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-21 |
| Issue | [#2214](https://github.com/lambdaclass/stabileo/issues/2214), [#2271](https://github.com/lambdaclass/stabileo/issues/2271), [#2249](https://github.com/lambdaclass/stabileo/issues/2249), [#2245](https://github.com/lambdaclass/stabileo/issues/2245), [#2241](https://github.com/lambdaclass/stabileo/issues/2241), [#2239](https://github.com/lambdaclass/stabileo/issues/2239), [#2217](https://github.com/lambdaclass/stabileo/issues/2217), [#2349](https://github.com/lambdaclass/stabileo/issues/2349) |
| Fix | PR [#2398](https://github.com/lambdaclass/stabileo/pull/2398), merged as `0edca8799` |
| Fixed release | 0.6.3 |
| Affected versions | Confirmed in 0.6.2. Earliest affected release is unconfirmed |
| Re-check registry | [`rc-detailing-verification`](../../web/src/lib/provenance/result-changes/rc-detailing-verification.json), [`rc-drawn-joint-and-corner-verification`](../../web/src/lib/provenance/result-changes/rc-drawn-joint-and-corner-verification.json), [`rc-final-depth-drawing`](../../web/src/lib/provenance/result-changes/rc-final-depth-drawing.json) |

## Affected features

CIRSOC 201 verification of provided reinforcement and physical detailing
of concrete members. Review beam and wall transverse spacing checks,
beam anchorage and seismic hoop checks, and column drawings and schedules
with different corner and face bar diameters.

## What was wrong

Stirrup spacing checks could ignore the axial tension acting at the same
time as shear and accept spacing that was too large. An exact zero-moment
station could suppress an anchorage check at an inflection. A smaller bar
in a layer at the end of a beam could be missed when setting the seismic
hoop spacing limit.

A regional check could credit bars beyond their drawn cutoffs or miss a
weak stirrup interval. In the short-bar reproducer, the verifier credited
additional bottom bars at a section the bars did not reach. Mixed column
reinforcement could be drawn or scheduled with one diameter for the whole
cage, understating the steel specified for the column.

Torsion verification could overstate capacity or credit perimeter bars
without enough development at the cut. The concrete-only secondary shear
check could pass without confirming that qualifying bars occupied both
stirrup bends.

## How to tell if your model is affected

Review earlier passing checks on fixed or edited reinforcement. Look for
axial tension with shear, moment sign changes at zero-valued stations,
short bars, lap and cutoff zones, changes in the stirrup cage, or smaller
bars in end layers. Compare the generated column cage and lap schedule
with the specified face and corner bars.

## Fixed in

0.6.3. PR [#2398](https://github.com/lambdaclass/stabileo/pull/2398) checks
concurrent demands and drawn reinforcement and refuses verification where
the drawing cannot support it. Column schedules retain the actual bar
diameters, and physical detailing withholds geometry if it cannot reproduce
the cage. A final-depth check uses the replacement drawing when supplied.
[Verification](../results-changes/2026-11-rc-detailing-verification.md),
[bar development and corner seats](../results-changes/2026-11-rc-drawn-joint-and-corner-verification.md),
[replacement drawings](../results-changes/2026-11-rc-final-depth-drawing.md).

## Workaround

Rerun verification in 0.6.3. Where it refuses or an upgrade is unavailable,
verify the actual reinforcement and concurrent demands independently
before using a check, schedule or drawing.

## What to do with results you already have

Recheck affected reinforcement against the actual drawing and governing
forces. Review any earlier approval, capacity or utilization that relied
on these checks. Regenerate and review the affected drawings, schedules
and reports after verification.

## Credits and references

See [PR #2398](https://github.com/lambdaclass/stabileo/pull/2398) for the
reinforcement and demand reproducers and
[SA-2026-091](SA-2026-091-rc-torsion-shear-verification.md) for related
concrete verification refusals.
