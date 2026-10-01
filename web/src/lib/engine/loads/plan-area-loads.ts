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
import type { GravityLayout } from './plan-gravity';
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
   * Alternate loading (CIRSOC 101 §4.3.3, and Tabla 4.1 note n for a reduced Lr): L and Lr also
   * as two checkerboard arrangements, the panels and spans of one colour each.
   */
  patterns?: boolean;
}

export interface AreaLoad {
  elementId: number; caseType: AreaCaseType; q: number; qJ?: number; a?: number; b?: number;
  frame?: 'global' | 'projected';
  /** The checkerboard arrangement this load belongs to; absent: the symbol's full load. */
  arrangement?: 0 | 1;
}
export interface AreaSurface { quadId: number; caseType: AreaCaseType; q: number }

export interface AreaLoadsResult {
  distributed: AreaLoad[];
  surface: AreaSurface[];
  planned: Set<AreaCaseType>;
  /** The symbols that got checkerboard arrangements. */
  arranged: Set<'L' | 'Lr'>;
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
    distributed: [], surface: [], planned: new Set(), arranged: new Set(), derivation: [], refs: [], floorMass, roofMass,
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
  const put = (caseType: AreaCaseType, qOf: (id: number, roof: boolean) => number, qOfQuad: (id: number) => number, perProjection: boolean, arrangement?: 0 | 1) => {
    const arr = arrangement !== undefined ? { arrangement } : {};
    for (const p of layout.pieces) {
      if (arrangement !== undefined && layout.panelColour[p.panel] !== arrangement) continue;
      const q = qOf(p.elementId, !!roof && p.roof);
      if (Math.abs(q * Math.max(p.wI, p.wJ)) <= 1e-3) continue;
      out.distributed.push({ elementId: p.elementId, caseType, q: -q * p.wI, qJ: -q * p.wJ, ...(p.a !== undefined ? { a: p.a, b: p.b } : {}), frame: 'global', ...arr });
      if (arrangement === undefined) out.planned.add(caseType);
    }
    for (const m of layout.widthMembers) {
      if (arrangement !== undefined && layout.widthColour.get(m.elementId) !== arrangement) continue;
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
  if (i.patterns) {
    // An arrangement is worth a case only when it loads less than everything: some of the
    // units carrying the symbol are of the other colour.
    const before = out.distributed.length;
    for (const [sym, q] of [['L', liveQ], ['Lr', lrQ]] as const) {
      if (!out.planned.has(sym)) continue;
      const start = out.distributed.length;
      for (const k of [0, 1] as const) put(sym, q, () => 0, true, k);
      const added = out.distributed.slice(start);
      if ([0, 1].every((k) => added.some((d) => d.arrangement === k))) out.arranged.add(sym);
      else out.distributed.length = start;
    }
    if (out.arranged.size > 0) out.derivation.push(msg('loadPlan.derivation.patterns', { symbols: [...out.arranged].join(', '), loads: out.distributed.length - before }));
  }
  return out;
}
