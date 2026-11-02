# SA-2026-027: the shell envelope kept the combination with the largest Von Mises, not each component's extreme

| | |
|---|---|
| Severity | High |
| Status | Draft (fix in review) |
| Issue | — (found in the review of #786) |
| Fix | PR [#1237](https://github.com/lambdaclass/stabileo/pull/1237) |
| Affected versions | every version with combined shell stresses in the envelope, up to `main` until the fix |
| Re-check registry | entry `shell-envelope-per-component` (models with shells and combinations), results version 10 |

## Affected features

PRO, 3D, models with plates or quads and load combinations. The envelope of the shell results:

- the envelope view and its contours (σxx, σyy, τxy, σ1, σ2, mx, my, mxy, Von Mises and the
  required steel As);
- the results tab's shell tables in the envelope view;
- the PRO report's shell section when it reports the envelope;
- the workbook's shell sheets for the envelope source.

Not affected: the slab and wall design (`detailing-floor-inputs.ts`), which reads each
combination's stresses, and the per-combination results.

## What was wrong

The envelope took, for each element, the whole record of the combination with the largest Von
Mises (`engine/src/shell_combination_kernel.rs`, `web/src/lib/engine/shell-combos.ts`). Every
other component was that combination's value, not its own extreme over the combinations. Where Von
Mises does not follow the component read, the envelope showed a smaller value than another
combination gives, with nothing to say so. The worst case is a plate in bending: its Von Mises is
the membrane's, zero in every combination, so the first combination was kept.

pro-mat-foundation, element e10:

| | Combination 1 (1.2D) | Combination 2 (1.4D) | Envelope before | Envelope now |
|---|---:|---:|---:|---:|
| mx (kN·m/m) | 77.94 | 90.93 | 77.94 (14 % low) | 90.93 |
| my (kN·m/m) | 95.87 | 111.85 | 95.87 (14 % low) | 111.85 |
| qx (kN/m) | −67.09 | −78.27 | −67.09 | −78.27 |

## How to tell if your results are affected

A PRO model with plates or quads and two or more combinations, whose envelope shell values were
read, contoured, reported or exported. Values read from a single combination are not affected.

## Fixed in

PR #1237. The engine's kernel now takes the largest and the smallest value of each component over
the combinations, each with the combination it comes from, and the app shows the component of
larger magnitude. Von Mises is its largest value; σ1 its largest, σ2 its smallest; the required
steel the largest Wood–Armer design moment of each face and direction. Faces and global axes,
which would mix components of different combinations, are left empty for the envelope. The
workbook's Envelope sheet lists every shell component's extremes with their combinations. Tests:
`web/src/lib/engine/__tests__/shell-envelope-components.test.ts`,
`web/src/lib/engine/__tests__/shell-combos.test.ts` (property test against an independent
TypeScript oracle), `engine/src/shell_combination_kernel.rs` (property test), and the results
snapshots of the shell models, which now record the envelope.

## Workaround

Read shell demands from each combination, not from the envelope.

## What to do with results you already have

Re-solve every PRO model with shells and combinations whose envelope shell values were used, and
compare them with the new envelope.

## Credits and references

Found in the Codex review of #786.
