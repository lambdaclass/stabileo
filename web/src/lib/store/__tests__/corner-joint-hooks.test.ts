/**
 * The corner joints of the span fixture at 40×40 (`span-fixture.ts`), its beams' role in the
 * lateral system not declared, so their positive steel develops fy at the face and hooks up into
 * the columns (§9.7.3.8.2): two beams ending at a corner turn their top tails down and their
 * bottom tails up side by side, the upper mat's bends sweep over the lower mat's corner bars,
 * and the joint's crossties run through the band the tails stand in. Designed and detailed
 * through the production commands, every corner is laid with no clash the coordination leaves
 * and no bar through a crosstie.
 *
 * Before, on the 1 m mesh: 12 clashes left unresolved on 34 of the designed pieces (8 top tails
 * 2,9 mm into the crossing mat's bend, 4 bottom tails 6,7 mm short of the clear between parallel
 * bars), and 30 conflicts in the coordination (26 prohibited overlaps, 18 of them a beam's tail
 * through a joint crosstie, and 4 cross-member spacings). On the 2 m mesh: 24 clashes on 36
 * pieces, 40 conflicts, and no layout through 12 joints.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore } from '../model.svelte';
import { detailingStore } from '../detailing.svelte';
import { building, designAndDocument } from './span-fixture';
import * as wasmSolver from '../../engine/wasm-solver';
import '../../engine/design/adapters/cirsoc201-adapter';
import '../../engine/design/adapters/unsupported-adapter';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

/** What the coordination left: the clashes it reports and the conflicts it measured. */
function census() {
  const asm = modelStore.model.detailing?.assemblies ?? [];
  const clashes = asm.flatMap((a) => (a.unsupported ?? []).filter((u) => u.key === 'detailing.clash.unresolved'));
  const run = detailingStore.lastRun as unknown as {
    coordination?: Array<{ repair?: { conflicts?: Array<{ pairClass: string; barA: string; barB: string }> } }>;
    layoutSearch?: { outcome?: string; infeasibleJoints?: readonly unknown[] };
  } | null;
  const conflicts = (run?.coordination ?? []).flatMap((c) => c.repair?.conflicts ?? []);
  return {
    clashes: clashes.length,
    conflicts: conflicts.length,
    throughCrossties: conflicts.filter((c) => /crosstie/.test(c.barA) || /crosstie/.test(c.barB)).length,
    search: run?.layoutSearch?.outcome,
  };
}

describe('the span fixture at 40×40, its beams\' role not declared', () => {
  it('1 m mesh: every corner laid, no clash left and no tail through a crosstie', () => {
    building(1, { columnSide: 0.4, lateral: null });
    designAndDocument();
    const c = census();
    expect([c.clashes, c.conflicts, c.throughCrossties]).toEqual([0, 0, 0]);
  }, 600_000);

  it('2 m mesh: the same, and a layout through every joint', () => {
    building(2, { columnSide: 0.4, lateral: null });
    designAndDocument();
    expect(census()).toEqual({ clashes: 0, conflicts: 0, throughCrossties: 0, search: 'ASSIGNMENT_FOUND' });
  }, 600_000);
});
