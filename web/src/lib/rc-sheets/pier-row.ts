import { CRITERION } from './criteria';
/**
 * A pier's proposal and how its walls and columns read it: the walls' curtains as each wall
 * designs them, the column zones grown until the whole section holds (`pier-design.ts`), then
 * boundary bars at the walls' ends while it still does not. Each wall's row carries the section's
 * check and draws the columns inside it; each column's row says it is part of the pier and
 * keeps only the detailing of its zone.
 */
import { checkPier, pierBars, zoneBarsInPlan, type PierCheck, type PierCombo, type ZoneBars } from './pier-design';
import { columnLabel, type ColumnDemand, type ColumnRow } from './column-row';
import { insideConvex, type P, type Pier, type PierWall } from './piers';
import type { Fmt } from './format';
import type { WallRow } from './wall-row';
import { check, isGenerous, type CheckLine, type ColumnAdopted, type ComboTable, type Materials, type StepGroup } from './types';

export interface PierZone extends ZoneBars { key: string; name: string; start: ColumnAdopted; proposed: ColumnAdopted; isAdopted: boolean; host: string }

/** A pier as one wall's row reads it: the section's check, and the columns inside this wall in its own axes (x along it from its first end, y across from its first face), m. */
export interface WallPier {
  key: string; name: string;
  ratio: number; ok: boolean; combo: string;
  columns: Array<{ key: string; name: string; host: boolean; outline: P[]; bars: Array<P & { dia: number }>; tieDia: number; tieSpacing: number; label: string }>;
}

export interface PierDesign {
  pier: Pier;
  legs: WallRow[];
  zones: PierZone[];
  check: PierCheck;
  combos: PierCombo[];
  missing: string[];
  /** The boundary bars the pier asked of its walls' ends, where the columns were not enough. */
  boundary?: { count: number; diameter: number };
}

export interface PierInput {
  pier: Pier;
  walls: ReadonlyMap<string, PierWall>;
  legs: Array<{ key: string; cover: number; design: (boundary?: { count: number; diameter: number }) => WallRow }>;
  zones: Array<Omit<PierZone, 'adopted' | 'proposed' | 'isAdopted'> & { adopted?: ColumnAdopted; candidates: (hoops?: { dia: number; spacing: number }) => ColumnAdopted[] }>;
  mat: Materials;
  combos: PierCombo[];
  missing: string[];
  boundaries: ReadonlyArray<{ count: number; diameter: number }>;
}

/** The hoops of the walls' boundary zones a column zone stands in: the thickest at the closest spacing. */
function hoopsAt(zone: Pick<PierZone, 'corners' | 'key'>, pier: Pier, legs: readonly WallRow[]): { dia: number; spacing: number } | undefined {
  const own = pier.columns.find((c) => c.key === zone.key)?.legs ?? [];
  const hs = legs.filter((l) => own.includes(l.key) && l.seismic?.hoops && l.seismic.boundaryLength > 0).map((l) => l.seismic!.hoops!);
  return hs.length ? { dia: Math.max(...hs.map((h) => h.dia)), spacing: Math.min(...hs.map((h) => h.spacing)) } : undefined;
}

export function designPier(o: PierInput): PierDesign {
  let legs = o.legs.map((l) => l.design());
  const lists = o.zones.map((z) => (z.adopted ? [z.adopted] : (() => { const c = z.candidates(hoopsAt(z, o.pier, legs)); return c.length ? c : [z.start]; })()));
  const zonesAt = (k: number) => o.zones.map((z, i) => ({ ...z, adopted: lists[i]![Math.min(k, lists[i]!.length - 1)]! }));
  const legBars = (rows: readonly WallRow[]) => rows.map((r, i) => ({ wall: o.walls.get(r.key)!, cover: o.legs[i]!.cover, adopted: r.adopted }));
  const run = (rows: readonly WallRow[], zs: readonly ZoneBars[]) => checkPier(o.pier, pierBars(o.pier, legBars(rows), zs), o.mat, o.combos);
  const steps = Math.max(1, ...lists.map((l) => l.length));
  let k = 0, zs = zonesAt(0), result = run(legs, zs);
  while (!result.ok && k < steps - 1) { k++; zs = zonesAt(k); result = run(legs, zs); }
  let boundary: PierDesign['boundary'];
  if (!result.ok && legs.some((l) => !l.isAdopted)) {
    for (const b of o.boundaries) {
      const rows = o.legs.map((l) => l.design(b));
      const r = run(rows, zs);
      legs = rows; result = r; boundary = b;
      if (r.ok) break;
    }
  }
  const zones: PierZone[] = o.zones.map((z, i) => ({ ...z, adopted: zs[i]!.adopted, proposed: zs[i]!.adopted, isAdopted: !!z.adopted }));
  return { pier: o.pier, legs, zones, check: result, combos: o.combos, missing: o.missing, ...(boundary ? { boundary } : {}) };
}

const toLeg = (w: PierWall) => {
  const dx = w.plan.x2 - w.plan.x1, dy = w.plan.y2 - w.plan.y1, L = Math.hypot(dx, dy) || 1;
  const u = { x: dx / L, y: dy / L }, n = { x: -dy / L, y: dx / L }, mid = { x: (w.plan.x1 + w.plan.x2) / 2, y: (w.plan.y1 + w.plan.y2) / 2 };
  return (p: P): P => ({ x: (p.x - w.plan.x1) * u.x + (p.y - w.plan.y1) * u.y, y: (p.x - mid.x) * n.x + (p.y - mid.y) * n.y + w.thickness / 2 });
};

/** The pier's line on a wall's or a column's row. */
export const pierLine = (p: PierDesign, fmt: Fmt): CheckLine => check('rcSheets.v.pierPM', p.check.ok, {
  clause: '§22.4', demand: `${p.pier.name} (${p.check.combo})`, capacity: `${p.check.bars} · As = ${fmt(p.check.ast, 1)} cm²`, ratio: p.check.ratio,
});

/** The pier's working, as a wall's or a column's steps show it. */
export function pierSteps(p: PierDesign, fmt: Fmt): StepGroup {
  const w = p.check.ratios.reduce((b, x, i) => (x > p.check.ratios[b]! ? i : b), 0), k = p.combos[w];
  const vol = p.pier.columns.reduce((s, c) => s + c.overlap, 0) * p.pier.height;
  return {
    title: 'rcSheets.g.pier',
    steps: [
      { label: 'rcSheets.s.pierMembers', formula: p.pier.name, value: '' },
      { label: 'rcSheets.s.pierSection', formula: 'A · (xG; yG)', value: `${fmt(p.pier.area, 3)} m² · (${fmt(p.pier.centroid.x, 2)}; ${fmt(p.pier.centroid.y, 2)}) m` },
      { label: 'rcSheets.s.pierForces', formula: 'N = Σ Nwall + Σ Ncol; M = Σ (M + N·e) about G', value: k ? `${k.combo}: N = ${fmt(k.n, 0)} kN · Mx = ${fmt(k.mx, 0)} · My = ${fmt(k.my, 0)} kN·m` : '' },
      ...p.zones.map((z) => ({ label: 'rcSheets.s.pierZone', formula: `${z.name}: ${columnLabel(z.adopted)}`, value: `${z.isAdopted ? '' : CRITERION}` })),
      ...(p.boundary ? [{ label: 'rcSheets.s.pierBoundary', formula: `${p.boundary.count} Ø${p.boundary.diameter}`, value: CRITERION }] : []),
      { label: 'rcSheets.s.pierCheck', formula: 'φMn(Pu) along (Mx; My) ≥ Mu (§22.4)', value: `${fmt(p.check.ratio, 3)} (${p.check.combo})`, ok: p.check.ok },
      { label: 'rcSheets.s.pierOverlap', formula: 'Vcol ∩ walls', value: `${fmt(vol, 3)} m³` },
      { label: 'rcSheets.s.pierScope', value: '' },
    ],
  };
}

const forcesLine = (p: PierDesign): CheckLine[] => (p.missing.length ? [check('rcSheets.v.forcesMissing', false, { demand: p.missing.join(', ') })] : []);

/** A wall's row as a leg of the pier: the section's check in place of its own in-plane one, the columns inside it drawn with their bars. */
export function legOfPier(row: WallRow, p: PierDesign, fmt: Fmt): WallRow {
  const w = p.pier.walls.find((x) => x.key === row.key);
  const wall: PierWall | undefined = row.demand.plan ? { key: row.key, name: row.name, plan: row.demand.plan, thickness: row.thickness, z: row.demand.z ?? 0, height: row.height } : undefined;
  const local = wall ? toLeg(wall) : (q: P) => q;
  const columns = p.zones.filter((z) => w && p.pier.columns.find((c) => c.key === z.key)?.legs.includes(row.key)).map((z) => ({
    key: z.key, name: z.name, host: z.host === row.key, outline: z.corners.map(local),
    bars: zoneBarsInPlan(z).map((b) => ({ ...local(b), dia: b.dia })), tieDia: z.adopted.tieDia, tieSpacing: z.adopted.tieSpacing, label: columnLabel(z.adopted),
  }));
  const pier: WallPier = { key: p.pier.key, name: p.pier.name, ratio: p.check.ratio, ok: p.check.ok, combo: p.check.combo, columns };
  const at = row.verifications.findIndex((v) => v.label === 'rcSheets.v.wallShear');
  const lines = [...forcesLine(p), pierLine(p, fmt)];
  const verifications = at >= 0 ? [...row.verifications.slice(0, at), ...lines, ...row.verifications.slice(at)] : [...lines, ...row.verifications];
  const ok = verifications.every((v) => v.ok), generous = isGenerous(verifications);
  return {
    ...row, pier, verifications, generous, utilization: Math.max(row.utilization, p.check.ratio),
    status: ok ? (generous ? 'warn' : 'ok') : 'fail',
    steps: [...row.steps.filter((g) => g.title !== 'rcSheets.g.proposal'), pierSteps(p, fmt), ...row.steps.filter((g) => g.title === 'rcSheets.g.proposal')],
  };
}

/** Of a column row designed with no forces, the lines on the detailing of its bars: what still holds them as a zone of the pier. */
const DETAILING = new Set(['rcSheets.v.colCornerLargest', 'rcSheets.v.colMaxPitch', 'rcSheets.v.colMinBar', 'rcSheets.v.colMinSide', 'rcSheets.v.colNoLayout', 'rcSheets.v.colSpacing',
  'rcSheets.v.crossties', 'rcSheets.v.longList', 'rcSheets.v.rhoMax', 'rcSheets.v.rhoMin', 'rcSheets.v.tieDia', 'rcSheets.v.tieList', 'rcSheets.v.tieSpacing', 'rcSheets.v.colCrank',
  'rcSheets.v.colOffset', 'rcSheets.v.colLapFit', 'rcSheets.v.seisColAsh', 'rcSheets.v.seisColHx', 'rcSheets.v.seisColSo', 'rcSheets.v.seisColRho']);

/** A column with every force taken off: what its row proposes then is the least its rules allow. */
export const unloaded = (d: ColumnDemand): ColumnDemand => {
  const { sway: _s, missing: _m, ...rest } = d;
  return { ...rest, cases: d.cases.map((c) => ({ combo: c.combo, pu: 0, puMin: 0, mxTop: 0, mxBot: 0, myTop: 0, myBot: 0, vx: 0, vy: 0 })) };
};

/** A column storey inside a pier: no design of its own, the pier's check and its zone's detailing; its forces stay as the analysis gave them. */
export function columnOfPier(base: ColumnRow, d: ColumnDemand, p: PierDesign, zone: PierZone, fmt: Fmt): ColumnRow {
  const walls = p.pier.walls.map((w) => w.name);
  const verifications = [check('rcSheets.v.columnInPier', true, { clause: CRITERION, demand: walls.join(' + ') }), ...forcesLine(p), pierLine(p, fmt), ...base.verifications.filter((v) => DETAILING.has(v.label))];
  const ok = verifications.every((v) => v.ok);
  const combos: ComboTable = {
    headers: ['N', 'Mx', 'My'],
    rows: p.combos.map((k, i) => ({ combo: k.combo, values: [fmt(k.n, 1), fmt(k.mx, 1), fmt(k.my, 1)], ratio: p.check.ratios[i] ?? 0, ok: (p.check.ratios[i] ?? 0) <= 1 + 1e-6 })),
  };
  return {
    ...base, demand: d, verifications, combos, status: ok ? 'ok' : 'fail', generous: false,
    proposed: zone.proposed, adopted: zone.adopted, isAdopted: zone.isAdopted,
    steps: [pierSteps(p, fmt)],
    pier: { key: p.pier.key, name: p.pier.name, walls, host: zone.host },
  };
}

/** Whether a point of a wall's plan, in its own axes, falls inside a column of its pier. */
export const inPierColumn = (pier: WallPier | undefined, x: number, y: number): boolean => !!pier?.columns.some((c) => insideConvex({ x, y }, c.outline));
