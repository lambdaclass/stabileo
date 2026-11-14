# SA-2026-050: Buckling could turn a failed slenderness calculation into zero, and multi-case analysis could return non-finite values in a successful result

| | |
|---|---|
| Severity | Medium |
| Status | Published 2026-11-09 (fixed after 0.5.0; live on stabileo.com since 2026-11-09) |
| Issue | [#1759](https://github.com/lambdaclass/stabileo/issues/1759), [#1761](https://github.com/lambdaclass/stabileo/issues/1761) |
| Fix | PR [#1784](https://github.com/lambdaclass/stabileo/pull/1784) (merged 2026-11-09 01:53:37 UTC) |
| Fixed release | 0.6.0 (2026-11-13) |
| Affected versions | Current main before this change (engine version 0.5.0); the first affected version has not been bisected |
| Re-check registry | results-change entry `non-finite-analysis-results` |

## Affected features

- **2D and 3D buckling, engine/WASM API:** per-member effective length and slenderness when a
  truss section has non-positive inertia. Frame sections were already checked for positive
  inertia; truss sections were exempt even though buckling reads their inertia too.
- **2D and 3D multi-case static analysis, engine/WASM API:** a finite model and finite loads whose
  calculations overflow could produce a successful result containing NaN or infinity.
- The findings were produced by fuzzing custom engine inputs. No claim is made that the app's
  standard section catalog produces non-positive inertia.

## What was wrong

In #1759, the minimized 3D truss model had negative `iy`. Buckling returned `Ok` with NaN
`k_effective` and `effective_length`. `slenderness_y` was reported as `0.0` because the radius of
gyration failed the positive-radius guard; `slenderness_z` was NaN. A zero slenderness is not a
valid substitute for an undefined calculation.

In #1761, the minimized multi-case input was finite, but its downstream calculations overflowed.
The multi-case solver returned the resulting non-finite values inside `Ok` instead of refusing the
result.

## How to tell if your results are affected

Your results are affected if either applies:

- a buckling result used custom truss-section properties with zero or negative `iy` or `iz`, or its
  per-member output has NaN, infinity or an unexplained zero slenderness;
- a multi-case result contains NaN or infinity, including a value serialized as `null` by JSON.

The re-check registry entry `non-finite-analysis-results` flags saved member models that use buckling
or combinations, and declares only refusals (`solve.ok`). That condition is deliberately wider than
the invalid inputs above; most flagged projects produce identical finite results.

## Fixed in

After 0.5.0; live on stabileo.com since 2026-11-09.

Buckling validates every member section whose inertia it reads, including trusses. The
radius-of-gyration and slenderness path returns an error when it cannot produce a finite resolved
value instead of substituting zero. Buckling and all prepared/per-case 2D/3D multi-case return paths
also run the existing non-finite-result refusal before returning.

Regression tests: `issue_1759_buckling_rejects_negative_truss_inertia` (2D and 3D negative inertia,
unresolved radius of gyration and overflowing buckling output) and
`issue_1761_multi_case_overflow_is_refused` (prepared and settlement-triggered per-case 2D/3D paths)
in `engine/tests/fuzz_regressions.rs`. Both failed on `Ok` before the fix and pass by returning the
intended error after it. The fail-closed lint now also covers `engine/src/solver/buckling.rs`.

## Workaround

On an affected version, reject non-positive section inertia before running buckling and do not use
any buckling effective length or slenderness produced from such a section. Check every multi-case
number for finiteness before using it; discard the whole result if any value is NaN or infinite.

## What to do with results you already have

Re-run affected buckling and multi-case analyses in the fixed version. Do not use a zero slenderness
or any non-finite value from an older result. If a saved project used custom section properties or
extreme loads, review its inputs and all derived design work even if JSON displays an affected number
as `null`.

## Credits and references

Found by nightly JSON fuzzing in #1759 and #1761 (run linked from those issues). The minimized
inputs are preserved under `engine/fuzz/regressions/`.
