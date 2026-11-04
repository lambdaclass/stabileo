# SA-2026-009: Solid shell (SHB8-ANS) about 22 % too stiff in thin-plate bending (deflections about 18 % low)

| | |
|---|---|
| Severity | Medium (serviceability; higher where solid-shell plates carry load in indeterminate systems) |
| Status | Published 2026-10-21 (fixed in 0.3.0; live on stabileo.com since 2026-10-19) |
| Issue | [#400](https://github.com/lambdaclass/stabileo/issues/400) |
| Fix | PR [#401](https://github.com/lambdaclass/stabileo/pull/401) (merged 2026-10-19) |
| Affected versions | every version with the SHB8-ANS solid shell, up to 0.2.0 and `main` until the fix |
| Re-check registry | to add with the fix |

## Affected features

The 8-node solid-shell element (SHB8-ANS) in bending: deflections, and the moment distribution in
indeterminate structures that mix solid shells with other elements.

## What was wrong

Poisson thickness locking: the trilinear field gives a thickness strain constant through the
thickness, so bending carries a spurious σzz and the plate rigidity is E(1−ν)/((1+ν)(1−2ν)) instead
of E/(1−ν²), **1.225× too stiff at ν = 0.3**. On a simply supported plate (t/a = 0.01) the centre
deflection stayed at 0.80–0.82 of the exact value under mesh refinement. Deflections were
underestimated (unconservative for serviceability) and stiffer solid-shell regions attracted more
moment. The benchmark tolerance in the test suite was wide enough to hide it.

## How to tell if your model is affected

The model uses solid-shell elements in bending (plates, slabs, walls out of plane), especially thin
ones (t/L below about 0.05). Models without solid shells are not affected; MITC4, MITC9, DKT and the
curved shell are not affected by this defect.

## Fixed in

`main` (#401, merged and deployed to stabileo.com on 2026-10-19); released in 0.3.0.

## Workaround

Use MITC4 or MITC9 shells for thin plates and slabs, or multiply solid-shell bending deflections by
about 1.22 (ν = 0.3) as an estimate and check against a shell model.

## What to do with results you already have

Re-check deflection and vibration conclusions for models with solid-shell plates.

## Credits and references

Found by the discretization-error work (PR #327) on the Navier plate.
