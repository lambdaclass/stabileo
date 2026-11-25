/**
 * The gallery's building with a lift and a stair, read by the reinforcement sheets: each flight of
 * its U stair a stair of the sheets with its landings and the nine risers it declares, designed and
 * verified, its bars inside its concrete in 3D, and the walls of its lift shaft and stairwell walls of
 * the sheets, storey by storey.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { buildSheetRows } from '../rc-sheets.svelte';
import { bentPoints, local, solvedExample } from './rc-rebar-3d-fixture';
import { sheetBars3d, sheetGhosts3d } from '../rc-rebar-3d.svelte';

beforeAll(async () => { await wasmSolver.initSolver(); });

describe('the building between party walls in the sheets', () => {
  it('has its twelve flights as stairs of the risers they declare, each between its landings and verified, and its core walls', async () => {
    await solvedExample('pro-rc-party-wall');
    const rows = buildSheetRows();
    const stairs = rows.stair.filter((s) => !s.unsupported);
    expect(stairs).toHaveLength(12);
    for (const s of stairs) {
      expect(s.demand.source).toBe('model');
      expect(s.demand.presumed).not.toContain('rcSheets.stair.presumedRiser');
      expect([s.demand.spec.steps, s.demand.spec.tread, s.demand.spec.width]).toEqual([9, expect.closeTo(0.33, 9), expect.closeTo(1.05, 9)]);
      expect(s.demand.spec.landingTop, `${s.demand.name}: the landing it arrives on`).toBeGreaterThan(1);
      expect(s.status, s.demand.name).toBe('ok');
    }
    // 1,5 m a flight in the ground floor's 3 m, 1,4 m above.
    expect(stairs.map((s) => s.demand.spec.riser.toFixed(4)).sort()).toEqual([...Array(10).fill('0.1556'), '0.1667', '0.1667']);
    expect(stairs.filter((s) => s.demand.spec.landingBottom > 1).length, 'every flight but the first leaves a landing').toBe(11);
    expect(new Set(stairs.map((s) => s.level)).size).toBe(6);
    expect(rows.wall.length).toBeGreaterThanOrEqual(5 * 7);
    const bars = sheetBars3d(rows).filter((b) => b.family === 'stair'), ghosts = sheetGhosts3d(rows).filter((g) => g.family === 'stair');
    expect(new Set(bars.map((b) => b.element)).size).toBe(12);
    const out = bars.flatMap((b) => bentPoints(b).flatMap((p) => {
      const d = Math.min(...ghosts.filter((g) => g.element === b.element).map((g) => { const q = local(g.frame, p); return Math.max(0, ...[0, 1, 2].map((i) => Math.max(g.from[i]! - q[i]!, q[i]! - g.to[i]!))); }));
      return d > 1e-3 ? [`${b.element} ${b.kind} ${d.toFixed(3)} m out`] : [];
    }));
    expect(out.slice(0, 5), 'every stair bar inside its stair\'s concrete').toEqual([]);
  }, 900_000);
});
