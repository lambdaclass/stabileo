/**
 * The gallery's building with a lift and a stair, read by the reinforcement sheets: each flight of
 * its U stair a stair of the sheets with its landing, and the walls of its lift shaft and stairwell
 * walls of the sheets, storey by storey.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { buildSheetRows } from '../rc-sheets.svelte';
import { solvedExample } from './rc-rebar-3d-fixture';

beforeAll(async () => { await wasmSolver.initSolver(); });

describe('the building between party walls in the sheets', () => {
  it('has its twelve flights as stairs, each with a landing, and its core walls', async () => {
    await solvedExample('pro-rc-party-wall');
    const rows = buildSheetRows();
    const stairs = rows.stair.filter((s) => !s.unsupported);
    expect(stairs).toHaveLength(12);
    for (const s of stairs) {
      expect(s.demand.source).toBe('model');
      expect(s.demand.spec.landingBottom + s.demand.spec.landingTop).toBeGreaterThan(0);
    }
    // 1,5 m a flight in the ground floor's 3 m, 1,4 m above: risers of about 17,5 cm.
    expect(stairs.map((s) => s.demand.spec.steps).sort()).toEqual([...Array(10).fill(8), 9, 9]);
    expect(new Set(stairs.map((s) => s.level)).size).toBe(6);
    expect(rows.wall.length).toBeGreaterThanOrEqual(5 * 7);
  }, 900_000);
});
