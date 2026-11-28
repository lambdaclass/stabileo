import { meshArea, proposeMesh } from './bars';
import type { LevelGeometry, PlanDir, PlanIntegrity, PlanLayer, PlanRect, PlanSupport, SlabPackage, SlabPlanCheck, SlabPlanCode } from './slab-plan';
import type { SlabFace, SlabRow } from './slab-row';

const TOL = 0.05;
const up = (x: number) => Math.ceil(x / 0.05 - 1e-9) * 0.05;
const other = (d: PlanDir): PlanDir => (d === 'x' ? 'y' : 'x');
const lo = (r: PlanRect, d: PlanDir) => (d === 'x' ? r.x0 : r.y0);
const hi = (r: PlanRect, d: PlanDir) => (d === 'x' ? r.x1 : r.y1);
const face = (d: PlanDir, layer: PlanLayer): SlabFace => `${layer}${d.toUpperCase()}` as SlabFace;

/** Where a slab bar of each direction lies in the depth, m: X outermost, Y on it; and the leg a hooked end turns down or up from `y`, its tip at the opposite cover, so a Y bar's leg is shorter by the X bar it lies on. */
export function barHeights(cover: number) {
  return {
    bottom: (row: Pick<SlabRow, 'adopted'>, d: PlanDir, dia: number) => cover + (d === 'x' ? dia / 2000 : row.adopted.bottomX.dia / 1000 + dia / 2000),
    top: (h: number, d: PlanDir, dia: number, outerDia: number) => h - cover - (d === 'x' ? dia / 2000 : outerDia / 1000 + dia / 2000),
    leg: (h: number, y: number, layer: PlanLayer, dia: number) => Math.max(0.05, layer === 'top' ? y - cover - dia / 2000 : h - cover - dia / 2000 - y),
  };
}

export type NewPackage = Omit<SlabPackage, 'id' | 'mark' | 'count' | 'length' | 'weight'>;

/** A panel as the corner and integrity bars read it. */
export interface ExtraPanel {
  key: string; name: string; rect: PlanRect; h: number; row: SlabRow;
  /** Two-way and not a cantilever either way: where §8.7.3.1 asks corner bars. */
  twoWay: boolean;
  /** Clear span each way, m. */
  ln: Record<PlanDir, number>;
  /** The supports on its edge at one end of `d`. */
  edges(d: PlanDir, end: 'lo' | 'hi'): readonly PlanSupport[];
}

/** What laying them needs of the plan: the bars already there, how to add one, and the code's lengths, m. */
export interface ExtraBarsPlan {
  panels: readonly ExtraPanel[];
  packages: readonly SlabPackage[];
  add(pk: NewPackage, bars?: number): void;
  cover: number;
  diameters: readonly number[];
  mandrel(dia: number): number;
  ldh(dia: number): number;
  lap(dia: number, top: boolean, h: number, spacing: number): number;
}

/** A point of a corner's square where its bars are added up, and what they must give. */
export interface CornerSample { layer: PlanLayer; dir: PlanDir; along: number; across: number; where: string; required: number; sMax: number }

/**
 * §8.7.3.1: at each exterior corner of a two-way panel held by edge beams or walls, bars both ways
 * on the rule's faces over a square of side `rule.side` of the longer clear span, carrying the
 * panel's largest bottom steel; added only where the bars already there fall short.
 */
export function cornerBars(plan: ExtraBarsPlan, rule: NonNullable<SlabPlanCode['corners']>): CornerSample[] {
  const y = barHeights(plan.cover);
  const samples: CornerSample[] = [];
  for (const p of plan.panels) {
    if (!p.twoWay) continue;
    const meshes = [p.row.adopted.bottomX, p.row.adopted.bottomY].filter((m) => m.dia > 0 && m.spacing > 0);
    if (!meshes.length) continue;
    const mesh = meshes.reduce((m, n) => (meshArea(n) > meshArea(m) ? n : m));
    const required = Math.max(meshArea(mesh), p.row.faces.bottomX.asReq, p.row.faces.bottomY.asReq);
    const side = up(rule.side * Math.max(p.ln.x, p.ln.y));
    const held = (d: PlanDir, end: 'lo' | 'hi', across: number) => p.edges(d, end)
      .find((s) => (s.kind === 'beam' || s.kind === 'wall') && !(s.below && s.above) && across >= s.from - TOL && across <= s.to + TOL);
    for (const ex of ['lo', 'hi'] as const) for (const ey of ['lo', 'hi'] as const) {
      const corner = { x: ex === 'lo' ? p.rect.x0 : p.rect.x1, y: ey === 'lo' ? p.rect.y0 : p.rect.y1 };
      const sx = held('x', ex, corner.y), sy = held('y', ey, corner.x);
      if (!sx || !sy) continue;
      const edges = { x: sx, y: sy };
      const inward = { x: ex === 'lo' ? 1 : -1, y: ey === 'lo' ? 1 : -1 };
      const faceAt = { x: corner.x + inward.x * sx.half, y: corner.y + inward.y * sy.half };
      for (const layer of rule.faces) for (const d of ['x', 'y'] as const) {
        const a = other(d), e = edges[d], sign = inward[d];
        const sMax = p.row.faces[face(d, 'bottom')].sMax;
        const along = faceAt[d] + sign * side / 2, across = faceAt[a] + inward[a] * side / 2;
        samples.push({ layer, dir: d, along, across, where: p.name, required, sMax });
        const have = stripCheck(plan.packages, layer, d, along, across, p.name, required, sMax);
        if (have.provided >= required - 1e-6) continue;
        const bars = have.provided <= 1e-6 ? mesh : proposeMesh(required - have.provided, sMax, plan.diameters);
        const start = corner[d] - sign * (e.half - plan.cover), end = faceAt[d] + sign * side;
        const x0 = Math.min(start, end), x1 = Math.max(start, end);
        const yv = layer === 'top' ? y.top(p.h, d, bars.dia, p.row.adopted.topX.dia || bars.dia) : y.bottom(p.row, d, bars.dia);
        const legY = yv + (layer === 'top' ? -1 : 1) * y.leg(p.h, yv, layer, bars.dia);
        const pts: Array<[number, number]> = sign > 0 ? [[0, legY], [0, yv], [x1 - x0, yv]] : [[0, yv], [x1 - x0, yv], [x1 - x0, legY]];
        const b0 = faceAt[a], b1 = faceAt[a] + inward[a] * side;
        const available = Math.max(0, 2 * e.half - plan.cover);
        plan.add({
          layer, dir: d, kind: 'corner', bars, from: x0, to: x1, band: { from: Math.min(b0, b1), to: Math.max(b0, b1) },
          shape: { pts, mandrel: plan.mandrel(bars.dia), dia: bars.dia }, runs: [{ face: layer, from: x0, to: x1 }], panels: [p.key], reach: [],
          ...(layer === 'top' ? { anchor: { available, needed: plan.ldh(bars.dia), ok: plan.ldh(bars.dia) <= available + 1e-9 } } : {}),
        });
      }
    }
  }
  return samples;
}

/**
 * §8.7.4.2.2: at each column no beam touches, the bottom bars of each direction continuous through
 * its core (inset `inset` from its faces); two more, lapped past the core, where fewer than `required`.
 */
export function integrityBars(plan: ExtraBarsPlan, geom: Pick<LevelGeometry, 'beams' | 'columns'>, required: number, inset: number): PlanIntegrity[] {
  const y = barHeights(plan.cover);
  const out: PlanIntegrity[] = [];
  const touches = (b: LevelGeometry['beams'][number], k: LevelGeometry['columns'][number]) => {
    const dx = b.x2 - b.x1, dy = b.y2 - b.y1, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((k.x - b.x1) * dx + (k.y - b.y1) * dy) / l2)) : 0;
    return Math.hypot(b.x1 + t * dx - k.x, b.y1 + t * dy - k.y) <= Math.max(k.b, k.h) / 2 + b.b / 2 + TOL;
  };
  for (const k of geom.columns.filter((q) => q.b > 0 && q.h > 0 && !geom.beams.some((b) => touches(b, q)))) {
    const host = plan.panels.filter((p) => k.x >= p.rect.x0 - TOL && k.x <= p.rect.x1 + TOL && k.y >= p.rect.y0 - TOL && k.y <= p.rect.y1 + TOL);
    if (!host.length) continue;
    for (const d of ['x', 'y'] as const) {
      const a = other(d);
      const at = (dd: PlanDir) => (dd === 'x' ? k.x : k.y), ext = (dd: PlanDir) => (dd === 'x' ? k.b : k.h);
      const core: [number, number] = [at(d) - ext(d) / 2 + inset, at(d) + ext(d) / 2 - inset];
      const across: [number, number] = [at(a) - ext(a) / 2 + inset, at(a) + ext(a) / 2 - inset];
      if (core[1] - core[0] < TOL || across[1] - across[0] < TOL) continue;
      const slab: [number, number] = [Math.min(...host.map((p) => lo(p.rect, d))) + plan.cover, Math.max(...host.map((p) => hi(p.rect, d))) - plan.cover];
      const h = Math.min(...host.map((p) => p.h));
      const bottomRuns = (pk: SlabPackage) => (pk.dir === d && pk.layer === 'bottom' ? pk.runs.filter((r) => r.face === 'bottom') : []);
      const continuous = (v: number, from: number, to: number) => {
        let reach = from;
        const runs = plan.packages.filter((pk) => v >= pk.band.from - 1e-9 && v <= pk.band.to + 1e-9).flatMap(bottomRuns).sort((r, q) => r.from - q.from);
        for (const r of runs) if (r.from <= reach + 1e-6) reach = Math.max(reach, r.to);
        return reach >= to - 1e-6;
      };
      const through = (pk: SlabPackage) => {
        if (!bottomRuns(pk).some((r) => r.from <= core[0] + 1e-6 && r.to >= core[1] - 1e-6)) return 0;
        const l = plan.lap(pk.bars.dia, false, h, pk.bars.spacing);
        const from = Math.max(core[0] - l, slab[0]), to = Math.min(core[1] + l, slab[1]);
        return barPositions(pk).filter((v) => v >= across[0] - 1e-9 && v <= across[1] + 1e-9 && continuous(v, from, to)).length;
      };
      let bars = plan.packages.reduce((t, pk) => t + through(pk), 0);
      const dia = Math.max(0, ...host.map((p) => p.row.adopted[face(d, 'bottom')].dia)) || 12;
      if (bars < required) {
        const width = across[1] - across[0];
        const l = plan.lap(dia, false, h, width);
        const x0 = Math.max(core[0] - l, slab[0]), x1 = Math.min(core[1] + l, slab[1]);
        const yb = y.bottom(host[0]!.row, d, dia), leg = y.leg(h, yb, 'bottom', dia);
        const pts: Array<[number, number]> = [
          ...(x0 <= slab[0] + 1e-9 ? [[0, yb + leg] as [number, number]] : []), [0, yb], [x1 - x0, yb],
          ...(x1 >= slab[1] - 1e-9 ? [[x1 - x0, yb + leg] as [number, number]] : []),
        ];
        plan.add({
          layer: 'bottom', dir: d, kind: 'integrity', bars: { dia, spacing: width }, from: x0, to: x1, band: { from: across[0], to: across[1] },
          shape: { pts, mandrel: plan.mandrel(dia), dia }, runs: [{ face: 'bottom', from: x0, to: x1 }], panels: host.map((p) => p.key), reach: [],
        }, required);
        bars += required;
      }
      out.push({ x: k.x, y: k.y, dir: d, bars, required, dia });
    }
  }
  return out;
}

/** Where across its strip each bar of a package lies, m: as `barsAcross` spaces them, and an integrity pair at the core's two sides. */
export function barPositions(pk: Pick<SlabPackage, 'kind' | 'band' | 'bars' | 'count'>): number[] {
  if (pk.kind === 'integrity') return pk.count === 1 ? [(pk.band.from + pk.band.to) / 2] : Array.from({ length: pk.count }, (_, i) => pk.band.from + (i * (pk.band.to - pk.band.from)) / Math.max(1, pk.count - 1));
  const edge = Math.min(0.05, pk.bars.spacing / 2);
  return Array.from({ length: pk.count }, (_, i) => pk.band.from + edge + i * pk.bars.spacing);
}

/** The bars of one face and direction lying at a point, added up per metre against what is required there. */
export function stripCheck(packages: readonly SlabPackage[], layer: PlanLayer, d: PlanDir, at: number, across: number, where: string, required: number, sMax: number): SlabPlanCheck {
  const present = packages.filter((pk) => pk.dir === d && across >= pk.band.from - 1e-9 && across <= pk.band.to + 1e-9
    && pk.runs.some((r) => r.face === layer && at >= r.from - 1e-9 && at <= r.to + 1e-9));
  const provided = present.reduce((t, pk) => t + meshArea(pk.bars), 0);
  const perM = present.reduce((t, pk) => t + 1 / pk.bars.spacing, 0);
  const spacing = perM > 0 ? 1 / perM : Infinity;
  return { layer, dir: d, where, required, provided, spacing, sMax, ok: provided >= required - 1e-6 && spacing <= sMax + 1e-6 };
}
