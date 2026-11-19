import { describe, it, expect, beforeAll } from 'vitest';
import * as wasmSolver from '../../engine/wasm-solver';
import { buildSheetRows, setAdopted, type SheetRows } from '../rc-sheets.svelte';
import { modelFrames, pieceOptions, sheetBars3d, shownBars } from '../rc-rebar-3d.svelte';
import { setFoundationSystem } from '../rc-sheets-footings';
import { patchDesignData } from '../design-data';
import { dropRect } from '../../rc-sheets/footing-punching';
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
    const drops = (r.group?.columns ?? []).flatMap((k) => { const dr = a.punching?.[k.key]?.drop; return dr ? [{ ...dropRect({ B: a.B, L: a.L, xc: k.x, yc: k.y, b: k.b, h: k.h }, dr), hd: dr.hd }] : []; });
    for (const b of of(bars, r.key).filter((x) => x.family === 'footing' && x.kind !== 'dowel' && x.tone !== 'stirrup' && x.kind.startsWith('footing'))) {
      for (const p of points(b).map((q) => local(f, q))) {
        const drop = drops.find((d) => p[0] >= d.x0 + c - TOL && p[0] <= d.x1 - c + TOL && p[1] >= d.y0 + c - TOL && p[1] <= d.y1 - c + TOL && p[2] >= -d.hd + c - TOL && p[2] <= a.h - c + TOL);
        if (drop) { checked++; continue; }
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

const topLeg = (b: Rebar3d): [V3, V3] => { const l = b.segments.at(-1)!; return [l.at(-2)!, l.at(-1)!]; };
const bottomOf = (b: Rebar3d): V3 => b.segments[0]![0]!;

/**
 * Every storey lapped from below (the footing's dowels at the bottom one) gets, beside each of its
 * bars, a bar from below whose last leg stands straight beside it, in contact a bar's diameter in,
 * over the storey's whole lap: no gap between them, and no two bars in one place.
 */
function lapsBeside(rows: SheetRows, bars: readonly Rebar3d[]): { storeys: number; footings: number } {
  const frames = modelFrames(rows);
  let storeys = 0, footings = 0;
  for (const r of rows.column.filter((c) => c.lap && !c.pier && !c.step?.dowels)) {
    const f = frames.column(r)!, [, g, k] = r.key.split(':');
    const footing = rows.footing.find((x) => (x.demand.group ? x.demand.group.members.some((m) => m.column?.rowKey === r.key) : x.demand.column?.rowKey === r.key));
    const member = footing?.demand.group?.members.find((m) => m.column?.rowKey === r.key);
    const from = r.onFooting ? (footing ? of(bars, footing.key).filter((b) => b.kind === 'dowel' && (!member || b.set === `${footing.key}:dowel:${member.key}`)) : []) : of(bars, `column:${g}:${Number(k) - 1}`).filter((b) => b.kind === 'cranked');
    if (r.onFooting && !footing) continue;
    const giving = from.map((b) => { const [p, q] = topLeg(b).map((x) => local(f, x)); return { p: p!, q: q!, dia: b.dia }; });
    const own = of(bars, r.key).filter((b) => b.tone === 'column');
    const firsts = new Map<string, V3>();
    for (const b of own) { const p = local(f, bottomOf(b)), key = `${p[0].toFixed(3)}|${p[1].toFixed(3)}`; if (!firsts.has(key) || firsts.get(key)![2] > p[2]) firsts.set(key, p); }
    expect(giving.length, r.name).toBe(firsts.size);
    for (const p of firsts.values()) {
      const near = giving.map((x) => ({ ...x, d: Math.hypot(x.q[0] - p[0], x.q[1] - p[1]) })).sort((a, b) => a.d - b.d)[0]!;
      expect(Math.abs(near.p[0] - near.q[0]) + Math.abs(near.p[1] - near.q[1]), `${r.name} upright`).toBeLessThan(1e-6);
      expect(near.d, `${r.name} beside`).toBeGreaterThan(0.008);
      expect(near.d, `${r.name} beside`).toBeLessThan(0.033);
      expect(Math.min(near.q[2], near.p[2] + 1e9) - Math.max(near.p[2], p[2]), `${r.name} ${r.level} lap`).toBeGreaterThanOrEqual(r.lap!.length - 1e-3);
    }
    if (r.onFooting) footings++; else storeys++;
  }
  return { storeys, footings };
}

/**
 * A footing under walls (and a pier's column zones), alone or a core inside a strip or a mat, gives
 * each of their bottom bars a dowel, one to a bar, standing beside it a bar's diameter in over its
 * whole lap.
 */
function wallDowelsBeside(rows: SheetRows, bars: readonly Rebar3d[]): number {
  let checked = 0;
  type Pier = NonNullable<SheetRows['footing'][number]['demand']['pier']>;
  type Set = { r: SheetRows['footing'][number]; pier: Pier; at: Array<{ lap: number }>; set: string | undefined };
  const sets = rows.footing.flatMap((r): Set[] => (r.demand.group
    ? r.demand.group.members.filter((m) => m.pier && m.column?.bars?.at?.length).map((m) => ({ r, pier: m.pier!, at: m.column!.bars!.at!, set: `${r.key}:dowel:${m.key}` }))
    : r.demand.pier && r.dowels && r.demand.column?.bars?.at?.length ? [{ r, pier: r.demand.pier, at: r.demand.column.bars.at, set: undefined }] : []));
  for (const { r, pier, at, set } of sets) {
    const keys = new Set([...pier.walls, ...rows.column.filter((c) => c.pier && pier.nodes.includes(c.demand.nodes?.bottom ?? -1)).map((c) => c.key)]);
    const firsts = new Map<string, V3>();
    for (const b of bars.filter((x) => keys.has(x.element) && (x.tone === 'column' || x.kind === 'vertical' || x.kind === 'boundary'))) {
      const p = bottomOf(b), k = `${p[0].toFixed(3)}|${p[1].toFixed(3)}`;
      if (!firsts.has(k) || firsts.get(k)![2] > p[2]) firsts.set(k, p);
    }
    const dowels = of(bars, r.key).filter((b) => b.kind === 'dowel' && (!set || b.set === set));
    expect(dowels.length, r.name).toBe(firsts.size);
    const standing = [...firsts.values()], lap = at.reduce((m, b) => Math.min(m, b.lap), Infinity);
    for (const d of dowels) {
      const [p, q] = topLeg(d);
      const near = standing.map((x) => ({ x, d: Math.hypot(x[0] - q[0], x[1] - q[1]) })).sort((a, b) => a.d - b.d)[0]!;
      expect(near.d, `${r.name} beside`).toBeGreaterThan(0.008);
      expect(near.d, `${r.name} beside`).toBeLessThan(0.033);
      expect(Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]), `${r.name} upright`).toBeLessThan(1e-6);
      expect(q[2] - Math.max(p[2], near.x[2]), `${r.name} lap`).toBeGreaterThanOrEqual(lap - 1e-3);
      checked++;
    }
  }
  return checked;
}

/** A wall's verticals never stand where the bars from the storey below go on over their lap: those are cranked in beside them. */
function wallLapsApart(rows: SheetRows, bars: readonly Rebar3d[]): number {
  let checked = 0;
  for (const w of rows.wall.filter((x) => x.stack?.below)) {
    const lower = of(bars, w.stack!.below!).filter((b) => b.kind === 'vertical' || b.kind === 'boundary').map((b) => ({ leg: topLeg(b), dia: b.dia }));
    for (const b of of(bars, w.key).filter((x) => x.kind === 'vertical' || x.kind === 'boundary')) {
      const p = bottomOf(b);
      for (const l of lower) {
        if (l.leg[1][2] < p[2] + 0.05) continue;
        expect(Math.hypot(l.leg[1][0] - p[0], l.leg[1][1] - p[1]), w.name).toBeGreaterThanOrEqual((l.dia + b.dia) / 2000 - 1e-3);
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
    const laps = lapsBeside(rows, bars);
    expect(laps.footings).toBeGreaterThanOrEqual(11);
    expect(laps.storeys).toBeGreaterThanOrEqual(60);
    expect(wallDowelsBeside(rows, bars)).toBe(31);
    expect(wallLapsApart(rows, bars)).toBeGreaterThan(100);

    for (const system of ['strips', 'mat'] as const) {
      setFoundationSystem(system);
      const grouped = buildSheetRows(), gbars = sheetBars3d(grouped);
      expect(grouped.footing.some((r) => r.group), system).toBe(true);
      coherent(grouped, gbars);
      expect(lapsBeside(grouped, gbars).footings, system).toBeGreaterThanOrEqual(11);
      expect(wallDowelsBeside(grouped, gbars), system).toBe(31);
    }
    patchDesignData({ propertyLines: { minX: true, maxX: true, minY: true, maxY: true } });
    setFoundationSystem('mat');
    const held = buildSheetRows(), hbars = sheetBars3d(held);
    expect(held.footing.some((r) => r.adopted.punching && Object.values(r.adopted.punching).some((x) => x.cage) && Object.values(r.adopted.punching).some((x) => x.drop))).toBe(true);
    coherent(held, hbars);
    expect(footingsInside(held, hbars)).toBeGreaterThan(100);
    expect(hbars.some((b) => b.kind === 'footingPunch')).toBe(true);
    setFoundationSystem('strips');
    const strapped = buildSheetRows(), sbars = sheetBars3d(strapped);
    expect(strapped.footing.some((r) => r.group?.straps.some((s) => s.line))).toBe(true);
    coherent(strapped, sbars);
    patchDesignData({ propertyLines: undefined });
    setFoundationSystem('auto');

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
    expect(lapsBeside(rows, bars).footings).toBeGreaterThan(0);
    const line = rows.line[0]!;
    const la: LineAdopted = { ...line.adopted, bottom: { dia: 20, count: 3 } };
    setAdopted(line.key, la);
    const next = buildSheetRows();
    const moved = sheetBars3d(next);
    coherent(next, moved);
    const run = of(moved, line.key).filter((b) => b.kind === 'continuous' && b.mark === next.line.find((l) => l.key === line.key)!.bars.find((b) => b.kind === 'continuous' && b.face === 'bottom')!.mark);
    expect(run.map((b) => b.dia)).toEqual([20, 20, 20]);
    setAdopted(line.key, null);
    setFoundationSystem(null);
    const bare = buildSheetRows();
    expect(bare.footing).toEqual([]);
    expect(bare.column.some((c) => c.onFooting)).toBe(false);
    coherent(bare, sheetBars3d(bare));
    setFoundationSystem('auto');
  }, 600_000);

  it('the walls of a storehouse: the same, a dowel from the strip footing beside each vertical', async () => {
    await solvedExample('pro-concrete-wall-storehouse');
    const rows = buildSheetRows();
    const bars = sheetBars3d(rows);
    coherent(rows, bars);
    expect(rows.wall.every((w) => w.onFooting)).toBe(true);
    expect(wallDowelsBeside(rows, bars)).toBe(108);
    expect(wallsInside(rows, bars)).toBeGreaterThan(100);
    expect(spacingsHold(rows, bars)).toBeGreaterThan(10);
  }, 600_000);
});
