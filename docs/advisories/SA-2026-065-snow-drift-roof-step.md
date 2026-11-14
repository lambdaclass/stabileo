# SA-2026-065: Snow drift omitted at a roof step over a pitched lower roof

| | |
|---|---|
| Severity | High |
| Status | Draft 2026-11-13; local correction in integration PR #2081, pending review and release |
| Issue | [#2082](https://github.com/lambdaclass/stabileo/issues/2082) |
| Fix | Integration PR [#2081](https://github.com/lambdaclass/stabileo/pull/2081); pending review and release |
| Affected versions | Source-confirmed in 0.2.0–0.5.0 and desktop-v0.1.0-alpha.1–alpha.3; wrong result replayed on main `b6f13f250` |
| Re-check registry | [`snow-lower-roof-step`](../../web/src/lib/provenance/result-changes/snow-lower-roof-step.json) |

## Affected features

**Generated CIRSOC 104 snow on lower roofs beside modeled height steps.** A
pitched receiving roof can require drift even where a flat-roof snow-depth
comparison says no drift is required. Clear height can also change along the
step as either roof rises. Generated snow loads, combinations and structural
results derived from those loads need review. A satisfactory structural solve
cannot detect snow that was omitted before the solve.

The related surcharge placement defect can omit sliding snow on a pitched
receiving roof. Flat and pitched roofs in the same model, several steps and
steps at an angle to the model axes require local roof geometry. The error is
not limited to a particular solver or dimension: it occurs during snow-load
generation, before loads reach a linear or nonlinear analysis.

The ASCE 7 adapter does not implement §7.7 step drift or sliding snow. The
Eurocode adapters, including the UK variant, do not implement the μ2/μ3 step
cases or sliding snow. TS 498 also generates uniform snow only. These adapters
already emit explicit omission warnings; those warned omissions are **not**
additional silent findings under this advisory. They still require independent
loads and are not implemented by this correction. Hand-entered snow and models
without roof steps are outside the modeled-step finding.

## What was wrong

The drift reader used one flat-roof balanced pressure to calculate snow depth,
and subtracted the elevations of level panel outlines for the step height.
Neither quantity represents a pitched receiving roof. A separate elevation
filter compared each surcharge band to a member's mean elevation, which could
exclude a pitched member even when it lay on the receiving surface. A rafter
on the boundary of a higher roof could also supply the lower panel's slope.

The retained witness is a gable roof with 20° slopes, a 1 m horizontal
eave-to-ridge distance and an adjoining flat roof 0.45 m above the lower eave.
The higher roof is beside the gable's end, rather than over either sliding eave.
The [reproducer](../../web/src/lib/engine/loads/__tests__/snow-drift-audit.test.ts)
retains its geometry and literal hand expressions.

For pg = Ce = Ct = I = 1, the applicable gable minimum gives pf = 1 kN/m².
The slope factor Cs = (70 − 20)/65 gives ps = 0.7692307692307693 kN/m².
CIRSOC equation (4) gives γ = 0.426 × 1 + 2.2 = 2.626 kN/m³.
Thus hb = ps/γ = 0.29292870115413905 m and hc = 0.45 − hb
= 0.15707129884586096 m. The ratio hc/hb exceeds 0.2, so §7.1
requires drift. The retained Figure 9 ordinate at this ground load and minimum
fetch is hd = 0.381 m, exceeding hc. The local balanced-plus-drift peak is
therefore ps + γ hc = γ × 0.45 = **1.1817 kN/m²**.

| Source | Lower-roof balanced snow, kN/m² | Drift decision at the eave | Local balanced-plus-drift peak, kN/m² |
|---|---:|---|---:|
| Main `b6f13f250` | 1.000000 | Incorrectly omitted | 1.000000 |
| Integration before #2082 correction | 0.769231 | Incorrectly omitted | 0.769231 |
| Corrected local calculation | 0.769231 | Required, capped at hc | 1.181700 |

Main returns a READY load plan with no blocked keys. Its general panel
limitations notice does not identify this missing step drift. The output
explicitly records a no-drift decision. This is a silent unconservative result
from the existing main generator; the defect predates the panel-slope change
in #1929. Regenerating with that slope change alone does not repair it.

The ordinate is the repository's existing reading of Figure 9's vector paths,
not a new independent digitization. The peak calculation needs only hd > hc;
the correction does not change those curve ordinates. The retained replay
[evidence](replays/SA-2026-065.json) records the main observation, hand values
and source/tag checks. These pressures describe a synthetic load-generation
witness, not recommended design loads or a bound on error for other roofs.

### Release boundary

The step-drift/sliding path was introduced by `2da26afa3` on 2026-10-01.
The explicit flat-roof snow-depth reference appears in `e011193a1` on
2026-10-05. The following tags all retain the flat-depth reference, the
level-only step height and the mean-elevation band filter:

| Release tags | Affected source |
|---|---|
| v0.2.0, v0.3.0 | All three assumptions present |
| v0.4.0 | All three assumptions present |
| v0.5.0 | All three assumptions present |
| desktop-v0.1.0-alpha.1, alpha.2, alpha.3 | All three assumptions present |

This is a source/tag boundary, not a replay of historical release binaries or
proof that every model ran without other warnings in every release. The exact
wrong pressure above was replayed using main `b6f13f250` sources. No corrected
release or deployment is claimed. Release records: [0.2.0](../releases/v0.2.0.md),
[0.3.0](../releases/v0.3.0.md), [0.4.0](../releases/v0.4.0.md),
[0.5.0](../releases/v0.5.0.md).

## How to tell if your results are affected

Inspect lower roofs beside a higher roof, including mixed pitched/flat roofs
and each separate height step. Check the balanced pressure and snow depth of
the receiving roof itself. Measure the upper surface above that receiving
surface along the entire step, including the eaves and ridges. Review the
hc/hb cutoff, the cap on hd and the resulting surcharge width locally. Also
check sliding snow from higher pitched roofs onto lower receiving surfaces.

The saved-project notice selects generated snow carried by lower roofs at
modeled steps. Higher-roof-only snow, manual loads, non-snow generated loads
and roofs without modeled steps do not select it. The notice cannot reconstruct
past geometry, deleted carriers or independently supplied code cases; absence
of a notice is not proof that old snow loads were correct.

## Fixed in

The local correction for #2082 is on integration PR #2081, pending review and
release. The shared roof-surface reader supplies slopes and local elevations;
a shared step reader identifies the receiving roof and shared edge. Every
implemented modeled-step drift goes through a balanced-pressure reader indexed
by its receiving panel and a local clear-height calculation. Surcharge bands
belong to receiving panels, and pitched members are sampled at their actual
local elevation. Sliding fetch is restricted to the connected source rafters,
and the receiving surface is checked locally against the source eave.

Regressions retain the witness, both sides of hc/hb = 0.2, hd above and below
hc, flat/pitched receivers, reversed mixed roofs, several steps, rotation,
sliding and correct no-step controls. Both the direct generator and load-plan
entry are covered. ASCE, Eurocode and TS 498 retain tested explicit omissions.
The correction does not add those code implementations or alter tolerances.

## Workaround

Independently calculate and supply the complete snow cases required by the
applicable code, including step drift and sliding onto lower roofs. Use an
independently verified calculation or solver for the actual roof geometry.
Do not use the old no-drift decision, or its generated balanced pressure, as
proof that a lower roof needs no surcharge. Retain the other codes' omission
warnings until the missing code cases have been supplied independently.

## What to do with results you already have

Review the snow geometry and code cases first. With the corrected version,
regenerate affected CIRSOC snow loads, then solve again and re-check dependent
forces, deflections, combinations, design checks and issued deliverables.
Re-solving with stale generated snow does not repair the input load omission.
For the other adapters, independently supply the omitted cases before solving.

## Credits and references

Issue #2082 follows the independent roof-slope audit during integration #2081.
The coordinator assigned SA-2026-065. CIRSOC 104-2005 Chapters 3, 4, 7 and 9
supply the hand calculation and surcharge rules. The
[results-change write-up](../results-changes/2026-11-snow-roof-step.md)
describes the shared implementation and saved-project selection.
