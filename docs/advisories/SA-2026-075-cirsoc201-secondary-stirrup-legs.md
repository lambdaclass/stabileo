# SA-2026-075: CIRSOC 201 could accept insufficient secondary stirrup reinforcement

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-18; drafted 2026-11-18 |
| Issue | [#2171](https://github.com/lambdaclass/stabileo/issues/2171) |
| Fix | PR [#2308](https://github.com/lambdaclass/stabileo/pull/2308); released in 0.6.2 |
| Fixed release | 0.6.2 |
| Affected versions | Confirmed on origin/main `aa57c566c50daeeb74f651f253a066654a3f3825`. Historical release binaries have not been assessed. |
| Re-check registry | [`secondary-stirrup-legs`](../../web/src/lib/provenance/result-changes/secondary-stirrup-legs.json), [`secondary-shear-longitudinal`](../../web/src/lib/provenance/result-changes/secondary-shear-longitudinal.json) |

## Affected features

Spatial reinforced-concrete design and verification under CIRSOC 201-2005
and CIRSOC 201-2025 where secondary shear or torsion governs. Beams and
columns could pass with insufficient transverse reinforcement. The same
directional checks apply to rectangular wall members.

## What was wrong

The secondary shear check could count primary-direction stirrup legs as
secondary reinforcement. Extra crossties across the primary face could
therefore increase the reported secondary resistance even if only the two
perimeter legs resisted shear in that direction. The combined shear and
torsion check also used the primary width for the secondary face's minimum
transverse reinforcement. With zero secondary shear, the torsion check could
miss the applicable primary-face minimum. Some beam checks omitted the
standalone secondary shear result. These errors could leave a passing design
with no warning.

- **Secondary shear.** The issue's 300 × 600 mm column had four primary Ø8 legs
  at 100 mm spacing and 30 kN·m of concurrent torque. Main passed the
  secondary shear check at 220.235 kN in 2005 and 222.18 kN in 2025. The
  corrected fixture resolves Ø12 longitudinal bars, giving a secondary
  effective depth of 261 mm. The hand calculation with two secondary legs
  gives design shear strengths of 180.58 kN and 182.54 kN, respectively.
  Both checks fail. A separate 200 × 400 mm column with zero torque passed
  overall on main without a warning in both editions. The secondary demand
  was 1.05 times the hand-calculated capacity.
- **Torsion with zero secondary shear.** An 800 × 250 mm column with two Ø6
  legs and about 7.574 kN·m of torque passed both torsion and the overall
  check on main without diagnostics in either edition. The tested spacing
  was about 62.65049 mm in 2005 and 63.15574 mm in 2025, each 1.001 times
  the hand-calculated maximum from the combined transverse minimum. The
  corrected check fails there and accepts the companion cage at 0.999 times
  that maximum.
- **Effective depth.** In a 300 × 600 mm column with Ø32 longitudinal bars,
  25 mm cover and Ø8 stirrups, the secondary effective depth is
  300 − 25 − 8 − 32/2 = 251 mm. At 100 mm spacing the 2005 hand calculation
  gives 173.66439 kN with two secondary legs. Main used 259 mm and credited
  extra legs, reporting 261.27402 kN. A zero-torque demand of 1.001 times the
  hand capacity passed overall without diagnostics. The same secondary depth
  also affects the combined shear and torsion limit. In a separate beam
  case, supplying Ø6 stirrups in place of nominal Ø16 stirrups increased the
  hand-calculated primary depth from 551 mm to 561 mm. Main reported a
  utilization of 1.014 for a demand at 0.998 times the corrected section
  limit.

## How to tell if your model is affected

Review spatial concrete projects designed under either edition of CIRSOC 201.
Identify members with governing shear in the secondary local direction or
governing torsion, including torsion with zero secondary shear. Check the
legs actually present on each face, the stirrup spacing and the effective
depth from the provided stirrups and longitudinal bars. The saved-project
recheck notice selects spatial projects with concrete members
conservatively. Check the design code and governing demands to determine
which members need this review.

## Fixed in

0.6.2 (PR [#2308](https://github.com/lambdaclass/stabileo/pull/2308)).
The verifier uses the provided cage to resolve each face's width, effective
depth and stirrup legs. Secondary shear and combined torsion share the
resolved secondary face. Active torsion checks the combined minimum on each
participating face, including the primary face when secondary shear is zero.
Where the required cage or bar geometry is unknown, verification reports
that it cannot complete the check.

## Workaround

Until you can update, independently verify secondary shear and combined
shear and torsion using the provided cage, both section orientations and
the concurrent demands. Check the combined transverse minimum when torsion
is active, including when secondary shear is zero.

## What to do with results you already have

After updating to 0.6.2, reopen affected saved
projects and review the recheck notice. Re-run the reinforced-concrete
design and verification. Review the governing secondary shear and torsion
checks, the provided reinforcement and any drawings or calculations that
relied on an earlier pass.

## References

The [stirrup-leg results-change record](../results-changes/2026-11-secondary-stirrup-legs.md),
[effective-depth results-change record](../results-changes/2026-11-secondary-shear-longitudinal.md)
and [regression fixtures](../../web/src/lib/engine/__tests__/issue-2171-legs.test.ts)
document the models, hand calculations and limits.
