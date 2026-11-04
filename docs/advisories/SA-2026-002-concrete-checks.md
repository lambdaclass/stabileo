# SA-2026-002: Concrete design checks (CIRSOC 201, ACI 318) overstated capacity before 0.2.0

| | |
|---|---|
| Severity | Critical |
| Status | Published 2026-10-21 (fixed in 0.2.0, released 2026-10-18) |
| Issues / fix | PRs #298, #301 (safety wave), released in **0.2.0** (2026-10-18) |
| Affected versions | every deployment before 2026-10-17; introduction not bisected |
| Re-check registry | `cirsoc201-strain-compatibility`, `aci318-strain-and-axial`, `footing-shear-lambda-s`, `steel-ratio-above-one-fails` (PR #328) |

## Affected features

PRO reinforced-concrete design: CIRSOC 201 flexure, shear and column checks (TypeScript verifier
and engine), ACI 318 checks, footing shear.

## What was wrong

- **CIRSOC 201 flexure** assumed the tension steel yields: φMn up to **18 % too high** (641 of
  4 000 random sections in the differential test), φ up to 2.7 % high (εt = 0.005 for every fy),
  stirrups credited above fyt = 420 MPa (Vs up to 19 % high); no §9.3.3.1 ductility check.
- **CIRSOC 201 shear** used ACI's 0.17·√f'c instead of (1/6)·√f'c (Vc +1.9 % on INTI Ej. 3.I),
  √f'c not capped.
- **ACI 318**: flexure without strain compatibility (Mn 14.5 % high in one case); an axially
  overloaded column could pass (no axial check).
- A member with zero capacity and zero moment could **pass**; ratios between 1.00 and 1.10 showed
  as "warning" instead of failing.
- Footing punching without λs (25 % strong at d = 525 mm); one-way shear used the row that needs
  stirrups.

## How to tell if your model is affected

The project has RC members or footings checked with CIRSOC 201 or ACI 318 and was checked before
2026-10-17. Deep sections, high fy (≥ 500 MPa), doubly reinforced sections, columns with high
axial load and deep footings are the most affected.

## Fixed in

0.2.0 (release notes §1.3). The verdict now comes from the engine and is certified
([CERTIFY.md](../verification/CERTIFY.md#certified-design-checks)).

## Workaround

None needed in 0.2.0. Re-run the design checks.

## What to do with results you already have

Re-check every RC member and footing designed with a pre-0.2.0 version; reinforcement drawings and
bar schedules derived from them may need revision.

## Credits and references

Differential testing TypeScript vs Rust and published worked examples (INTI-CIRSOC 201, JRC EC2);
`docs/verification/TS_ENGINE_LOGIC.md`, `docs/verification/DESIGN_EXAMPLES.md` (D2, D3).
