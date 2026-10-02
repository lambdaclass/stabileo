/**
 * The area loads of a load plan, dead, live and roof live, on what carries them
 * (`plan-gravity.ts`), and the weight each level adds to the seismic mass.
 *
 * Floors carry the floor's dead load and the occupancy's live load L. Roofs (members nothing
 * higher covers) carry the roof's dead load and, when they are only reached for maintenance, the
 * roof live load Lr of CIRSOC 101 §4.8.1, member by member with R1 from its tributary area and R2
 * from the roof's slope; a roof used for an occupancy carries that occupancy's L, reduced by §4.7
 * (§4.8.2). Without roof settings every member is a floor, as the plan always had it.
 *
 * Pure: no store.
 */
import type { GravityLayout, GravityModel } from './plan-gravity';
import { adjacentSpanPatterns, layoutSpans, layoutUnits, type Unit } from './plan-spans';
import { roofLiveLoad, type RoofWeight } from '../../codes/cirsoc101/roof-live';
import { msg, round, type EngineMessage } from '../../codes/message';
import type { ClauseRef } from '../../codes/regulation';

export type AreaCaseType = 'D' | 'L' | 'Lr';

export interface RoofLoads {
  /** Superimposed dead load of the roof, kN/m². */
  dead: number;
  /** `maintenance`: Lr of §4.8.1; `occupancy`: the L of the roof's own occupancy. */
  use: 'maintenance' | 'occupancy';
  weight: RoofWeight;
  /** Slope of the roof surface, %, for R2. */
  slopePercent: number;
  /** For `occupancy`: the design live load of a roof member (reduced by §4.7), kN/m². */
  liveOf?: (elementId: number) => number;
  /** For `occupancy`: Lo of the roof's occupancy, kN/m². */
  lo?: number;
}

export interface AreaLoadsInput {
  layout: GravityLayout;
  tributaryWidth: number;
  /** The width loads in their original form, along local z (the plan's `width` mode). */
  legacyWidth: boolean;
  floor: { dead: number; lo: number; liveOf: (elementId: number) => number };
  roof?: RoofLoads;
  /**
   * Partial loading (CIRSOC 101 §4.3.3, and Tabla 4.1 note n for a reduced Lr): L and Lr also as
   * two checkerboard arrangements, the panels and spans of one colour each (`checkerboard`), and
   * with `all` as the spans each side of every interior grid line too (`plan-spans.ts`). `true`
   * is the checkerboard alone.
   */
  patterns?: boolean | 'none' | 'checkerboard' | 'all';
  /** The model, for the grid lines of the members loaded by width (`all` only). */
  model?: GravityModel;
}

/** An arrangement of L or Lr a case of its own is planned for. */
export interface AreaArrangement {
  symbol: 'L' | 'Lr';
  kind: 'checkerboard' | 'adjacent';
  nameParams: Record<string, string | number>;
}

export interface AreaLoad {
  elementId: number; caseType: AreaCaseType; q: number; qJ?: number; a?: number; b?: number;
  frame?: 'global' | 'projected';
  /** The arrangement this load belongs to, by `AreaLoadsResult.arrangements`; absent: the full load. */
  arrangement?: number;
}
export interface AreaSurface { quadId: number; caseType: AreaCaseType; q: number }

export interface AreaLoadsResult {
  distributed: AreaLoad[];
  surface: AreaSurface[];
  planned: Set<AreaCaseType>;
  /** The symbols that got arrangements, and the arrangements, by `AreaLoad.arrangement`. */
  arranged: Set<'L' | 'Lr'>;
  arrangements: AreaArrangement[];
  derivation: EngineMessage[];
  refs: ClauseRef[];
  /** kN/m² of dead and of (unreduced) live load a floor's and a roof's area bring to the seismic mass. */
  floorMass: { dead: number; live: number };
  roofMass: { dead: number; live: number };
  massOfQuad: (quadId: number) => { dead: number; live: number };
}

export function planAreaLoads(i: AreaLoadsInput): AreaLoadsResult {
  const { layout } = i;
  const roof = i.roof;
  const isRoof = (id: number) => !!roof && layout.roof.has(id);
  const isRoofQuad = (id: number) => !!roof && layout.roofQuads.has(id);
  const floorMass = { dead: i.floor.dead, live: i.floor.lo };
  const roofMass = roof ? { dead: roof.dead, live: roof.use === 'occupancy' ? roof.lo ?? 0 : 0 } : floorMass;
  const out: AreaLoadsResult = {
    distributed: [], surface: [], planned: new Set(), arranged: new Set(), arrangements: [], derivation: [], refs: [], floorMass, roofMass,
    massOfQuad: (id) => (isRoofQuad(id) ? roofMass : floorMass),
  };

  const lrOf = new Map<number, number>();
  if (roof?.use === 'maintenance') {
    let first: EngineMessage | null = null;
    for (const id of layout.roof) {
      const r = roofLiveLoad({ weight: roof.weight, atM2: layout.roofAreaOf.get(id) ?? 0, slopePercent: roof.slopePercent });
      lrOf.set(id, r.lr);
      first ??= r.reason;
      if (out.refs.length === 0) out.refs.push(...r.refs);
    }
    if (lrOf.size > 0) {
      const ls = [...lrOf.values()];
      out.derivation.push(msg('loadPlan.derivation.roofLive', {
        weight: msg(`loads.cirsoc101.roofWeight.${roof.weight}`), n: ls.length, min: round(Math.min(...ls), 3), max: round(Math.max(...ls), 3), slope: round(roof.slopePercent, 1),
      }));
    }
  }

  /**
   * One area load on what carries it: `qOf(id, roof)` for a member's floor or roof part,
   * `perProjection` for loads given per horizontal area.
   */
  const put = (caseType: AreaCaseType, qOf: (id: number, roof: boolean) => number, qOfQuad: (id: number) => number, perProjection: boolean,
    arrangement?: { index: number; loads: (u: Unit) => boolean }) => {
    const arr = arrangement !== undefined ? { arrangement: arrangement.index } : {};
    for (const p of layout.pieces) {
      if (arrangement !== undefined && !arrangement.loads({ panel: p.panel })) continue;
      const q = qOf(p.elementId, !!roof && p.roof);
      if (Math.abs(q * Math.max(p.wI, p.wJ)) <= 1e-3) continue;
      out.distributed.push({ elementId: p.elementId, caseType, q: -q * p.wI, qJ: -q * p.wJ, ...(p.a !== undefined ? { a: p.a, b: p.b } : {}), frame: 'global', ...arr });
      if (arrangement === undefined) out.planned.add(caseType);
    }
    for (const m of layout.widthMembers) {
      if (arrangement !== undefined && !arrangement.loads({ member: m.elementId })) continue;
      const q = -qOf(m.elementId, isRoof(m.elementId)) * i.tributaryWidth;
      if (Math.abs(q) <= 1e-3) continue;
      out.distributed.push(i.legacyWidth
        ? { elementId: m.elementId, caseType, q, ...arr }
        : { elementId: m.elementId, caseType, q, frame: perProjection ? 'projected' : 'global', ...arr });
      if (arrangement === undefined) out.planned.add(caseType);
    }
    // A slab of shells is a mesh, not panels: its arrangements are not drawn here.
    if (arrangement !== undefined) return;
    for (const sq of layout.shellQuads) {
      const q = qOfQuad(sq.quadId);
      if (q > 1e-6) { out.surface.push({ quadId: sq.quadId, caseType, q }); out.planned.add(caseType); }
    }
  };

  put('D', (_id, atRoof) => (atRoof ? roof!.dead : i.floor.dead), (id) => (isRoofQuad(id) ? roof!.dead : i.floor.dead), false);
  // On a slab of shells the live load is not a member's: it goes unreduced.
  const liveQ = (id: number, atRoof: boolean) => (atRoof ? (roof!.use === 'occupancy' ? roof!.liveOf?.(id) ?? 0 : 0) : i.floor.liveOf(id));
  put('L', liveQ, (id) => (isRoofQuad(id) ? (roof!.use === 'occupancy' ? roof!.lo ?? 0 : 0) : i.floor.lo), true);
  const lrQ = (id: number, atRoof: boolean) => (atRoof ? lrOf.get(id) ?? 0 : 0);
  if (roof?.use === 'maintenance') {
    // A slab of shells is not a member with a tributary area: R1 = 1 there, the largest Lr.
    const shellLr = roofLiveLoad({ weight: roof.weight, atM2: 0, slopePercent: roof.slopePercent }).lr;
    put('Lr', lrQ, (id) => (isRoofQuad(id) ? shellLr : 0), true);
  }
  const mode = i.patterns === true ? 'checkerboard' : i.patterns === false || i.patterns === undefined ? 'none' : i.patterns;
  if (mode !== 'none') {
    const before = out.distributed.length;
    const spans = mode === 'all' && i.model ? layoutSpans(i.model, layout) : null;
    let adjacent = 0;
    for (const [sym, q] of [['L', liveQ], ['Lr', lrQ]] as const) {
      if (!out.planned.has(sym)) continue;
      /*
       * The units carrying the symbol: a panel or member whose load under the symbol is not zero.
       * An arrangement is worth a case only when it loads some of them and not all.
       */
      const carries = (u: Unit) => ('panel' in u
        ? layout.pieces.some((p) => p.panel === u.panel && Math.abs(q(p.elementId, !!roof && p.roof)) > 1e-6)
        : Math.abs(q(u.member, isRoof(u.member))) > 1e-6);
      const units = layoutUnits(layout, carries);
      const colour = (u: Unit) => ('panel' in u ? layout.panelColour[u.panel] : layout.widthColour.get(u.member));
      const partOf = (loads: (u: Unit) => boolean) => { const n = units.filter(loads).length; return n > 0 && n < units.length; };
      const candidates: Array<{ a: AreaArrangement; loads: (u: Unit) => boolean }> = [];
      // The checkerboard is a pair: both colours, or neither.
      const boards = [0, 1].map((k) => ({
        a: { symbol: sym, kind: 'checkerboard' as const, nameParams: { k: k === 0 ? 'A' : 'B' } },
        loads: (u: Unit) => colour(u) === k,
      }));
      if (boards.every((b) => partOf(b.loads))) candidates.push(...boards);
      if (spans) {
        for (const pt of adjacentSpanPatterns(spans, units)) {
          const loads = (u: Unit) => pt.factor(u) > 0;
          if (partOf(loads)) candidates.push({ a: { symbol: sym, kind: 'adjacent', nameParams: { axis: pt.axis.toUpperCase(), at: round(pt.at ?? 0, 2) } }, loads });
        }
      }
      for (const c of candidates) {
        const index = out.arrangements.length;
        out.arrangements.push(c.a);
        put(sym, q, () => 0, true, { index, loads: c.loads });
        if (c.a.kind === 'adjacent') adjacent++;
      }
      if (candidates.length > 0) out.arranged.add(sym);
    }
    if (out.arranged.size > 0) {
      out.derivation.push(msg('loadPlan.derivation.patterns', { symbols: [...out.arranged].join(', '), loads: out.distributed.length - before }));
      if (adjacent > 0) out.derivation.push(msg('loadPlan.derivation.adjacentSpans', { n: adjacent, x: spans!.lines.x.length, y: spans!.lines.y.length }));
    }
  }
  return out;
}
