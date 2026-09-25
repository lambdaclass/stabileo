import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TWO_D_INTERNAL_FORCE_LABELS,
  TWO_D_REACTION_LABELS,
  TWO_D_DISPLACEMENT_LABELS,
} from '../coordinate-system';

/**
 * The 2D plane is x–z, so 2D quantities are named for it.
 *
 * The app migrated from a Y-up 2D convention (ux, uy, θz → Mz, Vy) to Z-up
 * (ux, uz, θy → My, Vz). The engine still carries the history: the Rust
 * `Reaction` struct serialises `rx`, `rz`, `my` and keeps `ry`/`mz` only as
 * deserialise aliases. Two places in the UI never made the move — the ribbon,
 * which spelled its own diagram labels instead of reading them from
 * `coordinate-system.ts`, and the influence-line quantity buttons.
 *
 * The ribbon case was not cosmetic: the same model solved in 2D and in 3D
 * showed the identical diagram under two different names, so the two modes
 * looked like they disagreed.
 *
 * These tests fix the names centrally and check that the surfaces which display
 * them read from here rather than spelling their own.
 */

const SRC = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

describe('2D axis naming', () => {
  it('names in-plane quantities for the x–z plane', () => {
    expect(TWO_D_INTERNAL_FORCE_LABELS).toEqual({ axial: 'N', moment: 'My', shear: 'Vz' });
    expect(TWO_D_REACTION_LABELS).toEqual({ horizontal: 'Rx', vertical: 'Rz', moment: 'My' });
    expect(TWO_D_DISPLACEMENT_LABELS).toEqual({ horizontal: 'ux', vertical: 'uz', rotation: 'θy' });
  });

  it('never names an in-plane quantity for the out-of-plane axis', () => {
    const inPlane = [
      ...Object.values(TWO_D_INTERNAL_FORCE_LABELS),
      ...Object.values(TWO_D_REACTION_LABELS),
      ...Object.values(TWO_D_DISPLACEMENT_LABELS),
    ];
    // Mz, Vy, Ry, θz and uy are the out-of-plane pair plus the Y-up spellings
    // of the in-plane ones. None of them can label a 2D quantity.
    for (const bad of ['Mz', 'Vy', 'Ry', 'θz', 'uy']) {
      expect(inPlane).not.toContain(bad);
    }
  });
});

describe('the ribbon reads its 2D labels rather than spelling them', () => {
  const ribbon = read('components/ribbon/Ribbon.svelte');

  it('imports the canonical labels', () => {
    expect(ribbon).toMatch(/TWO_D_INTERNAL_FORCE_LABELS/);
  });

  it('offers Mz and Vy only inside the 3D branch', () => {
    // Everything before `if (threeD)` is what a 2D user is offered.
    const twoDPortion = ribbon.slice(0, ribbon.indexOf('if (threeD) {'));
    expect(twoDPortion).not.toMatch(/label: 'Mz'/);
    expect(twoDPortion).not.toMatch(/label: 'Vy'/);
  });
});

describe('influence lines ask for quantities the engine accepts', () => {
  const rust = readFileSync(
    join(SRC, '..', '..', 'engine', 'src', 'postprocess', 'influence.rs'),
    'utf8',
  );

  it('the engine dispatches on the Z-up names', () => {
    // The inner match always folded both spellings onto `rz`/`my`, but this
    // outer gate listed only the Y-up ones, so a correct "Rz" fell through to
    // `_ => 0.0` and produced a flat, silent zero.
    const gate = rust.slice(rust.indexOf('match quantity {'));
    expect(gate).toMatch(/"Ry" \| "Rz" \| "Rx" \| "Mz" \| "My" =>/);
  });

  it('the UI offers the Z-up names', () => {
    // The quantity list lives in one shared module both toolbars iterate —
    // that is the point of the extraction — so the names are pinned there,
    // and the components are pinned to consuming the module rather than
    // carrying their own copies.
    const groups = read('lib/influence-line-quantities.ts');
    expect(groups).toContain("'Rz'");
    expect(groups).toContain("'My'");
    expect(groups).not.toMatch(/'Ry'/);
    expect(groups).not.toMatch(/'Mz'/);
    for (const file of [
      'components/ribbon/ToolOptions.svelte',
      'components/FloatingTools.svelte',
    ]) {
      expect(read(file), `${file} must render the shared quantity groups`).toContain('IL_QUANTITY_GROUPS');
    }
  });

  it("the store's default is a quantity a button can show as selected", () => {
    const ui = read('lib/store/ui.svelte.ts');
    const dflt = ui.match(/ilQuantity = \$state<ILQuantity>\('(\w+)'\)/)?.[1];
    expect(dflt).toBe('Rz');
    expect(read('lib/influence-line-quantities.ts')).toContain(`'${dflt}'`);
  });
});
