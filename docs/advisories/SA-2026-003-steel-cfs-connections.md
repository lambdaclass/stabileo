# SA-2026-003: Steel, cold-formed and connection checks overstated capacity before 0.2.0

| | |
|---|---|
| Severity | Critical |
| Status | Published 2026-10-21 (fixed in 0.2.0, released 2026-10-18) |
| Issues / fix | PRs #286, #291, #293, #295, #301, #303, #308 (safety wave), released in **0.2.0** (2026-10-18) |
| Affected versions | every deployment before 2026-10-17; introduction not bisected |
| Re-check registry | `cirsoc301-member-checks`, `cirsoc301-tension-needs-connection`, `cirsoc301-ltb-top-flange`, `cirsoc301-biaxial-h11b`, `ec3-aisc-ltb-and-slender`, `aisi-cold-formed`, `weld-groups-end-loaded`, `section-properties-asymmetric` (PR #328) |

## Affected features

CIRSOC 301, AISC 360, EC3 and AISI S100 member checks; bolted and welded connections; section
properties of asymmetric sections (angles, Z, lipped sections).

## What was wrong

Published examples where the old checks were unconservative
([DESIGN_EXAMPLES.md](../verification/DESIGN_EXAMPLES.md#discrepancies)):

- CIRSOC 301 web shear: φVn **60 % high** (INTI301 Ej. 14 V2, D7); slender-element column without
  Q: **+16 %** (D6); noncompact girder flexure **+14 %** (D8); tension rupture with Ae = Ag;
  torsional and flexural-torsional buckling (E.4) missing (a tee at 3 m: 451.8 → 392.8 kN);
  biaxial bending without axial force skipped H.1.1b.
- AISC 360 flange local buckling not checked (+0.8 %, D1); EC3 interaction as a linear sum with
  k = 1 (D11); EC3 χLT NaN for Lb = 0.
- AISI S100 web shear up to **51 % high**, F2.1 formula error.
- Fillet welds: end-loaded β missing, φRn **+9.5 %** on AISC J.1 (D5); bolt bearing overstated.
- Shear centre and warping constant of asymmetric sections ignored the product of inertia (Cw of
  an L100×10 24× too large); thin-walled J 18–24 % low.

## How to tell if your model is affected

The project has steel or cold-formed members, or bolted/welded joints, checked before 2026-10-17.

## Fixed in

0.2.0 (release notes §1.4). CIRSOC 301 results remain labelled experimental until independent
review (#389).

## Workaround

None needed in 0.2.0. Re-run the checks; supply end connections for tension members and the
element data the checks now require.

## What to do with results you already have

Re-check every steel member and joint designed with a pre-0.2.0 version.

## Credits and references

Published worked examples (AISC Design Examples, INTI-CIRSOC 301, SCI) and differential testing;
`docs/verification/DESIGN_EXAMPLES.md`, `docs/verification/SECTIONS_CONNECTIONS.md`.
