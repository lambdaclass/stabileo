# SA-2026-008: Response spectrum: base shear always SRSS under CQC; modal participation omitted support-coupled mass

| | |
|---|---|
| Severity | High |
| Status | Published 2026-10-21 (fixed in 0.3.0; live on stabileo.com since 2026-10-21) |
| Issue | [#405](https://github.com/lambdaclass/stabileo/issues/405) (related: [#424](https://github.com/lambdaclass/stabileo/issues/424)) |
| Fix | PR [#434](https://github.com/lambdaclass/stabileo/pull/434) (merged via #507, 2026-10-21) |
| Affected versions | up to 0.2.0 and `main` until the fix; introduction not yet bisected |
| Re-check registry | to add with the fix |

## Affected features

Response-spectrum analysis (2D and 3D): reported base shear with CQC; modal participation
factors, effective masses and every spectral response; the spectral certificate (it certifies the
assembled problem, so it does not catch either defect).

## What was wrong

1. **Base shear combined with SRSS even when CQC was requested.** Modal base shears in one
   direction share a sign, so CQC ≥ SRSS. For two modes at ω and 1.1ω (ρ = 0.52) the reported
   base shear was 1/1.23 of the CQC value (**19 % low**). Closely spaced modes (torsionally
   flexible buildings, symmetric plans) are the most affected.
2. **Participation factors used M_ff·r_f only**, omitting the inertia the consistent mass couples
   to the moving supports (M_fr·r_r). With all modes and a static acceleration, the modal sum gave
   0.781 of the exact cantilever tip deflection for one element per column (**22 % low**); the
   error shrinks with mesh refinement. Time history was not affected (it includes the term since
   0.2.0).

## How to tell if your model is affected

You ran a response-spectrum analysis. (1) applies when CQC was selected and you used the reported
base shear (e.g. for scaling to the static base shear). (2) applies with consistent mass,
coarsely meshed members connected to supports, and grows as fewer elements are used per member.

## Fixed in

`main` (#434, merged through the batch-4 integration PR #507 and deployed to stabileo.com on
2026-10-21); released in 0.3.0. The workaround below is for checking results
obtained before that date; it must not be applied to new runs.

## Workaround

(1) Recompute the base shear as the CQC combination of the modal base shears, or scale with the
larger of SRSS and the sum of absolute values. (2) Subdivide members connected to supports (at
least 4 elements per column) or use lumped mass, and check that the effective masses sum to the
total mass in each direction.

## What to do with results you already have

Re-check seismic base shear scaling and spectral demands for buildings with closely spaced modes or
coarse column meshes.

## Credits and references

Element-derivations review (PR #330, MD-5 and MD-7); Chopra, *Dynamics of Structures*, §9.7 and
§13.7.
