# SA-2026-028: EN 1992-1-1 flexure assumed the tension steel yields and did not iterate the compression steel

| | |
|---|---|
| Severity | High |
| Status | Draft |
| Issue | [#534](https://github.com/lambdaclass/stabileo/issues/534) |
| Fix | PR [#1236](https://github.com/lambdaclass/stabileo/pull/1236) (not yet merged) |
| Affected versions | the engine check from 2026-03-08 (ba0e683db, by source history; not bisected by running); in the app from 2026-09-25 (69f9f34b1, PRO other codes), certified from 2026-10-15 (f6f9ea3b7); 0.2.0, 0.3.0 and 0.4.0; `main` until the fix |
| Re-check registry | `ec2-flexure-strain-compatibility`, results version 12 (models with concrete members) |

## Affected features

The EN 1992-1-1 6.1 flexural resistance MRd of `engine/src/postprocess/ec2_check.rs`:

- PRO, design, **other codes → EN 1992-1-1** on concrete beams, its verdict and its certified
  utilization (`check_ec2_members`, `certify_ec2_members` through WASM). The app sends the top
  bars as compression steel (`asCompression`, `dPrime`);
- the engine/WASM API functions `check_ec2_members` and `certify_ec2_members`.

The EN 1992-1-1 design bound as the project's concrete code (`engine/design/eurocode/`) is a
separate TypeScript implementation that limits x/d so the tension steel yields; it is not affected.
CIRSOC 201 and ACI 318 were fixed the same way in 2026-10 (`cirsoc201-strain-compatibility`,
`aci318-strain-and-axial`) and are not affected.

## What was wrong

MRd came from a closed form instead of strain compatibility:

1. the tension steel was taken at fyd whatever its strain. On a beam whose neutral axis is past
   x = εcu3/(εcu3 + εyd)·d ≈ 0.62·d the steel is still elastic and MRd was too high;
2. with top bars, their strain was read at the singly reinforced neutral axis and x was
   recomputed once from it. The top-bar stress had no lower bound (it reached several times fyd in
   tension when x < d'), and with As' ≈ As the recomputed x was zero or negative (lever arm ≥ d);
3. εcu3 was 3.5 ‰ for every class (Table 3.1 lowers it above C50/60).

**Unconservative.** In a sweep of rectangular beams C20/25 to C50/60, ρ ≤ 4 %, MRd was up to 21 %
high on singly reinforced beams and up to 22 % with top bars, and the beam passed (and was
certified OK) on that capacity.

| 250 × 400 mm, d = 350 mm, C25/30, B500, As = 2500 mm², no top bars | Correct (after the fix) | Before the fix |
|---|---|---|
| Neutral axis x | 240.1 mm (σs = 320 MPa < fyd = 435 MPa) | 326.1 mm (σs = fyd assumed) |
| MRd | 203.28 kN·m | 238.66 kN·m |
| MEd = 220 kN·m | 1.08, fails | 0.92, passes (certified OK) |

The correct value is the closed-form root of η·fcd·λ·b·x = As·Es·εcu3·(d/x − 1) (EN 1992-1-1
3.1.7, 3.2.7), and the CIRSOC 201 strain-compatibility check gives the same MRd on the same
physical section (`engine/tests/integration/ec2_strain_compatibility.rs`).

## How to tell if your model is affected

You ran PRO → other codes → EN 1992-1-1 on concrete beams, and a beam is heavily reinforced
(x/d above about 0.6: ρ above about 2 % for C25/30 with B500) or has top bars. Lightly reinforced
beams without top bars got the right MRd. The registry notice is shown to every project with
concrete members, because the other-codes run is not saved with the project.

## Fixed in

Not yet released. PR #1236 solves the neutral axis as the unique root of the strain-compatible
force balance with `Real::increasing_root`, in f64 and in the certified interval check, with
εcu3, λ and η from Table 3.1 and 3.1.7. Top bars are taken net of the concrete they displace and
add nothing in tension.

## Workaround

Until you can upgrade, check heavily reinforced beams and beams with top bars by hand or with
CIRSOC 201 / ACI 318, whose flexure is strain compatible, or keep x/d below 0.45 (EN 1992-1-1
5.6.3) so the tension steel yields.

## What to do with results you already have

Re-run the EN 1992-1-1 other-codes check on concrete beams, in particular heavily reinforced beams
and beams with top bars that passed with less than about 20 % margin.

## Credits and references

Reported in issue #534 by Slangelange (external review). PRs #535 and #617 proposed fixes; the fix was written
independently. EN 1992-1-1:2004, 3.1.7, 3.2.7, Table 3.1, 6.1.
