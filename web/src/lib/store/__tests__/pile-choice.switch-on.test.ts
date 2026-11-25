/**
 * A pile foundation with more than one pile available: every cap is designed on each and keeps the
 * one that verifies with the least concrete, a pile adopted on a cap stays.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { buildSheetRows } from '../rc-sheets.svelte';
import { solvedExample } from './rc-rebar-3d-fixture';
import { patchDesignData } from '../design-data';
import { setFoundationSystem } from '../rc-sheets-footings';
import { footingConcrete } from '../../rc-sheets/footing-layouts';

beforeAll(async () => { await wasmSolver.initSolver(); });

const caps = () => new Map(buildSheetRows().footing.filter((r) => r.cap).map((r) => [r.key, r]));

describe('the available piles', () => {
  it('give each cap the one that verifies with the least concrete', async () => {
    await solvedExample('pro-rc-four-storey');
    setFoundationSystem('piles');
    const small = { diameter: 0.4, capacity: 400 }, big = { diameter: 0.8, capacity: 1600 };
    patchDesignData({ presumedPile: { ...small, length: 12 } });
    const onSmall = caps();
    patchDesignData({ presumedPile: { ...big, length: 12 } });
    const onBig = caps();
    patchDesignData({ presumedPile: { ...small, length: 12, more: [big] } });
    const both = caps();
    expect(both.size).toBeGreaterThan(6);
    const used = new Set<number>();
    for (const [key, r] of both) {
      const options = [onSmall.get(key)!, onBig.get(key)!];
      const ok = options.filter((x) => x.status !== 'fail');
      const best = Math.min(...(ok.length ? ok : options).map(footingConcrete));
      expect(footingConcrete(r), key).toBeCloseTo(best, 9);
      used.add(r.adopted.piles!.diameter);
    }
    expect([...used].every((d) => d === 0.4 || d === 0.8)).toBe(true);
  }, 900_000);
});
