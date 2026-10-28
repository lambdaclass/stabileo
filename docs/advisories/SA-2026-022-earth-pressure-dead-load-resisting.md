# SA-2026-022: with earth pressure (H), the combination where the dead load resists it was missing

| | |
|---|---|
| Severity | High |
| Status | Published 2026-10-28 (fixed in 0.4.0; live on stabileo.com since 2026-10-22) |
| Issue | [#580](https://github.com/lambdaclass/stabileo/issues/580) |
| Fix | PRs [#581](https://github.com/lambdaclass/stabileo/pull/581) and [#593](https://github.com/lambdaclass/stabileo/pull/593) (both merged 2026-10-22) |
| Affected versions | 0.2.0 and 0.3.0 |
| Re-check registry | entry `earth-pressure-dead-load-resisting` (models with CIRSOC combinations) |

## Affected features

The CIRSOC 101-2025 strength combinations (engine `cirsoc101_combinations.rs`, the app's
automatic combinations) for a model with **lateral earth or water pressure H**, from the soil
pressure of the automatic loads or from a load case of type H.

## What was wrong

CIRSOC 101-2025 §2.3.2 adds H to every combination: with 1,6 where it adds to the principal
variable load, and with 0,9 (permanent) or 0 where it opposes it. It also asks for the effects of
loads not acting. The generator dropped companion loads but never the principal one, and it
emitted combinations 6 and 7 (0,9 D + W, 0,9 D + E) only when the model had wind or earthquake.
So the check where **the dead load resists the earth pressure**, which is the governing one for
overturning and sliding of a retaining or basement wall, was never generated:

- 0,9 D + 1,6 H: 6 or 7 with the wind or the earthquake not acting;
- 1,2 D + 1,6 H: 2 with the live load not acting (also 4 and 5).

The set's lowest dead-load factor with H was 1,2 or 1,4, so an effect where D opposes H came out
low. Example: an effect where D gives −0,8 of what H gives (D resisting, no wind or earthquake):

| | Effect |
|---|---|
| Released (largest of 1,4 D + 1,6 H and 1,2 D + 1,6 L + 1,6 H, L not contributing) | 0,64 |
| Required (0,9 D + 1,6 H) | 0,88 |
| Released: 27 % low. With L also resisting (−0,3 of H), the released largest is 1,4 D + 1,6 H = 0,48: 45 % low | |

With wind in the model, 0,9 D + 1,0 W + 1,6 H was emitted but not without W, so where W also
resisted the effect, the same check was missing.

## How to tell if your results are affected

Your model has H loads (soil pressure on walls, or an H load case) and the dead load resists them
somewhere: overturning or sliding of a wall, uplift, a basement wall's reverse moment.

## Fixed in

#581 and #593 (merged and deployed to stabileo.com on 2026-10-22); released in 0.4.0. #581 drops the principal load too in every combination that has H (1,2 D + 1,6 H, and
0,9 D + 1,6 H from 6 and 7 when there is wind or earthquake). #593 emits
0,9 D + H all the same when the model has neither wind nor earthquake. The Rust generator and its
TypeScript oracle changed together. Tests: `loads_cirsoc.rs`
(`with_earth_pressure_the_principal_load_not_acting_is_generated`), `cirsoc101.test.ts` and the
oracle comparison over every subset of loads.

## Workaround

Add the combinations 0,9 D + 1,6 H and 1,2 D + 1,6 H by hand, or state in the project that H
opposes the principal load where it does.

## What to do with results you already have

Re-run models with H and check the walls' overturning, sliding and reverse-moment demands.

## Credits and references

Recorded as an open item of the loads verification (docs/verification/LOADS.md, "Loads not
acting, with H"), fixed by #581, and completed when this advisory was written (#593). CIRSOC 101-2025
§2.3.2.
