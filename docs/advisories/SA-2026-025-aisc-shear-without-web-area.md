# SA-2026-025: AISC 360 G2 shear passed at ratio 0 when the web area was not given

| | |
|---|---|
| Severity | Medium (engine and WASM API only; any shear demand passed, and the certified check certified the member) |
| Status | Published 2026-11-07 (fixed in 0.5.0) |
| Issue | — (internal review, 2026-11-02) |
| Fix | PR [#1234](https://github.com/lambdaclass/stabileo/pull/1234) (merged 2026-11-03), released in v0.5.0 |
| Affected versions | from 2026-08-05 (8c26b5c42, the G2 check) to `main` until the fix; the certified check since it covered G2 |
| Re-check registry | not needed: the app always sends the web area |

## Affected features

The AISC 360 member check (`check_steel_members`) and its certified twin (`certify_steel_members`,
and the 2D/3D end-to-end certified steel checks) when a member's `aw` is absent or not positive.
The app's AISC 360 check under PRO "other codes" sends `aw` = h·tw (or 2·h·t, A/2 for tubes) for
every section it checks, so results obtained in the app are not affected.

## What was wrong

With no web area, φVn was 0 and the shear ratio was written as
`if phi_vn > 0 { vy / phi_vn } else { 0 }`: 0 under any shear, so the member could pass on
the other checks and the G2 check did not appear among the unevaluated ones. The certified
check used the same branch, so `certify_steel_members` returned `certified_ok: true` for a
member it had not checked in shear. Example: W14x22 (d = 348 mm, tw = 5.84 mm), Fy = 345 MPa,
no `aw`, Vu = 400 kN, Mu = 10 kN·m: shear ratio 0 and nothing unevaluated, where
φVn = 0.9·0.6·Fy·d·tw = 0.9·0.6·345·348·5.84 N = 379 kN gives 1.06 (AISC 360-22 G2-1,
Cv1 = 1, φv = 0.9 as the checker takes it).

## How to tell if your model is affected

You called the engine or WASM `check_steel_members` or `certify_steel_members` with a member
that has no `aw` (or `aw` ≤ 0) and a non-zero `vy`.

## Fixed in

0.5.0 (PR #1234). The G2 ratio goes through the check ledger in both paths
(`ratio_if_loaded`, `loaded_ratio`): with shear and no web area, `Shear G2` is listed in
`unevaluated`, the governing check is marked incomplete, and the certified check refuses
the member. Zero shear is still "not applicable". Pinned by
`certify::design::tests::aisc_shear_without_web_area_is_unevaluated_in_both_paths` and
`design_check_limit_states::aisc_shear_without_web_area_is_unevaluated_not_passed`.

## Workaround

Send `aw` (d·tw for an I, 2·h·t for a rectangular tube).

## What to do with results you already have

Re-check in shear any member checked through the API without `aw`.

## Credits and references

Found by an Antigravity CLI (Gemini) review of `main` at f54395d (2026-11-02) and confirmed
against the code. AISC 360-22 G2.1.
