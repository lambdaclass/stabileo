# SA-2026-026: EC3 6.2.6 took Av = 0.5·A when the shear area was not given (57 % high for HEB 300)

| | |
|---|---|
| Severity | Medium (engine and WASM API only; Vpl,Rd up to 57 % high on rolled I and H sections, and certified) |
| Status | Draft |
| Issue | — (agy review draft b1, 2026-11-02) |
| Fix | PR [#1234](https://github.com/lambdaclass/stabileo/pull/1234) |
| Affected versions | from 2026-03-08 (e1226b70e, the EC3 module) to `main` until the fix |
| Re-check registry | not needed: the app always sends `av` |

## Affected features

The EN 1993-1-1 member check (`check_ec3_members`) and its certified twin
(`certify_ec3_members`) when a member's `av` is absent. The app's EN 1993-1-1 check under PRO
"other codes" sends `av` = h·tw (2·h·t, A/2 for tubes), below the 6.2.6(3) area of a rolled
section, so results obtained in the app are not affected.

## What was wrong

A missing shear area was replaced by 0.5·A ("approximate if not given"). For rolled I and H
sections the 6.2.6(3)(a) area is much smaller, so Vpl,Rd was overstated, and the certified
check certified that capacity as a bound:

| Section | A (cm²) | Avz, published (cm²) | 0.5·A (cm²) | Vpl,Rd overstated by |
|---|---|---|---|---|
| HEB 300 | 149.1 | 47.43 | 74.55 | 57 % |
| IPE 300 | 53.81 | 25.68 | 26.91 | 5 % |

Published Avz: ArcelorMittal, *Sections and merchant bars* catalogue. From 6.2.6(3)(a),
Av = A − 2·b·tf + (tw + 2r)·tf: HEB 300, 149.1 − 2·30·1.9 + (1.1 + 2·2.7)·1.9 = 47.45 cm²;
IPE 300, 53.81 − 2·15·1.07 + (0.71 + 2·1.5)·1.07 = 25.68 cm².

## How to tell if your model is affected

You called the engine or WASM `check_ec3_members` or `certify_ec3_members` with a member that
has no `av` and a non-zero `vEd`.

## Fixed in

`main` (PR #1234). Without `av`, Av comes from `geometry` by EN 1993-1-1 6.2.6(3) with η = 1:
(a) for a rolled I or H (r > 0, not less than hw·tw), (d) hw·tw for a welded one (r = 0), the
lower of (f) A·h/(b + h) and (d) 2·hw·t for a rectangular hollow section, and (g) 2A/π for a
circular one. With neither `av` nor usable geometry, a loaded `Shear 6.2.6` is unevaluated and
the certified check refuses the member. Pinned by
`certify::design::tests::ec3_heb300_without_av_uses_the_rolled_shear_area_not_half_of_a`,
`ec3_ipe300_without_av_matches_the_published_shear_area` and
`ec3_shear_without_av_or_geometry_is_unevaluated_in_both_paths`.

## Workaround

Send `av`, or `geometry` with the root radius.

## What to do with results you already have

Re-check in shear any member checked through the API without `av`, in particular rolled H
sections.

## Credits and references

Found by an Antigravity CLI (Gemini) review of `main` at f54395d (2026-11-02) and confirmed
against the code. EN 1993-1-1:2005 6.2.6(3).
