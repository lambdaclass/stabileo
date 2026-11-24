/**
 * The strap beams of a building on its party walls, in 3D: each laid from the end its line starts
 * at, as long as its two supports stand apart along it, and every bar of it inside the concrete,
 * the strap's or its footings'. The footing under the lift's walls has the widest support of all:
 * laid from the wrong end, its bars ran past the partner column and out of the lot.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { buildSheetRows } from '../rc-sheets.svelte';
import { sheetBars3d, sheetGhosts3d } from '../rc-rebar-3d.svelte';
import { bentPoints, local, solvedExample } from './rc-rebar-3d-fixture';
import { patchDesignData } from '../design-data';
import { setFoundationSystem } from '../rc-sheets-footings';
import { ownStrapResults } from '../../rc-sheets/schedule/pieces';

beforeAll(async () => { await wasmSolver.initSolver(); });

describe('the strap beams of the building between party walls', () => {
  it('span between their supports along their axis, and hold every bar inside the concrete', async () => {
    await solvedExample('pro-rc-party-wall');
    patchDesignData({ propertyLines: { minX: true, maxX: true } });
    setFoundationSystem('footings');
    const rows = buildSheetRows();
    const byKey = new Map(rows.footing.map((r) => [r.key, r]));
    const straps = rows.footing.flatMap((r) => ownStrapResults(r, rows.footing).map((s) => ({ r, s })));
    expect(straps.length).toBeGreaterThan(8);
    const walls = straps.find(({ r }) => r.demand.pier);
    expect(walls, 'the footing under the lift\'s walls has a strap').toBeDefined();
    let measured = 0;
    for (const { r, s } of straps) {
      const p = byKey.get(s.partnerKey);
      if (!p) continue;
      measured++;
      expect(s.L, `${r.name} → ${s.partner}`).toBeCloseTo(Math.abs(s.axis === 'x' ? p.demand.at.x - r.demand.at.x : p.demand.at.y - r.demand.at.y), 9);
    }
    expect(measured).toBeGreaterThan(8);
    const bars = sheetBars3d(rows), ghosts = sheetGhosts3d(rows).filter((g) => g.family === 'footing');
    const strapKinds = new Set(['continuous', 'support', 'stirrup', 'stirrupTie']);
    const out: string[] = [];
    let held = 0;
    for (const b of bars.filter((x) => x.family === 'footing' && strapKinds.has(x.kind))) {
      for (const q of bentPoints(b)) {
        const d = Math.min(...ghosts.map((g) => { const l = local(g.frame, q); return Math.max(0, ...[0, 1, 2].map((i) => Math.max(g.from[i]! - l[i]!, l[i]! - g.to[i]!))); }));
        if (d > 0.01) out.push(`${b.element} ${b.kind} ${d.toFixed(3)} m out at ${q.map((v) => v.toFixed(2)).join(', ')}`);
        else held++;
      }
    }
    expect(out.slice(0, 5)).toEqual([]);
    expect(held).toBeGreaterThan(1000);
    const xs = bars.filter((b) => b.element === walls!.r.key && strapKinds.has(b.kind)).flatMap((b) => bentPoints(b).map((q) => q[0]));
    expect([Math.min(...xs), Math.max(...xs)].every((x) => x > -0.1 && x < 8.5), 'inside the lot').toBe(true);
  }, 900_000);
});
