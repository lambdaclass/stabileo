# SA-2026-001: Load combinations and generated loads (CIRSOC 101 / 102 / 103) were unconservative before 0.2.0

| | |
|---|---|
| Severity | High |
| Status | Published 2026-10-21 (fixed in 0.2.0, released 2026-10-18) |
| Issues / fix | PR #292 (safety wave), released in **0.2.0** (2026-10-18) |
| Affected versions | every deployment before 2026-10-17 (untagged versions before 0.2.0); introduction not bisected |
| Re-check registry | `cirsoc-combinations-and-loads`, `dead-load-default-2.52` (PR #328) |

## Affected features

PRO mode load generation and combinations: CIRSOC 101-2025 combinations, INPRES-CIRSOC 103
seismic combination and seismic weight, CIRSOC 102 wind on pitched roofs, live-load reduction,
the default floor dead-load build-up.

## What was wrong

All of these lowered demands:

- **Absent companion loads not generated** (CIRSOC 101-2025 §2.3.2): roof suction under wind
  lowered every gravity combination. In the `pro-simple-shed` example the column axial force was
  44 kN instead of 62 kN (29 % low).
- **Seismic combination on roofs that keep snow** used f2 = 0.2 instead of 0.70·S
  (INPRES-CIRSOC 103 Tabla 3.3); the seismic weight omitted f2·S.
- **Wind on pitched roofs**: roof Cp was not interpolated in h/L (h/L other than 0.25, 0.5, 1.0)
  and ignored note 2 past the 0.0 entry (slopes 35°–60°).
- **Live-load reduction** gave every member the largest tributary area in the model; one-way slabs
  were reduced when §4.7.6 does not allow it.
- **Default dead load** 2.32 kN/m² instead of 2.52 kN/m² (partition allowance below the CIRSOC
  101-2025 §4.3.2 minimum of 0.75 kN/m²).

## How to tell if your model is affected

Your project used PRO load generation (wind, snow, seismic, live-load reduction) or the generated
CIRSOC combinations, or the default floor build-up, and was solved before 2026-10-17.

## Fixed in

0.2.0 (release notes §1.1–1.2).

## Workaround

None needed in 0.2.0. Re-generate loads and combinations, re-solve and review the design checks.

## What to do with results you already have

Re-run every project of this kind and compare governing member forces and design ratios. Any
deliverable issued from a pre-0.2.0 run should be re-checked.

## Credits and references

Clause-by-clause review of the load generators against the CIRSOC texts and published examples
(October 2026 safety wave, PR #292; `docs/verification/LOADS.md`).
