import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { buildSheetRows, type SheetRows } from '../rc-sheets.svelte';
import { solvedExample } from './rc-rebar-3d-fixture';
import { shortStretches } from '../../rc-sheets/line-steel';
import { overlapping, planOverlapping, screenLayout, zoneCounts } from '../../rc-sheets/__tests__/elevation-checks';

let rows: SheetRows;
beforeAll(async () => {
  await wasmSolver.initSolver();
  await solvedExample('pro-edificio-7p');
  rows = buildSheetRows();
}, 300_000);

describe('the seven-storey building\'s beam elevations', () => {
  it('keep every text and mark clear of every other on every line, on screen and on paper', () => {
    expect(rows.line.length).toBeGreaterThan(40);
    const bad = rows.line.flatMap((l) => [...overlapping(screenLayout(l)).map((x) => `${l.name} ${l.level}: ${x}`), ...planOverlapping(l, 20).pairs.map((x) => `${l.name} ${l.level} 1:20: ${x}`)]);
    expect(bad).toEqual([]);
  });

  it('label each stirrup zone with the count the bending schedule takes', () => {
    for (const l of rows.line) {
      const { labels, schedule } = zoneCounts(l);
      expect(labels, l.name).toEqual(schedule);
    }
  });

  it('provide on every verified line at least the steel the moment asks of each face by strength, everywhere along it', () => {
    const verified = rows.line.filter((l) => l.status !== 'fail');
    expect(verified.length).toBeGreaterThan(40);
    for (const l of verified) {
      expect(l.steel!.length, l.name).toBe(l.envelope.length);
      for (const face of ['top', 'bottom'] as const) expect(shortStretches(l.steel!, face, 'strength'), `${l.name} ${l.level} ${face}`).toEqual([]);
    }
  });

  it('give V9 its columns by name and size at every support', () => {
    const v9 = rows.line.find((l) => l.name === 'V9')!;
    expect(v9.spans).toHaveLength(3);
    expect(v9.posts!.every((p) => p && p.name.length > 0 && p.b > 0 && p.h > 0)).toBe(true);
    const l = screenLayout(v9);
    expect(l.posts.every((p) => p.name && p.size && p.rect)).toBe(true);
  });
});
