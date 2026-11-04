# SA-2026-040: ACI 318 and EN 1992 member checks passed RC members without checking their torsion

| | |
|---|---|
| Severity | High |
| Status | Draft |
| Issue | [#1314](https://github.com/lambdaclass/stabileo/issues/1314) |
| Fix | #1319 (containment: the check is marked incomplete; torsion design itself is not added) |
| Affected versions | every release since the other-codes checks landed (2026-09-25, desktop-v0.1.0-alpha.1 to 0.4.0) and the live site until this fix |
| Re-check registry | entry `rc-other-codes-torsion-unchecked` (models with concrete members); the numbers do not change, only whether the check counts as passed |

## Affected features

- **App: PRO, Design, other codes, ACI 318 and EN 1992-1-1** checks of reinforced concrete
  members (rectangular sections with stated bars).
- The CIRSOC 201 design is not affected: it checks torsion (§11.5 / 22.7).

## What was wrong

The engine's ACI 318 and EN 1992 checkers read flexure, shear and axial force only. Torsion at the
member's stations was never passed to them, so a member with large torsion could show as passing.

## How to tell if your results are affected

You relied on a passing ACI 318 or EN 1992 check of a concrete member that carries torsion: a
spandrel beam, an edge beam carrying a cantilever slab, a member of a grid or of a curved
structure. With this fix such a check shows "torsion not checked" and does not pass: for ACI 318
when |T| > φ·0.083·λ·√f'c·Acp²/pcp with √f'c ≤ 8.3 MPa½ and λ = 1 only for a unit weight of at least 23 kN/m³ (else the lightweight 0.75), the threshold below which 22.7.1.1 lets torsion be neglected, and under axial tension (which lowers that threshold) whenever the member carries any torsion;
for EN 1992, which has no such threshold, whenever the member carries any torsion.

## Fixed in

Containment only: such a check is incomplete, and its certificate is refused as partial. Test:
`web/src/lib/engine/design/other-codes/__tests__/concrete-codes.test.ts` (a 30 × 50 cantilever with
twice and half the ACI threshold torque, both codes, and with no torque).

## Workaround

Check torsion separately (the CIRSOC 201 design in the app does), or by hand.

## What to do with results you already have

Re-run the other-codes checks: any member now marked with the torsion note needs a torsion design.
