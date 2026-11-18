import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { buildSheetRows, setAdopted, type SheetRows } from '../rc-sheets.svelte';
import { modelFrames, pieceOptions, sheetBars3d, shownBars } from '../rc-rebar-3d.svelte';
import { bentPoints, gaps, local, mismatches, pieceLengths, solvedExample } from './rc-rebar-3d-fixture';
import type { Rebar3d, V3 } from '../../rc-sheets/rebar-3d';
import type { ColumnAdopted, SlabAdopted } from '../../rc-sheets/types';
import type { LineAdopted } from '../../rc-sheets/beam-line';

beforeAll(async () => { await wasmSolver.initSolver(); });

const TOL = 1e-3;
const points = (b: Rebar3d): V3[] => bentPoints(b);
const of = (bars: readonly Rebar3d[], element: string) => bars.filter((b) => b.element === element);

function coherent(rows: SheetRows, bars: readonly Rebar3d[]): void {
  const { schedule, view } = pieceLengths(rows, bars, pieceOptions(rows));
  expect(schedule.size).toBeGreaterThan(0);
  expect(mismatches(schedule, view)).toEqual([]);
}

function beamsInside(rows: SheetRows, bars: readonly Rebar3d[]): number {
  const frames = modelFrames(rows);
  let checked = 0;
  for (const l of rows.line) {
    const f = frames.line(l)!, sp = l.spans[0]!, sd = Math.min(...l.zones.map((z) => z.stirrups.dia)) / 1000;
    for (const b of of(bars, l.key)) {
      const r = b.dia / 2000, longitudinal = b.kind !== 'stirrup' && b.kind !== 'stirrupTie' && b.kind !== 'hanger';
      const inner = longitudinal ? l.cover + sd : l.cover;
      for (const p of points(b).map((q) => local(f, q)).filter((q) => q[0] >= 0 && q[0] <= l.length)) {
        expect(Math.abs(p[1]) + r, `${l.name} ${b.kind}`).toBeLessThanOrEqual(sp.b / 2 - inner + TOL);
        expect(Math.abs(p[2]) + r, `${l.name} ${b.kind}`).toBeLessThanOrEqual(sp.h / 2 - inner + TOL);
        checked++;
      }
    }
  }
  return checked;
}

function columnsInside(rows: SheetRows, bars: readonly Rebar3d[]): number {
  const frames = modelFrames(rows);
  let checked = 0;
  for (const c of rows.column) {
    const f = frames.column(c)!, td = c.adopted.tieDia / 1000;
    for (const b of of(bars, c.key)) {
      const inner = b.tone === 'tie' ? c.cover : c.cover + td;
      for (const p of points(b).map((q) => local(f, q))) {
        expect(Math.abs(p[0]) + b.dia / 2000, `${c.name} ${b.kind}`).toBeLessThanOrEqual(c.b / 2 - inner + TOL);
        expect(Math.abs(p[1]) + b.dia / 2000, `${c.name} ${b.kind}`).toBeLessThanOrEqual(c.h / 2 - inner + TOL);
        checked++;
      }
    }
  }
  return checked;
}

function slabsInside(rows: SheetRows, bars: readonly Rebar3d[], cover: number): number {
  const byKey = new Map(rows.slab.map((r) => [r.key, r]));
  let checked = 0;
  for (const b of bars.filter((x) => x.family === 'slab')) {
    const panel = byKey.get(b.rows[0]!)!, soffit = panel.demand.bounds!.z - panel.h / 2;
    for (const p of bentPoints(b)) {
      expect(p[2] - soffit, `${panel.name} ${b.tone}`).toBeGreaterThanOrEqual(cover + b.dia / 2000 - TOL);
      expect(p[2] - soffit, `${panel.name} ${b.tone}`).toBeLessThanOrEqual(panel.h - cover - b.dia / 2000 + TOL);
      checked++;
    }
  }
  return checked;
}

function wallsInside(rows: SheetRows, bars: readonly Rebar3d[]): number {
  const frames = modelFrames(rows);
  let checked = 0;
  for (const w of rows.wall) {
    const f = frames.wall(w)!;
    for (const b of of(bars, w.key)) for (const p of points(b).map((q) => local(f, q))) {
      expect(Math.abs(p[1]) + b.dia / 2000, `${w.name} ${b.kind}`).toBeLessThanOrEqual(w.thickness / 2 - w.cover + TOL);
      expect(p[0], `${w.name} ${b.kind}`).toBeGreaterThanOrEqual(w.cover - TOL);
      expect(p[0], `${w.name} ${b.kind}`).toBeLessThanOrEqual(w.length - w.cover + TOL);
      checked++;
    }
  }
  return checked;
}

function footingsInside(rows: SheetRows, bars: readonly Rebar3d[]): number {
  const frames = modelFrames(rows);
  let checked = 0;
  for (const r of rows.footing) {
    const f = frames.footing(r)!, a = r.adopted, c = r.cover;
    for (const b of of(bars, r.key).filter((x) => x.family === 'footing' && x.kind !== 'dowel' && x.tone !== 'stirrup' && x.kind.startsWith('footing'))) {
      for (const p of points(b).map((q) => local(f, q))) {
        expect(Math.abs(p[0]), r.name).toBeLessThanOrEqual(a.B / 2 - c + TOL);
        expect(Math.abs(p[1]), r.name).toBeLessThanOrEqual(a.L / 2 - c + TOL);
        expect(p[2], r.name).toBeGreaterThanOrEqual(c - TOL);
        expect(p[2], r.name).toBeLessThanOrEqual(a.h - c + TOL);
        checked++;
      }
    }
  }
  return checked;
}

const across = (b: Rebar3d, i: 0 | 1 | 2) => b.segments[0]![0]![i];

function spacingsHold(rows: SheetRows, bars: readonly Rebar3d[]): number {
  const frames = modelFrames(rows);
  const sets = new Map<string, Rebar3d[]>();
  for (const b of bars) if (b.set) sets.set(b.set, [...(sets.get(b.set) ?? []), b]);
  let checked = 0;
  for (const plan of rows.slabPlan) plan.packages.forEach((pk, i) => {
    const set = sets.get(`slabplan:${plan.level}:${i}`) ?? [];
    expect(set.length, `${plan.level} ${pk.mark}`).toBe(pk.count);
    if (pk.kind === 'integrity') return;
    for (const g of gaps(set.map((b) => across(b, pk.dir === 'x' ? 1 : 0)))) { expect(g, `${plan.level} ${pk.mark}`).toBeCloseTo(pk.bars.spacing, 6); checked++; }
  });
  for (const l of rows.line) {
    const f = frames.line(l)!;
    l.zones.forEach((z, zi) => {
      for (const g of gaps((sets.get(`${l.key}:${l.key}:z${zi}`) ?? []).map((b) => local(f, b.segments[0]![1]!)[0]))) { expect(g, l.name).toBeCloseTo(z.stirrups.spacing, 6); checked++; }
    });
  }
  for (const w of rows.wall) for (const [k, set] of sets) {
    if (!k.startsWith(`${w.key}:h:`)) continue;
    for (const g of gaps(set.map((b) => across(b, 2)))) { expect(g, w.name).toBeCloseTo(w.adopted.horizontal.spacing, 6); checked++; }
  }
  for (const r of rows.footing) for (const dir of ['x', 'y'] as const) {
    const m = r.adopted[dir], set = sets.get(`${r.key}:footing${dir.toUpperCase()}`) ?? [];
    for (const g of gaps(set.map((b) => across(b, dir === 'x' ? 1 : 0)))) { expect(g, r.name).toBeLessThanOrEqual(Math.max(m.spacing, m.outer ?? 0) + 1e-6); checked++; }
  }
  return checked;
}

describe('the sheets\' bars in 3D', () => {
  it('the seven-storey building: every piece of the schedule once, at its length, inside the concrete, at its spacing; an adopted change moves the bars', async () => {
    await solvedExample('pro-edificio-7p');
    const rows = buildSheetRows();
    const bars = sheetBars3d(rows);
    expect(bars.length).toBeGreaterThan(10_000);
    coherent(rows, bars);
    expect(beamsInside(rows, bars)).toBeGreaterThan(1000);
    expect(columnsInside(rows, bars)).toBeGreaterThan(1000);
    expect(slabsInside(rows, bars, pieceOptions(rows).slabCover)).toBeGreaterThan(1000);
    expect(wallsInside(rows, bars)).toBeGreaterThan(100);
    expect(footingsInside(rows, bars)).toBeGreaterThan(100);
    expect(spacingsHold(rows, bars)).toBeGreaterThan(1000);

    const panel = rows.slab.find((r) => r.name === 'L1') ?? rows.slab[0]!;
    const col = rows.column[0]!;
    const sa: SlabAdopted = { ...panel.adopted, bottomX: { dia: 10, spacing: 0.15 } };
    const ca: ColumnAdopted = { ...col.adopted, corner: 20, nx: col.adopted.nx + 1, dx: 20 };
    setAdopted(panel.key, sa);
    setAdopted(col.key, ca);
    const next = buildSheetRows();
    const moved = sheetBars3d(next);
    coherent(next, moved);
    const panelBars = shownBars(moved, { row: { key: panel.key, name: panel.name }, level: '', families: { beam: true, column: true, slab: true, wall: true, footing: true } });
    const bx = panelBars.filter((b) => b.tone === 'bottomX');
    expect(bx.length).toBeGreaterThan(0);
    expect(new Set(bx.map((b) => b.dia))).toEqual(new Set([10]));
    for (const g of gaps(bx.filter((b) => b.set === bx[0]!.set).map((b) => across(b, 1)))) expect(g).toBeCloseTo(0.15, 6);
    const colBars = of(moved, col.key).filter((b) => b.tone === 'column');
    const before = of(bars, col.key).filter((b) => b.tone === 'column');
    expect(colBars.length - before.length).toBe(2);
    expect(colBars.filter((b) => b.dia === 20).length).toBe(4 + 2 * (col.adopted.nx + 1));
    setAdopted(panel.key, null);
    setAdopted(col.key, null);
  }, 600_000);

  it('a small frame on footings: the same, and a line\'s adopted bottom run is drawn as adopted', async () => {
    await solvedExample('pro-rc-frame-area-loads');
    const rows = buildSheetRows();
    const bars = sheetBars3d(rows);
    coherent(rows, bars);
    expect(beamsInside(rows, bars)).toBeGreaterThan(100);
    expect(columnsInside(rows, bars)).toBeGreaterThan(100);
    expect(footingsInside(rows, bars)).toBeGreaterThan(10);
    expect(spacingsHold(rows, bars)).toBeGreaterThan(100);
    const line = rows.line[0]!;
    const la: LineAdopted = { ...line.adopted, bottom: { dia: 20, count: 3 } };
    setAdopted(line.key, la);
    const next = buildSheetRows();
    const moved = sheetBars3d(next);
    coherent(next, moved);
    const run = of(moved, line.key).filter((b) => b.kind === 'continuous' && b.mark === next.line.find((l) => l.key === line.key)!.bars.find((b) => b.kind === 'continuous' && b.face === 'bottom')!.mark);
    expect(run.map((b) => b.dia)).toEqual([20, 20, 20]);
    setAdopted(line.key, null);
  }, 600_000);

  it('the walls of a storehouse: the same', async () => {
    await solvedExample('pro-concrete-wall-storehouse');
    const rows = buildSheetRows();
    const bars = sheetBars3d(rows);
    coherent(rows, bars);
    expect(wallsInside(rows, bars)).toBeGreaterThan(100);
    expect(spacingsHold(rows, bars)).toBeGreaterThan(10);
  }, 600_000);
});
