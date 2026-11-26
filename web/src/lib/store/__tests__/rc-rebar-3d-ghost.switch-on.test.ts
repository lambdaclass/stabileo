import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { buildSheetRows, type SheetRows } from '../rc-sheets.svelte';
import { modelFrames, sheetBars3d, sheetGhosts3d, shownBars, shownGhosts, REBAR_FAMILIES } from '../rc-rebar-3d.svelte';
import { bentPoints, local, solvedExample } from './rc-rebar-3d-fixture';
import type { Ghost3d } from '../../rc-sheets/rebar-3d-ghost';
import { ownStrapResults } from '../../rc-sheets/schedule/pieces';
import type { Frame, Rebar3d } from '../../rc-sheets/rebar-3d';

beforeAll(async () => { await wasmSolver.initSolver(); });

const TOL = 1e-6;
const ALL = { row: null, level: '', families: { beam: true, column: true, slab: true, wall: true, footing: true, punching: true, stair: true } };
const own = (ghosts: readonly Ghost3d[], key: string, family: Ghost3d['family']) => ghosts.filter((g) => g.element === key && g.family === family);
const size = (g: Ghost3d) => g.to.map((v, i) => v - g.from[i]!);

function sameFrame(a: Frame, b: Frame | null): void {
  expect(b).not.toBeNull();
  for (const k of ['o', 'x', 'y', 'z'] as const) a[k].forEach((v, i) => expect(v).toBeCloseTo(b![k][i]!, 9));
}

function inside(g: Ghost3d, bars: readonly Rebar3d[], along: 0 | 2): number {
  let n = 0;
  for (const b of bars) for (const p of bentPoints(b).map((q) => local(g.frame, q))) {
    if (p[along] < g.from[along] + TOL || p[along] > g.to[along] - TOL) continue;
    for (const i of [0, 1, 2]) {
      expect(p[i]).toBeGreaterThanOrEqual(g.from[i]! - 1e-3);
      expect(p[i]).toBeLessThanOrEqual(g.to[i]! + 1e-3);
    }
    n++;
  }
  return n;
}

function oneGhostEach(rows: SheetRows, ghosts: readonly Ghost3d[], bars: readonly Rebar3d[]): void {
  const frames = modelFrames(rows);
  let held = 0;
  for (const l of rows.line) {
    const gs = own(ghosts, l.key, 'beam'), hMax = Math.max(...l.spans.map((s) => s.h));
    expect(gs.length, l.name).toBe(l.spans.length);
    gs.forEach((g, k) => {
      const s = l.spans[k]!;
      sameFrame(g.frame, frames.line(l));
      expect(size(g)[0]).toBeCloseTo(s.x1 - s.x0, 9);
      expect(size(g)[1]).toBeCloseTo(s.b, 9);
      expect(size(g)[2]).toBeCloseTo(s.h, 9);
      expect(g.to[2]).toBeCloseTo(hMax / 2, 9);
      held += inside(g, bars.filter((b) => b.element === l.key), 0);
    });
  }
  for (const c of rows.column) {
    const [g, ...rest] = own(ghosts, c.key, 'column');
    expect(rest, c.name).toEqual([]);
    sameFrame(g!.frame, frames.column(c));
    expect(size(g!)).toEqual([c.b, c.h, c.length].map((v) => expect.closeTo(v, 9)));
    expect(g!.from[0] + g!.to[0]).toBeCloseTo(0, 9);
    expect(g!.from[2]).toBe(0);
    held += inside(g!, bars.filter((b) => b.element === c.key && b.tone !== 'dowel'), 2);
  }
  for (const r of rows.slab) {
    const gs = own(ghosts, r.key, 'slab'), bx = r.demand.bounds!;
    expect(gs.length, r.name).toBe(1);
    expect(gs[0]!.from).toEqual([bx.x0, bx.y0, expect.closeTo(bx.z - r.h / 2, 9)]);
    expect(gs[0]!.to).toEqual([bx.x1, bx.y1, expect.closeTo(bx.z + r.h / 2, 9)]);
  }
  for (const w of rows.wall) {
    const [g, ...rest] = own(ghosts, w.key, 'wall');
    expect(rest, w.name).toEqual([]);
    sameFrame(g!.frame, frames.wall(w));
    expect(size(g!)).toEqual([w.length, w.thickness, w.height].map((v) => expect.closeTo(v, 9)));
  }
  for (const r of rows.footing.filter((f) => f.B > 0)) {
    const [g, ...straps] = own(ghosts, r.key, 'footing');
    expect(straps.length, r.name).toBe(ownStrapResults(r, rows.footing).reduce((n, s) => n + (s.line?.spans.length ?? 0), 0));
    sameFrame(g!.frame, frames.footing(r));
    expect(g!.from).toEqual([-r.adopted.B / 2, -r.adopted.L / 2, 0]);
    expect(g!.to).toEqual([r.adopted.B / 2, r.adopted.L / 2, r.adopted.h]);
    held += inside(g!, bars.filter((b) => b.element === r.key && b.kind.startsWith('footing')), 2);
  }
  expect(held).toBeGreaterThan(10_000);
}

describe('the concrete ghost of the sheets\' bars', () => {
  it('the seven-storey building: one ghost per element, its section\'s size, in the frame its bars are laid in, the bars inside it; it follows the filters', async () => {
    await solvedExample('pro-edificio-7p');
    const rows = buildSheetRows();
    const bars = sheetBars3d(rows), ghosts = sheetGhosts3d(rows);
    expect(sheetGhosts3d(rows)).toBe(ghosts);
    for (const f of REBAR_FAMILIES.filter((x) => x !== 'punching')) expect(ghosts.some((g) => g.family === f), f).toBe(f === 'footing' ? rows.footing.length > 0 : f === 'stair' ? rows.stair.length > 0 : true);
    expect(ghosts.some((g) => g.family === 'punching')).toBe(false);
    oneGhostEach(rows, ghosts, bars);

    const every = shownGhosts(ghosts, shownBars(bars, ALL), ALL);
    const drawn = new Set(bars.flatMap((b) => [b.element, ...b.rows]));
    expect(every).toEqual(ghosts.filter((g) => drawn.has(g.element)));

    const level = [...new Set(bars.map((b) => b.storey).filter(Boolean))][1]!;
    const atLevel = { ...ALL, level };
    const lv = shownGhosts(ghosts, shownBars(bars, atLevel), atLevel);
    expect(lv.length).toBeGreaterThan(0);
    expect(lv.every((g) => g.storey === level)).toBe(true);

    const noSlabs = { ...ALL, families: { ...ALL.families, slab: false } };
    const ns = shownGhosts(ghosts, shownBars(bars, noSlabs), noSlabs);
    expect(ns.some((g) => g.family === 'slab')).toBe(false);
    expect(ns.length).toBe(every.filter((g) => g.family !== 'slab').length);

    const col = rows.column[0]!, one = { ...ALL, row: { key: col.key, name: col.name } };
    expect(shownGhosts(ghosts, shownBars(bars, one), one).map((g) => g.element)).toEqual([col.key]);
    const panel = rows.slab[0]!, onePanel = { ...ALL, row: { key: panel.key, name: panel.name } };
    expect(shownGhosts(ghosts, shownBars(bars, onePanel), onePanel).map((g) => g.element)).toEqual([panel.key]);
    expect(shownGhosts(ghosts, [], ALL)).toEqual([]);
  }, 600_000);

  it('a small frame on footings: its footings and strap beams have their ghosts', async () => {
    await solvedExample('pro-rc-frame-area-loads');
    const rows = buildSheetRows();
    const bars = sheetBars3d(rows), ghosts = sheetGhosts3d(rows);
    expect(rows.footing.length).toBeGreaterThan(0);
    oneGhostEach(rows, ghosts, bars);
  }, 600_000);
});
