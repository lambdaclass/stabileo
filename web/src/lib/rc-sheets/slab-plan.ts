import { CIRSOC_LINE, type LineCode } from './beam-line';
import { bentBarMandrel } from '../codes/cirsoc201/bar-geometry';
import type { BeamContext } from './beam-row';
import { barArea, meshArea, meshLabel, proposeMesh } from './bars';
import type { Fmt } from './format';
import { developedLength, legLengths, shapeWeight, type BarShape } from './shape';
import { barHeights, cornerBars, integrityBars, stripCheck, type ExtraBarsPlan } from './slab-corner-integrity';
import { cirsocSlabDevelopment, cirsocSlabLap, type SlabBarLayout, type SlabFace, type SlabRow } from './slab-row';
import type { Materials, MeshBars } from './types';

export type PlanDir = 'x' | 'y';
export type PlanLayer = 'bottom' | 'top';

export interface PlanRect { x0: number; x1: number; y0: number; y1: number }

/** A beam or a wall in plan, along its axis; `b` is its width, m. */
export interface PlanBeam { x1: number; y1: number; x2: number; y2: number; b: number; /** A beam's depth, m. */ h?: number; kind: 'beam' | 'wall' }

export interface PlanColumn { x: number; y: number; b: number; h: number }

export interface LevelGeometry { level: string; beams: PlanBeam[]; columns: PlanColumn[] }

/**
 * The rules a level's slab bars are laid out by: the code's development and lap lengths, and how far
 * a top bar reaches past a support face as a fraction of the clear span it enters.
 */
export interface SlabPlanCode {
  line: LineCode;
  /** ld and the tension lap of a slab bar from its layout, m, where the code's general expression reads it; absent, the line's. */
  development?(mat: Materials, dia: number, top: boolean, h: number, layout: SlabBarLayout): number;
  lap?(mat: Materials, dia: number, top: boolean, h: number, layout: SlabBarLayout): number;
  topReach: { interior: number; end: number; middle: number };
  /** Where a bent bar leaves the bottom, as a fraction of the clear span from the support face, in a one-way and a two-way panel. */
  bendAt: { oneWay: number; twoWay: number };
  /** Inside diameter a bent-up bar is bent on, m; absent, the line's mandrel. */
  bentMandrel?(dia: number): number;
  /** How far a bottom bar runs past the face of a beam or wall, before the support's far face stops it, m. */
  bottomEmbed(dia: number): number;
  /** Bars at the exterior corners of two-way panels held by edge beams or walls: the side of the square as a fraction of the longer clear span, and the faces. */
  corners?: { side: number; faces: readonly PlanLayer[] };
  /** Bottom bars per direction a slab resting on a column with no beam must carry continuous through its core. */
  integrity?: { bars: number };
  clause: { topReach: string; cantilever: string; bottomEmbed: string; development: string; bendAt?: string; corners?: string; integrity?: string };
}

const ACI_PLAN_CLAUSES = { topReach: '§8.7.4.1.3 (Fig. 8.7.4.1.3)', cantilever: '§25.4', bottomEmbed: '§8.7.4.2', development: '§25.4.2, §25.4.3, §25.5.2', corners: '§8.7.3.1', integrity: '§8.7.4.2.2' };

/** ACI 318-19: the corner and integrity bars of §8.7.3.1 and §8.7.4.2 as CIRSOC has them; its own development and bends. */
export const ACI_SLAB_PLAN: SlabPlanCode = {
  line: CIRSOC_LINE,
  topReach: { interior: 0.3, end: 0.3, middle: 0.22 },
  bendAt: { oneWay: 0.2, twoWay: 0.2 },
  bottomEmbed: () => 0.15,
  corners: { side: 0.2, faces: ['top', 'bottom'] },
  integrity: { bars: 2 },
  clause: ACI_PLAN_CLAUSES,
};

/** CIRSOC 201-2025, with the FIUBA course's bend points and bent-bar mandrels where the code is silent. */
export const CIRSOC_SLAB_PLAN: SlabPlanCode = {
  ...ACI_SLAB_PLAN,
  development: (mat, dia, top, h, layout) => cirsocSlabDevelopment(mat, dia, top, h, layout).ldM,
  lap: cirsocSlabLap,
  bendAt: { oneWay: 1 / 7, twoWay: 1 / 8 },
  bentMandrel: bentBarMandrel,
  clause: { ...ACI_PLAN_CLAUSES, development: '§25.4.2.4, §25.4.3, §25.5.2', bendAt: 'FIUBA §13.1–13.2, §11.4' },
};

export type SupportKind = 'beam' | 'wall' | 'columns' | 'joint' | 'free';

/** A stretch of a line the bars of one direction cross: shared by two panels, the edge of one, or a row of columns inside one. */
export interface PlanSupport {
  id: string;
  dir: PlanDir;
  /** The line's coordinate along `dir`, and its extent across, m. */
  at: number; from: number; to: number;
  kind: SupportKind;
  /** Half the width of the beam or wall on it, m. */
  half: number;
  below?: string; above?: string;
}

export type PackageKind = 'span' | 'bent' | 'support' | 'edge' | 'cantilever' | 'corner' | 'integrity';

export interface SlabPackage {
  id: string;
  mark: string;
  layer: PlanLayer;
  dir: PlanDir;
  kind: PackageKind;
  bars: MeshBars;
  count: number;
  /** Along `dir`, m, in the level's coordinates. */
  from: number; to: number;
  /** The strip across `dir` the bars are spaced over, m. */
  band: { from: number; to: number };
  /** The bar in its vertical plane: x from `from` along `dir`, y up from the soffit. */
  shape: BarShape;
  /** One bar's cut length, m, and the package's weight, kg. */
  length: number; weight: number;
  /** Where along `dir` the bar lies at a face, carrying tension there. */
  runs: Array<{ face: PlanLayer; from: number; to: number }>;
  panels: string[];
  /** A bar of the uniform bottom mesh, said in a note rather than drawn. */
  base?: boolean;
  /** How far past each support face it reaches, and what it had to. */
  reach: Array<{ at: number; length: number; needed: number }>;
  /** Anchorage into an edge beam or wall: what is there for it, and the hooked length it needs, m. */
  anchor?: { available: number; needed: number; ok: boolean };
}

/** A strip where the bars present are added up against what the panel rows require. */
export interface SlabPlanCheck {
  layer: PlanLayer; dir: PlanDir;
  /** A panel's name, or the support's id. */
  where: string;
  required: number; provided: number;
  spacing: number; sMax: number;
  ok: boolean;
  /** A corner's square (areas, cm²/m), or a column's integrity bars (`required` and `provided` are bars). */
  kind?: 'corner' | 'integrity';
}

/** A column a slab rests on with no beam: the bottom bars of each direction continuous through its core. */
export interface PlanIntegrity { x: number; y: number; dir: PlanDir; bars: number; required: number; dia: number }

export interface PlanPanel { key: string; name: string; rect: PlanRect; h: number; status: SlabRow['status'] }

export interface LevelPlan {
  level: string;
  panels: PlanPanel[];
  beams: PlanBeam[];
  columns: PlanColumn[];
  supports: PlanSupport[];
  packages: SlabPackage[];
  /** The bottom mesh every panel has both ways, when they all have the same one. */
  baseMesh?: MeshBars;
  checks: SlabPlanCheck[];
  anchorage: Array<{ dia: number; ld: number; ldTop: number; ldh: number; lap: number }>;
  cantilevers: Array<{ panel: string; dir: PlanDir; length: number }>;
  integrity: PlanIntegrity[];
  bent: boolean;
  rules: { reach: SlabPlanCode['topReach']; clause: SlabPlanCode['clause']; bendAt: SlabPlanCode['bendAt']; corners?: SlabPlanCode['corners']; integrity?: SlabPlanCode['integrity'] };
  ok: boolean;
}

export interface SlabPlanContext {
  mat: Materials; cover: number; diameters: readonly number[]; bent: boolean;
  /** From a column's face to the centres of its outer bars, m, which bound the core integrity bars pass through. */
  columnInset?: number;
}

const TOL = 0.05;
const STEP = 0.05;
const up = (x: number) => Math.ceil(x / STEP - 1e-9) * STEP;
const other = (d: PlanDir): PlanDir => (d === 'x' ? 'y' : 'x');
const lo = (r: PlanRect, d: PlanDir) => (d === 'x' ? r.x0 : r.y0);
const hi = (r: PlanRect, d: PlanDir) => (d === 'x' ? r.x1 : r.y1);
const face = (d: PlanDir, layer: PlanLayer): SlabFace => `${layer}${d.toUpperCase()}` as SlabFace;
const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);

/** The bars across a strip: one at each end a little in from it and the rest at the spacing between. */
export const barsAcross = (width: number, s: number): number => (s > 0 ? Math.max(1, Math.floor(Math.max(0, width - 2 * Math.min(0.05, s / 2)) / s + 1e-9) + 1) : 0);

function subtract(from: number, to: number, cuts: Array<[number, number]>): Array<[number, number]> {
  let out: Array<[number, number]> = [[from, to]];
  for (const [a, b] of cuts) out = out.flatMap(([p, q]) => [[p, Math.min(q, a)], [Math.max(p, b), q]] as Array<[number, number]>).filter(([p, q]) => q - p > TOL);
  return out;
}

interface Panel { key: string; name: string; rect: PlanRect; h: number; row: SlabRow }

export function slabPlan(level: string, rows: readonly SlabRow[], geom: LevelGeometry, c: SlabPlanContext, code: SlabPlanCode = CIRSOC_SLAB_PLAN): LevelPlan {
  const panels: Panel[] = rows.filter((r) => r.demand.bounds).map((r) => {
    const b = r.demand.bounds!;
    return { key: r.key, name: r.name, rect: { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 }, h: r.h, row: r };
  });
  const byKey = new Map(panels.map((p) => [p.key, p]));
  const hMin = panels.length ? Math.min(...panels.map((p) => p.h)) : 0.15;
  const bctx: BeamContext = { mat: c.mat, cover: c.cover, stirrupDia: 0, diameters: c.diameters, torsion: 'equilibrium' };
  const ld = (dia: number, top: boolean, h: number, spacing: number) => (code.development ? code.development(c.mat, dia, top, h, { cover: c.cover, spacing }) : code.line.development(bctx, dia, top, h));
  const ldh = (dia: number) => code.line.hooked(bctx, dia, true, hMin);
  const lap = (dia: number, top: boolean, h: number, spacing: number) => (code.lap ? code.lap(c.mat, dia, top, h, { cover: c.cover, spacing }) : code.line.lap(bctx, dia, top, h));
  const mandrel = (dia: number) => code.line.mandrel?.(dia) ?? 6 * dia / 1000;
  const bentMandrel = (dia: number) => code.bentMandrel?.(dia) ?? mandrel(dia);

  const supportOn = (d: PlanDir, at: number, a0: number, a1: number): { kind: 'beam' | 'wall'; half: number } | null => {
    let covered = 0, half = 0, kind: 'beam' | 'wall' = 'wall';
    for (const b of geom.beams) {
      const [p, q, s0, s1] = d === 'x' ? [b.x1, b.x2, b.y1, b.y2] : [b.y1, b.y2, b.x1, b.x2];
      if (Math.abs(p - q) > TOL || Math.abs((p + q) / 2 - at) > Math.max(TOL, b.b / 2)) continue;
      const cov = overlap(Math.min(s0, s1), Math.max(s0, s1), a0, a1);
      if (cov <= 0) continue;
      covered += cov; half = Math.max(half, b.b / 2);
      if (b.kind === 'beam') kind = 'beam';
    }
    return covered >= 0.5 * (a1 - a0) - 1e-9 ? { kind, half } : null;
  };
  /** A column at either end of the stretch that a beam or wall along the other direction already rests on is that beam's support, not this line's. */
  const columnsOn = (d: PlanDir, at: number, a0: number, a1: number) => geom.columns.filter((k) => {
    const [p, s, ext] = d === 'x' ? [k.x, k.y, k.b] : [k.y, k.x, k.h];
    if (Math.abs(p - at) > Math.max(TOL, ext / 2) || s < a0 - TOL || s > a1 + TOL) return false;
    const atEnd = Math.abs(s - a0) <= Math.max(TOL, ext / 2) || Math.abs(s - a1) <= Math.max(TOL, ext / 2);
    return !atEnd || !supportOn(other(d), s, at - TOL, at + TOL);
  });

  /** A stretch cut where the beams and walls on it start and end: each piece they cover rests on them, the rest on columns or nothing. */
  const classify = (d: PlanDir, at: number, a0: number, a1: number, none: 'joint' | 'free' | 'columns'): Array<{ from: number; to: number; kind: SupportKind; half: number }> => {
    const covered: Array<{ from: number; to: number; kind: 'beam' | 'wall'; half: number }> = [];
    for (const b of geom.beams) {
      const [p, q, s0, s1] = d === 'x' ? [b.x1, b.x2, b.y1, b.y2] : [b.y1, b.y2, b.x1, b.x2];
      if (Math.abs(p - q) > TOL || Math.abs((p + q) / 2 - at) > Math.max(TOL, b.b / 2)) continue;
      const from = Math.max(a0, Math.min(s0, s1)), to = Math.min(a1, Math.max(s0, s1));
      if (to - from > 1e-9) covered.push({ from, to, kind: b.kind, half: b.b / 2 });
    }
    covered.sort((p, q) => p.from - q.from);
    const merged: typeof covered = [];
    for (const c of covered) {
      const last = merged[merged.length - 1];
      if (last && c.from <= last.to + TOL) { last.to = Math.max(last.to, c.to); last.half = Math.max(last.half, c.half); if (c.kind === 'beam') last.kind = 'beam'; }
      else merged.push({ ...c });
    }
    const gapOf = (g0: number, g1: number) => {
      const cols = columnsOn(d, at, g0, g1);
      return cols.length ? { kind: 'columns' as const, half: Math.max(...cols.map((k) => (d === 'x' ? k.b : k.h))) / 2 } : { kind: none, half: 0 };
    };
    const out: Array<{ from: number; to: number; kind: SupportKind; half: number }> = [];
    let x = a0;
    for (const c of merged) {
      if (c.from - x > TOL) out.push({ from: x, to: c.from, ...gapOf(x, c.from) });
      out.push({ from: out.length || c.from - x > TOL ? Math.max(x, c.from) : a0, to: c.to, kind: c.kind, half: c.half });
      x = c.to;
    }
    if (a1 - x > TOL) out.push({ from: x, to: a1, ...gapOf(x, a1) });
    else if (out.length) out[out.length - 1]!.to = a1;
    return out.length ? out : [{ from: a0, to: a1, ...gapOf(a0, a1) }];
  };
  const supports: PlanSupport[] = [];
  for (const d of ['x', 'y'] as const) {
    const a = other(d);
    for (const p of panels) {
      const atHi = hi(p.rect, d), atLo = lo(p.rect, d), a0 = lo(p.rect, a), a1 = hi(p.rect, a);
      const shared: Array<[number, number]> = [];
      for (const q of panels) {
        if (q === p || Math.abs(lo(q.rect, d) - atHi) > TOL) continue;
        const s0 = Math.max(a0, lo(q.rect, a)), s1 = Math.min(a1, hi(q.rect, a));
        if (s1 - s0 <= TOL) continue;
        shared.push([s0, s1]);
        for (const pc of classify(d, atHi, s0, s1, 'joint')) supports.push({ id: '', dir: d, at: atHi, ...pc, below: p.key, above: q.key });
      }
      for (const [s0, s1] of subtract(a0, a1, shared)) {
        for (const pc of classify(d, atHi, s0, s1, 'free')) supports.push({ id: '', dir: d, at: atHi, ...pc, below: p.key });
      }
      const fromBelow = panels.filter((q) => q !== p && Math.abs(hi(q.rect, d) - atLo) <= TOL).map((q) => [Math.max(a0, lo(q.rect, a)), Math.min(a1, hi(q.rect, a))] as [number, number]).filter(([s0, s1]) => s1 - s0 > TOL);
      for (const [s0, s1] of subtract(a0, a1, fromBelow)) {
        for (const pc of classify(d, atLo, s0, s1, 'free')) supports.push({ id: '', dir: d, at: atLo, ...pc, above: p.key });
      }
      const inner = [...new Set(geom.columns.map((k) => (d === 'x' ? k.x : k.y)).filter((v) => v > atLo + TOL && v < atHi - TOL)
        .filter((v) => columnsOn(d, v, a0, a1).length).map((v) => Math.round(v / TOL) * TOL))].sort((u, v) => u - v);
      for (const v of inner) for (const pc of classify(d, v, a0, a1, 'columns')) supports.push({ id: '', dir: d, at: v, ...pc, below: p.key, above: p.key });
    }
  }
  supports.forEach((s, i) => { s.id = `${s.dir.toUpperCase()}${i + 1}`; });

  const linesOf = (p: Panel, d: PlanDir) => supports.filter((s) => s.dir === d && s.kind !== 'free' && (s.below === p.key || s.above === p.key));
  const isCantilever = (p: Panel, d: PlanDir) => {
    const lines = linesOf(p, d);
    if (lines.some((s) => s.below === s.above) || new Set(lines.map((s) => Math.round(s.at / TOL))).size !== 1) return false;
    return !linesOf(p, other(d)).some((s) => s.kind !== 'joint');
  };
  const halfAt = (p: Panel, d: PlanDir, at: number) => Math.max(0, ...linesOf(p, d).filter((s) => Math.abs(s.at - at) <= TOL).map((s) => s.half));
  const clearSpan = (p: Panel, d: PlanDir) => hi(p.rect, d) - lo(p.rect, d) - halfAt(p, d, lo(p.rect, d)) - halfAt(p, d, hi(p.rect, d));
  /** The panel beyond a line on one side: its clear span to the next support, and where a bar there must stop. */
  const sideOf = (s: PlanSupport, side: 'below' | 'above') => {
    const p = byKey.get(s[side]!)!;
    const d = s.dir, sign = side === 'above' ? 1 : -1;
    const lines = linesOf(p, d).map((x) => x.at).filter((v) => sign * (v - s.at) > TOL);
    const next = lines.length ? (sign > 0 ? Math.min(...lines) : Math.max(...lines)) : null;
    const edge = sign > 0 ? hi(p.rect, d) : lo(p.rect, d);
    const ln = Math.abs((next ?? edge) - s.at) - s.half - (next !== null ? halfAt(p, d, next) : 0);
    const cantilever = next === null && isCantilever(p, d);
    return { p, ln: Math.max(0, ln), stop: next !== null ? next + sign * (halfAt(p, d, next) - c.cover) : edge - sign * c.cover, cantilever };
  };

  const cantilevers: LevelPlan['cantilevers'] = [];
  for (const p of panels) for (const d of ['x', 'y'] as const) if (isCantilever(p, d)) {
    const s = linesOf(p, d)[0]!;
    cantilevers.push({ panel: p.name, dir: d, length: Math.max(0, (s.below === p.key ? s.at - lo(p.rect, d) : hi(p.rect, d) - s.at) - s.half) });
  }

  const packages: SlabPackage[] = [];
  const heights = barHeights(c.cover);
  const yBottom = (p: Panel, d: PlanDir, dia: number) => heights.bottom(p.row, d, dia);
  const yTop = heights.top, legDown = heights.leg;
  const add = (pk: Omit<SlabPackage, 'id' | 'mark' | 'count' | 'length' | 'weight'>, bars?: number) => {
    const count = bars ?? barsAcross(pk.band.to - pk.band.from, pk.bars.spacing);
    packages.push({ ...pk, id: '', mark: '', count, length: developedLength(pk.shape), weight: shapeWeight(pk.shape, count) });
  };

  const bentIn = new Map<string, MeshBars>();
  const edgeSupports = (p: Panel, d: PlanDir, end: 'lo' | 'hi') => supports.filter((s) => s.dir === d && Math.abs(s.at - (end === 'lo' ? lo(p.rect, d) : hi(p.rect, d))) <= TOL && (end === 'lo' ? s.above === p.key : s.below === p.key));
  const bendable = (p: Panel, d: PlanDir) => {
    if (!c.bent || isCantilever(p, d)) return false;
    if (linesOf(p, d).some((s) => s.below === s.above)) return false;
    return (['lo', 'hi'] as const).every((end) => {
      const e = edgeSupports(p, d, end);
      return e.length === 1 && e[0]!.kind !== 'free' && overlap(e[0]!.from, e[0]!.to, lo(p.rect, other(d)), hi(p.rect, other(d))) >= hi(p.rect, other(d)) - lo(p.rect, other(d)) - TOL
        && !(e[0]!.below && e[0]!.above && sideOf(e[0]!, end === 'lo' ? 'below' : 'above').cantilever);
    });
  };

  /** Where a top bar crossing `s` stops on one side, and how far past the face it had to reach. */
  const topEnd = (s: PlanSupport, side: 'below' | 'above', dia: number, frac: number, spacing: number) => {
    const sign = side === 'above' ? 1 : -1;
    const faceAt = s.at + sign * s.half;
    if (!s[side]) return { end: s.at + sign * (s.half - c.cover), needed: 0, reach: Math.max(0, s.half * 2 - c.cover), edge: true };
    const me = sideOf(s, side);
    const opp = s[side === 'above' ? 'below' : 'above'] ? sideOf(s, side === 'above' ? 'below' : 'above') : null;
    if (me.cantilever) return { end: me.stop, needed: Math.max(0, me.ln - c.cover), reach: Math.abs(me.stop - faceAt), edge: false };
    const needed = Math.max(ld(dia, true, me.p.h, spacing), frac * me.ln, opp?.cantilever ? opp.ln : 0);
    const reach = Math.min(up(needed), Math.abs(me.stop - faceAt));
    return { end: faceAt + sign * reach, needed, reach, edge: false };
  };

  for (const d of ['x', 'y'] as const) {
    const a = other(d);
    for (const p of panels) {
      const mesh = p.row.adopted[face(d, 'bottom')];
      if (!(mesh.dia > 0 && mesh.spacing > 0)) continue;
      const endsOver = (u0: number, u1: number) => (['lo', 'hi'] as const).map((end) => {
        const at = end === 'lo' ? lo(p.rect, d) : hi(p.rect, d), sign = end === 'lo' ? -1 : 1;
        const e = edgeSupports(p, d, end).filter((s) => s.kind !== 'free' && overlap(s.from, s.to, u0, u1) > TOL / 2);
        if (!e.length) return { x: at - sign * c.cover, leg: true };
        const half = Math.max(...e.map((s) => s.half));
        const held = e.some((s) => s.kind === 'beam' || s.kind === 'wall');
        if (half > 0) return { x: at + sign * (-half + (held ? Math.min(code.bottomEmbed(mesh.dia), 2 * half - c.cover) : 2 * half - c.cover)), leg: true };
        if (e.some((s) => s.below && s.above)) return { x: at + sign * up(lap(mesh.dia, false, p.h, mesh.spacing) / 2), leg: false };
        return { x: at - sign * c.cover, leg: true };
      });
      const inner = linesOf(p, d).filter((s) => s.below === s.above).map((s) => s.at);
      const y = yBottom(p, d, mesh.dia);
      const upLeg = legDown(p.h, mesh.dia);
      const cuts = [...new Set([lo(p.rect, a), hi(p.rect, a), ...(['lo', 'hi'] as const).flatMap((end) => edgeSupports(p, d, end).flatMap((s) => [s.from, s.to]))]
        .filter((u) => u >= lo(p.rect, a) - 1e-9 && u <= hi(p.rect, a) + 1e-9).map((u) => Math.round(u * 1e6) / 1e6))].sort((u, v) => u - v);
      const bands = cuts.slice(1).map((u, i) => ({ from: cuts[i]!, to: u })).filter((b) => b.to - b.from > TOL);
      const straight = (bars: MeshBars, kind: PackageKind, band: { from: number; to: number }) => {
        const endsHooked = endsOver(band.from, band.to), ends = endsHooked.map((e) => e.x);
        add({
          layer: 'bottom', dir: d, kind, bars, from: ends[0]!, to: ends[1]!, band,
          shape: { pts: [
            ...(endsHooked[0]!.leg ? [[0, y + upLeg] as [number, number]] : []),
            [0, y], [ends[1]! - ends[0]!, y],
            ...(endsHooked[1]!.leg ? [[ends[1]! - ends[0]!, y + upLeg] as [number, number]] : []),
          ], mandrel: mandrel(bars.dia), dia: bars.dia },
          runs: [{ face: 'bottom', from: ends[0]!, to: ends[1]! }], panels: [p.key], reach: [],
        });
      };
      if (!bendable(p, d) || inner.length) { for (const b of bands) straight(mesh, 'span', b); continue; }
      const band = { from: lo(p.rect, a), to: hi(p.rect, a) };
      const half2 = { dia: mesh.dia, spacing: mesh.spacing * 2 };
      straight(half2, 'span', band);
      bentIn.set(`${p.key}|${d}`, half2);
      const [sLo, sHi] = [edgeSupports(p, d, 'lo')[0]!, edgeSupports(p, d, 'hi')[0]!];
      const faceLo = sLo.at + sLo.half, faceHi = sHi.at - sHi.half, ln = faceHi - faceLo;
      const yt = yTop(p.h, d, mesh.dia, p.row.adopted.topX.dia || mesh.dia), yb = y;
      const run = yt - yb;
      const e0 = topEnd(sLo, 'below', mesh.dia, sLo.below ? code.topReach.interior : code.topReach.end, mesh.spacing);
      const e1 = topEnd(sHi, 'above', mesh.dia, sHi.above ? code.topReach.interior : code.topReach.end, mesh.spacing);
      const x0 = e0.end, x1 = e1.end;
      const bendAt = p.row.oneWay ? code.bendAt.oneWay : code.bendAt.twoWay;
      const r0 = faceLo + bendAt * ln, r1 = faceHi - bendAt * ln;
      const leg = legDown(p.h, mesh.dia);
      const pts: Array<[number, number]> = [[0, yt - leg], [0, yt], [r0 - run - x0, yt], [r0 - x0, yb], [r1 - x0, yb], [r1 + run - x0, yt], [x1 - x0, yt], [x1 - x0, yt - leg]];
      add({
        layer: 'bottom', dir: d, kind: 'bent', bars: half2, from: x0, to: x1, band, shape: { pts, mandrel: bentMandrel(mesh.dia), dia: mesh.dia },
        runs: [{ face: 'top', from: x0, to: r0 - run }, { face: 'bottom', from: r0, to: r1 }, { face: 'top', from: r1 + run, to: x1 }],
        panels: [p.key, ...[sLo.below, sHi.above].filter((k): k is string => !!k)],
        reach: [{ at: sLo.at, length: e0.reach, needed: e0.needed }, { at: sHi.at, length: e1.reach, needed: e1.needed }],
      });
    }
  }

  const topReq = (s: PlanSupport) => {
    const sides = [s.below, s.above].filter((k): k is string => !!k).map((k) => byKey.get(k)!);
    const f = face(s.dir, 'top');
    return { req: Math.max(0, ...sides.map((p) => p.row.faces[f].asReq)), sMax: Math.min(...sides.map((p) => p.row.faces[f].sMax)), sides };
  };
  for (const s of supports) {
    if (s.kind === 'free') continue;
    const { req, sMax, sides } = topReq(s);
    const cantSide = (['below', 'above'] as const).find((k) => s[k] && s.below !== s.above && sideOf(s, k).cantilever);
    if (req <= 1e-6 && !cantSide) continue;
    const bent = (['below', 'above'] as const).map((k) => s[k] ? bentIn.get(`${s[k]}|${s.dir}`) : undefined).filter((m): m is MeshBars => !!m);
    const bentArea = bent.reduce((t, m) => t + meshArea(m), 0);
    const bentPerM = bent.reduce((t, m) => t + 1 / m.spacing, 0);
    if (bent.length && bentArea >= req - 1e-6 && (bentPerM > 0 ? 1 / bentPerM : Infinity) <= sMax + 1e-6) continue;
    let bars: MeshBars;
    if (bent.length) {
      const room = 1 / sMax - bentPerM;
      bars = proposeMesh(Math.max(req - bentArea, 1e-3), Math.min(room > 1e-9 ? 1 / room : Infinity, 0.5), c.diameters);
    } else {
      const fit = sides.map((p) => p.row.adopted[face(s.dir, 'top')]).filter((m) => m.dia > 0 && meshArea(m) >= req - 1e-6 && m.spacing <= sMax + 1e-6)
        .sort((m, n) => meshArea(m) - meshArea(n))[0];
      bars = fit ?? proposeMesh(req, sMax, c.diameters);
      const room = 2 * s.half - c.cover;
      if ((!s.below || !s.above) && s.half > 0 && ldh(bars.dia) > room + 1e-9) {
        const hooks = c.diameters.filter((x) => ldh(x) <= room + 1e-9);
        if (hooks.length) bars = proposeMesh(Math.max(req, 1e-3), sMax, hooks);
      }
    }
    const strips: Array<{ from: number; to: number; frac: number }> = [];
    if (s.kind === 'columns') {
      const cols = columnsOn(s.dir, s.at, s.from, s.to).map((k) => (s.dir === 'x' ? k.y : k.x)).sort((u, v) => u - v);
      const spanAcross = Math.min(...sides.map((p) => hi(p.rect, other(s.dir)) - lo(p.rect, other(s.dir))));
      const spanAlong = Math.min(...sides.map((p) => hi(p.rect, s.dir) - lo(p.rect, s.dir)));
      const w = 0.25 * Math.min(spanAcross, spanAlong);
      const cs: Array<[number, number]> = [];
      for (const v of cols) {
        const a0 = Math.max(s.from, v - w), a1 = Math.min(s.to, v + w);
        const last = cs[cs.length - 1];
        if (last && a0 <= last[1] + TOL) last[1] = Math.max(last[1], a1); else cs.push([a0, a1]);
      }
      for (const [a0, a1] of cs) strips.push({ from: a0, to: a1, frac: code.topReach.interior });
      for (const [a0, a1] of subtract(s.from, s.to, cs)) strips.push({ from: a0, to: a1, frac: code.topReach.middle });
    } else strips.push({ from: s.from, to: s.to, frac: s.below && s.above ? code.topReach.interior : code.topReach.end });
    const h = Math.min(...sides.map((p) => p.h));
    const outer = Math.max(...sides.map((p) => p.row.adopted.topX.dia), bars.dia);
    const yt = yTop(h, s.dir, bars.dia, outer);
    const leg = legDown(h, bars.dia);
    const developedAt = 1 / (1 / bars.spacing + bentPerM);
    for (const st of strips) {
      const e0 = topEnd(s, 'below', bars.dia, st.frac, developedAt), e1 = topEnd(s, 'above', bars.dia, st.frac, developedAt);
      const x0 = e0.end, x1 = e1.end;
      const edge = e0.edge || e1.edge;
      const anchor = edge && s.half > 0 ? { available: Math.max(0, 2 * s.half - c.cover), needed: ldh(bars.dia), ok: ldh(bars.dia) <= 2 * s.half - c.cover + 1e-9 } : undefined;
      add({
        layer: 'top', dir: s.dir, kind: cantSide ? 'cantilever' : edge ? 'edge' : 'support', bars, from: x0, to: x1, band: { from: st.from, to: st.to },
        shape: { pts: [[0, yt - leg], [0, yt], [x1 - x0, yt], [x1 - x0, yt - leg]], mandrel: mandrel(bars.dia), dia: bars.dia },
        runs: [{ face: 'top', from: x0, to: x1 }], panels: sides.map((p) => p.key),
        reach: [...(e0.edge ? [] : [{ at: s.at - s.half, length: e0.reach, needed: e0.needed }]), ...(e1.edge ? [] : [{ at: s.at + s.half, length: e1.reach, needed: e1.needed }])],
        ...(anchor ? { anchor } : {}),
      });
    }
  }

  /** Each panel's top moments wherever they crack it (past 0.62·√f'c·h²/6), the strength steel scaled to each (an upper bound: As grows faster than M): the bars there must carry them, and a top mesh over the panel is laid where they do not. */
  const fieldNeeds = (p: Panel, d: PlanDir) => {
    const f = face(d, 'top'), mMax = p.row.demand.m[f].value, req = p.row.faces[f].asStrength;
    if (!(mMax > 1e-9) || !(req > 1e-9)) return [];
    const r = p.rect, mcr = (0.62 * Math.sqrt(c.mat.fc) * 1000 * p.h * p.h) / 6;
    return (p.row.demand.topField ?? []).filter((s) => s.x >= r.x0 - 1e-9 && s.x <= r.x1 + 1e-9 && s.y >= r.y0 - 1e-9 && s.y <= r.y1 + 1e-9 && (d === 'x' ? s.topX : s.topY) > mcr)
      .map((s) => ({ along: d === 'x' ? s.x : s.y, across: d === 'x' ? s.y : s.x, required: (req * (d === 'x' ? s.topX : s.topY)) / mMax }));
  };
  const fieldChecks = (p: Panel, d: PlanDir) => fieldNeeds(p, d).map((n) => stripCheck(packages, 'top', d, n.along, n.across, p.name, n.required, p.row.faces[face(d, 'top')].sMax));
  for (const d of ['x', 'y'] as const) {
    const a = other(d);
    for (const p of panels) {
      const short = fieldChecks(p, d).filter((x) => !x.ok);
      if (!short.length) continue;
      const need = Math.max(...short.map((x) => x.required)), sMax = p.row.faces[face(d, 'top')].sMax;
      const own = p.row.adopted[face(d, 'top')];
      const bars = own.dia > 0 && own.spacing > 0 && meshArea(own) >= need - 1e-6 && own.spacing <= sMax + 1e-6 ? own : proposeMesh(need, sMax, c.diameters);
      const endAt = (end: 'lo' | 'hi') => {
        const at = end === 'lo' ? lo(p.rect, d) : hi(p.rect, d), sign = end === 'lo' ? -1 : 1;
        const half = Math.max(0, ...edgeSupports(p, d, end).filter((s) => s.kind !== 'free').map((s) => s.half));
        return half > 0 ? at + sign * (half - c.cover) : at - sign * c.cover;
      };
      const x0 = endAt('lo'), x1 = endAt('hi');
      const yt = yTop(p.h, d, bars.dia, Math.max(p.row.adopted.topX.dia, bars.dia)), leg = legDown(p.h, bars.dia);
      add({
        layer: 'top', dir: d, kind: 'span', bars, from: x0, to: x1, band: { from: lo(p.rect, a), to: hi(p.rect, a) },
        shape: { pts: [[0, yt - leg], [0, yt], [x1 - x0, yt], [x1 - x0, yt - leg]], mandrel: mandrel(bars.dia), dia: bars.dia },
        runs: [{ face: 'top', from: x0, to: x1 }], panels: [p.key], reach: [],
      });
    }
  }

  const extra: ExtraBarsPlan = {
    panels: panels.map((p) => ({
      ...p, twoWay: !p.row.oneWay && !isCantilever(p, 'x') && !isCantilever(p, 'y'),
      ln: { x: clearSpan(p, 'x'), y: clearSpan(p, 'y') },
      edges: (d: PlanDir, end: 'lo' | 'hi') => edgeSupports(p, d, end),
    })),
    packages, add, cover: c.cover, diameters: c.diameters, mandrel, ldh, lap,
  };
  const cornerSamples = code.corners ? cornerBars(extra, code.corners) : [];
  const integrity = code.integrity ? integrityBars(extra, geom, code.integrity.bars, c.columnInset ?? 0.05) : [];

  const bottomMeshes = panels.flatMap((p) => [p.row.adopted.bottomX, p.row.adopted.bottomY]);
  const uniform = !c.bent && bottomMeshes.length > 0 && bottomMeshes.every((m) => m.dia > 0 && m.dia === bottomMeshes[0]!.dia && Math.abs(m.spacing - bottomMeshes[0]!.spacing) < 1e-9);
  if (uniform) for (const pk of packages) if (pk.kind === 'span' && pk.layer === 'bottom') pk.base = true;
  const order: PackageKind[] = ['span', 'bent', 'integrity', 'support', 'edge', 'cantilever', 'corner'];
  packages.sort((p, q) => (p.layer === q.layer ? 0 : p.layer === 'bottom' ? -1 : 1) || order.indexOf(p.kind) - order.indexOf(q.kind) || (p.dir < q.dir ? -1 : p.dir > q.dir ? 1 : 0) || p.band.from - q.band.from || p.from - q.from);
  packages.forEach((pk, i) => { pk.id = `${pk.layer[0]}${pk.dir}${i + 1}`; pk.mark = String(i + 1); });

  const checks: SlabPlanCheck[] = [];
  for (const d of ['x', 'y'] as const) {
    const a = other(d);
    for (const p of panels) {
      const f = p.row.faces[face(d, 'bottom')];
      if (f.asReq <= 1e-6) continue;
      const at = (lo(p.rect, d) + hi(p.rect, d)) / 2, across = (lo(p.rect, a) + hi(p.rect, a)) / 2;
      checks.push(stripCheck(packages, 'bottom', d, at, across, p.name, f.asReq, f.sMax));
    }
  }
  for (const s of supports) {
    if (s.kind === 'free') continue;
    const { req, sMax } = topReq(s);
    const crossing = packages.filter((pk) => pk.layer === 'top' || pk.kind === 'bent').filter((pk) => pk.dir === s.dir && overlap(pk.band.from, pk.band.to, s.from, s.to) > TOL);
    const samples = crossing.length ? [...new Set(crossing.map((pk) => (Math.max(pk.band.from, s.from) + Math.min(pk.band.to, s.to)) / 2))] : [(s.from + s.to) / 2];
    if (req <= 1e-6) continue;
    const along = s.below && s.above ? s.at : s.below ? s.at - s.half - TOL : s.at + s.half + TOL;
    const worst = samples.map((v) => stripCheck(packages, 'top', s.dir, along, v, s.id, req, sMax)).sort((p, q) => p.provided - q.provided)[0]!;
    checks.push(worst);
  }
  for (const d of ['x', 'y'] as const) for (const p of panels) {
    const worst = fieldChecks(p, d).sort((u, v) => u.provided / Math.max(u.required, 1e-9) - v.provided / Math.max(v.required, 1e-9))[0];
    if (worst) checks.push(worst);
  }
  for (const x of cornerSamples) checks.push({ ...stripCheck(packages, x.layer, x.dir, x.along, x.across, x.where, x.required, x.sMax), kind: 'corner' });
  for (const x of integrity) checks.push({ layer: 'bottom', dir: x.dir, where: `(${x.x.toFixed(2)}; ${x.y.toFixed(2)})`, required: x.required, provided: x.bars, spacing: 0, sMax: 0, ok: x.bars >= x.required, kind: 'integrity' });
  const usedDias = [...new Set(packages.map((pk) => pk.bars.dia))].sort((p, q) => p - q);
  const closest = (dia: number) => Math.min(...packages.filter((pk) => pk.bars.dia === dia).map((pk) => pk.bars.spacing));
  const anchorage = usedDias.map((dia) => ({ dia, ld: ld(dia, false, hMin, closest(dia)), ldTop: ld(dia, true, hMin, closest(dia)), ldh: ldh(dia), lap: lap(dia, true, hMin, closest(dia)) }));
  const ok = checks.every((x) => x.ok) && packages.every((pk) => pk.reach.every((r) => r.length >= r.needed - 1e-6) && (!pk.anchor || pk.anchor.ok));
  return {
    level, panels: panels.map((p) => ({ key: p.key, name: p.name, rect: p.rect, h: p.h, status: p.row.status })), beams: geom.beams, columns: geom.columns,
    supports, packages, ...(uniform ? { baseMesh: bottomMeshes[0] } : {}), checks, anchorage, cantilevers, integrity, bent: c.bent, rules: { reach: code.topReach, clause: code.clause, bendAt: code.bendAt, ...(code.corners ? { corners: code.corners } : {}), ...(code.integrity ? { integrity: code.integrity } : {}) }, ok,
  };
}

export { barPositions } from './slab-corner-integrity';

export interface PlanBarDrawing {
  id: string; mark: string; layer: PlanLayer; dir: PlanDir; kind: PackageKind;
  /** The bar in plan with what bends in its vertical plane folded 90° onto the plan, m. */
  pts: Array<[number, number]>;
  /** The distribution line across the strip the bars cover, end to end, m. */
  band: [[number, number], [number, number]];
  label: string;
  /** Where the label stands, m. */
  at: [number, number];
  /** Each straight leg's length beside its middle, m, and the way out from the rest of the bar. */
  legs: Array<{ at: [number, number]; length: number; out: [number, number] }>;
}

/** Package labels: diameter, spacing and the cut length. */
export const packageLabel = (pk: Pick<SlabPackage, 'bars' | 'length'> & Partial<Pick<SlabPackage, 'kind' | 'count'>>, fmt: Fmt): string =>
  `${pk.kind === 'integrity' ? `${pk.count}Ø${pk.bars.dia}` : meshLabel(pk.bars)} L=${fmt(pk.length, 2)}`;

/**
 * One bar drawn for each package, its legs and bends folded 90° about its axis so they show in plan
 * (`fold` scales what was vertical); packages sharing a stretch stand side by side across their strip.
 * `show` draws the base mesh's packages by `base`, the other bottom ones by `bottom`, the top ones by `top`.
 */
export function planDrawing(plan: LevelPlan, show: { bottom: boolean; top: boolean; base?: boolean }, fmt: Fmt, fold = 1): PlanBarDrawing[] {
  const drawn = plan.packages.filter((pk) => (pk.base ? show.base === true : show[pk.layer]));
  return drawn.map((pk) => {
    const near = drawn.filter((q) => q.dir === pk.dir && overlap(q.from, q.to, pk.from, pk.to) > TOL && overlap(q.band.from, q.band.to, pk.band.from, pk.band.to) > TOL);
    const slot = near.indexOf(pk), n = near.length;
    const width = pk.band.to - pk.band.from;
    const across = pk.band.from + ((slot + 1) / (n + 1)) * width;
    const ys = pk.shape.pts.map((p) => p[1]);
    const base = pk.layer === 'top' ? Math.max(...ys) : Math.min(...ys);
    const toPlan = ([u, v]: [number, number]): [number, number] => {
      const along = pk.from + u, off = across + (v - base) * fold;
      return pk.dir === 'x' ? [along, off] : [across - (v - base) * fold, along];
    };
    const pts = pk.shape.pts.map(toPlan);
    const lens = legLengths(pk.shape);
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const legs = lens.map((length, i) => {
      const [p, q] = [pts[i]!, pts[i + 1]!], at: [number, number] = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, n: [number, number] = [-(q[1] - p[1]) / L, (q[0] - p[0]) / L];
      const side = Math.sign(n[0] * (at[0] - cx) + n[1] * (at[1] - cy)) || 1;
      return { at, length, out: [n[0] * side, n[1] * side] as [number, number] };
    });
    const mid = (pk.from + pk.to) / 2, bandAt = pk.from + 0.3 * (pk.to - pk.from);
    const band: PlanBarDrawing['band'] = pk.dir === 'x' ? [[bandAt, pk.band.from], [bandAt, pk.band.to]] : [[pk.band.from, bandAt], [pk.band.to, bandAt]];
    const at: [number, number] = pk.dir === 'x' ? [mid, across] : [across, mid];
    return { id: pk.id, mark: pk.mark, layer: pk.layer, dir: pk.dir, kind: pk.kind, pts, band, label: packageLabel(pk, fmt), at, legs };
  });
}

export type SlabSpanKind = 'oneWay' | 'twoWay' | 'cantilever';

/** How a panel spans: a cantilever where its level's plan finds one, one-way past a 2:1 aspect, two-way otherwise. */
export function slabSpanKind(row: { name: string; level?: string; oneWay: boolean }, plans: readonly Pick<LevelPlan, 'level' | 'cantilevers'>[]): SlabSpanKind {
  if (plans.some((p) => p.level === (row.level ?? '') && p.cantilevers.some((c) => c.panel === row.name))) return 'cantilever';
  return row.oneWay ? 'oneWay' : 'twoWay';
}

/** The area of one bar over the package's spacing, cm²/m. */
export const packageArea = (pk: Pick<SlabPackage, 'bars'>): number => barArea(pk.bars.dia) / Math.max(pk.bars.spacing, 1e-9);
