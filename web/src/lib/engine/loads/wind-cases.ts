/**
 * The design wind load cases of CIRSOC 102-2025 §2.4.6 (Fig. 2.4-8), as nodal forces per level
 * and line loads on the roof members.
 *
 *   Case 1  the full pressures along each principal axis, one axis at a time;
 *   Case 2  ¾ of case 1 along one axis with a torsional moment MT = 0,75·F·e, e = ±0,15·B;
 *   Case 3  ¾ of case 1 along both axes at once;
 *   Case 4  ¾ of case 2 along both axes at once (0,563), with the torsion of both.
 *
 * Roofs: ¾ of case 1 in cases 2 and 4; in cases 3 and 4, note 2 asks for the larger of the two
 * directions' roof pressure on each area, which is what `roofLoads` takes member by member.
 *
 * ── Levels and torsion ───────────────────────────────────────────
 *
 * Each level's force is the net windward and leeward pressure integrated over its band of
 * height (`load-plan.ts`). It is spread over the level's nodes, and MT over the same nodes as
 * forces proportional to their distance from the nodes' centroid, perpendicular to it: a set
 * with no resultant force and moment MT about the vertical, which is note 4's "otro método
 * racional" for floors without a rigid diaphragm, and on a rigid one the diaphragm receives MT
 * whatever the split. A level with one node takes MT as a nodal moment.
 *
 * Case 4 applies both eccentricities with the same sense of rotation, the pair that gives the
 * largest torsional moment. The sign of e (§2.4.6: "el que cause el efecto de carga más
 * severo") is covered by generating both senses.
 *
 * ── Both senses of each axis ─────────────────────────────────────
 *
 * The cases for wind from −X and −Y are generated explicitly rather than by a sign in the
 * combination: the lateral forces reverse, the roof suction does not, and a case multiplied by
 * −1 would turn suction into pressure.
 *
 * ── Roof members ─────────────────────────────────────────────────
 *
 * A roof member is a beam-like member (|Δz|/L ≤ 0,5, the same test the gravity loads use)
 * whose two nodes are above the ground and have no column rising from them. The pressure is
 * normal to the member, so it goes on the member's local z, with the tributary width the
 * gravity loads use. Below 10°, or with wind parallel to the ridge, the coefficient is read by
 * distance from the windward edge (`flatRoofCp`); above, the windward and leeward slopes of
 * Fig. 2.4-1 by the member's slope relative to the wind. The internal pressure is taken with
 * each sign in case 1; cases 2 to 4 carry the roof with the positive sign, the larger suction.
 *
 * Pure: no store.
 */
import {
  flatRoofCp, roofCp, G_RIGID, type WindProject,
} from '../../codes/cirsoc102/wind';
import { msg, type EngineMessage } from '../../codes/message';

export type WindCaseSet = 'case1' | 'cases13' | 'all';

type Axis = 'x' | 'y';
type Sense = 1 | -1;

export interface WindLevel {
  elevation: number;
  nodeIds: number[];
  /** Case 1 force at the level, kN, with the §2.1.5 minimum. */
  force: number;
  /** The same force from the pressures alone, kN. The minimum is a case of its own (C 2.1.5). */
  pressureForce: number;
}

export interface WindAxis {
  axis: Axis;
  /** Building width across the wind, m. */
  across: number;
  /** Plan dimension along the wind, m. */
  along: number;
  levels: WindLevel[];
  project: WindProject;
  qhNm2: number;
  /** (GC_pi) magnitude for the building's enclosure. */
  gcpi: number;
}

export interface WindModel {
  nodes: Map<number, { id: number; x: number; y: number; z?: number }>;
  elements: Map<number, { id: number; nodeI: number; nodeJ: number }>;
}

export interface WindCaseLoads {
  nameKey: string;
  nameParams: Record<string, string | number>;
  nodal: Array<{ nodeId: number; fx: number; fy: number; mz: number }>;
  distributed: Array<{ elementId: number; q: number }>;
}

const Z = (n: { z?: number }) => n.z ?? 0;
const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

/** Forces `fx`, `fy` and moment `mt` about the vertical, over the nodes of one level. */
export function levelLoads(
  nodes: WindModel['nodes'], ids: number[], fx: number, fy: number, mt: number,
): WindCaseLoads['nodal'] {
  const pts = ids.map((id) => nodes.get(id)).filter((n): n is NonNullable<typeof n> => !!n);
  if (pts.length === 0) return [];
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const ip = pts.reduce((s, p) => s + (p.x - cx) ** 2 + (p.y - cy) ** 2, 0);
  const n = pts.length;
  if (ip < 1e-9) {
    // Every node on one point: the moment goes on as a moment.
    return pts.map((p, i) => ({ nodeId: p.id, fx: fx / n, fy: fy / n, mz: i === 0 ? mt : 0 }));
  }
  return pts.map((p) => ({
    nodeId: p.id,
    fx: fx / n - (mt * (p.y - cy)) / ip,
    fy: fy / n + (mt * (p.x - cx)) / ip,
    mz: 0,
  }));
}

interface RoofMember { id: number; mid: { x: number; y: number }; dx: number; dy: number; dz: number; lh: number }

/** The members the roof pressures go on (see the header). */
export function roofMembers(model: WindModel): RoofMember[] {
  const rising = new Set<number>();
  const beamLike = (dz: number, L: number) => L > 0.01 && Math.abs(dz) / L <= 0.5;
  for (const e of model.elements.values()) {
    const a = model.nodes.get(e.nodeI), b = model.nodes.get(e.nodeJ);
    if (!a || !b) continue;
    const dz = Z(b) - Z(a), L = Math.hypot(b.x - a.x, b.y - a.y, dz);
    if (beamLike(dz, L)) continue;
    rising.add(dz > 0 ? a.id : b.id);
  }
  const out: RoofMember[] = [];
  for (const e of model.elements.values()) {
    const a = model.nodes.get(e.nodeI), b = model.nodes.get(e.nodeJ);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y, dz = Z(b) - Z(a);
    const L = Math.hypot(dx, dy, dz);
    if (!beamLike(dz, L) || Z(a) <= 0.05 || Z(b) <= 0.05) continue;
    if (rising.has(a.id) || rising.has(b.id)) continue;
    out.push({ id: e.id, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dx, dy, dz, lh: Math.hypot(dx, dy) });
  }
  return out;
}

/**
 * The roof line loads for wind along `w.axis` in `sense`, kN/m on local z (upward positive).
 * `gcpiSign` +1 takes the internal pressure that adds to suction, −1 the one that adds to
 * pressure, each with the external coefficient that makes it worse.
 */
export function roofLoads(
  roof: RoofMember[], w: WindAxis, sense: Sense, gcpiSign: 1 | -1, tributaryWidth: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
): Map<number, number> {
  const out = new Map<number, number>();
  const h = w.project.meanRoofHeight, hOverL = h / Math.max(w.along, 1e-9);
  const qh = w.qhNm2, qi = gcpiSign * w.gcpi * qh;
  const theta = w.project.roofSlopeDeg;
  const gable = theta >= 10 ? roofCp(hOverL, theta) : null;
  for (const m of roof) {
    const along = w.axis === 'x' ? m.dx : m.dy;
    // Distance from the windward edge, along the wind.
    const s = w.axis === 'x'
      ? (sense > 0 ? m.mid.x - bounds.minX : bounds.maxX - m.mid.x)
      : (sense > 0 ? m.mid.y - bounds.minY : bounds.maxY - m.mid.y);
    const slopedAlongWind = gable && m.lh > 0 && Math.abs(m.dz) / m.lh > Math.tan((5 * Math.PI) / 180)
      && Math.abs(along) > 0.5 * m.lh;
    let cps: number[];
    if (slopedAlongWind) {
      // Windward: the member rises in the direction the wind blows.
      const windward = m.dz * along * sense > 0;
      cps = windward ? gable!.windward : gable!.leeward;
    } else {
      cps = flatRoofCp(hOverL, Math.max(s, 0), h).cp;
    }
    if (cps.length === 0) continue;
    const cp = gcpiSign > 0 ? Math.min(...cps) : Math.max(...cps);
    const p = qh * G_RIGID * cp - qi;            // N/m², positive toward the roof
    out.set(m.id, (-p / 1000) * tributaryWidth); // kN/m, upward positive
  }
  return out;
}

export interface WindCasesInput {
  model: WindModel;
  axes: WindAxis[];
  set: WindCaseSet;
  bothSenses: boolean;
  tributaryWidth: number;
  speed: number;
}

/** All the cases the set asks for, with their loads. */
export function windLoadCases(input: WindCasesInput): { cases: WindCaseLoads[]; notes: EngineMessage[] } {
  const { model, set } = input;
  const notes: EngineMessage[] = [];
  const cases: WindCaseLoads[] = [];
  const senses: Sense[] = input.bothSenses ? [1, -1] : [1];
  const roof = roofMembers(model);
  const xs = [...model.nodes.values()].map((n) => n.x), ys = [...model.nodes.values()].map((n) => n.y);
  const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  const byAxis = new Map(input.axes.map((a) => [a.axis, a]));
  const signTxt = (s: number) => (s > 0 ? '+' : '−');
  const dirTxt = (a: Axis, s: Sense) => `${signTxt(s)}${a.toUpperCase()}`;
  const v = input.speed;

  const roofFor = (a: WindAxis, s: Sense, g: 1 | -1) => roofLoads(roof, a, s, g, input.tributaryWidth, bounds);
  const push = (nameKey: string, nameParams: WindCaseLoads['nameParams'], nodal: WindCaseLoads['nodal'], roofQ: Map<number, number>) => {
    cases.push({
      nameKey, nameParams, nodal,
      distributed: [...roofQ].filter(([, q]) => Math.abs(q) > 1e-4).map(([elementId, q]) => ({ elementId, q })),
    });
  };
  const scaled = (m: Map<number, number>, k: number) => new Map([...m].map(([id, q]) => [id, q * k]));
  /** Note 2: on each member, the larger (in magnitude) of the two directions' roof load. */
  const larger = (a: Map<number, number>, b: Map<number, number>) => {
    const out = new Map(a);
    for (const [id, q] of b) if (!out.has(id) || Math.abs(q) > Math.abs(out.get(id)!)) out.set(id, q);
    return out;
  };

  // ── Case 1 ──
  for (const a of input.axes) {
    for (const s of senses) {
      const nodal = a.levels.flatMap((lv) => levelLoads(model.nodes, lv.nodeIds,
        a.axis === 'x' ? s * lv.force : 0, a.axis === 'y' ? s * lv.force : 0, 0));
      const gSigns: Array<1 | -1> = roof.length > 0 && a.gcpi > 0 ? [1, -1] : [1];
      for (const g of gSigns) {
        push(gSigns.length > 1 ? 'autoLoad.windCase1Gcpi' : 'autoLoad.windCase1',
          { dir: dirTxt(a.axis, s), v, gcpi: signTxt(g) }, nodal, roofFor(a, s, g));
      }
    }
  }
  if (set === 'case1') return { cases, notes };

  const lateral = (a: WindAxis, s: Sense, k: number, e: number) => a.levels.flatMap((lv) => {
    const F = s * k * lv.pressureForce;
    // MT = F·e about the vertical, e = ±0,15 B measured across the wind.
    const mt = Math.abs(F) * e;
    return levelLoads(model.nodes, lv.nodeIds, a.axis === 'x' ? F : 0, a.axis === 'y' ? F : 0, mt);
  });

  // ── Case 2 ──
  if (set === 'all') {
    for (const a of input.axes) {
      for (const s of senses) {
        for (const es of [1, -1] as const) {
          push('autoLoad.windCase2', { dir: dirTxt(a.axis, s), e: signTxt(es), v },
            lateral(a, s, 0.75, es * 0.15 * a.across), scaled(roofFor(a, s, 1), 0.75));
        }
      }
    }
  }

  // ── Cases 3 and 4: both axes at once ──
  const ax = byAxis.get('x'), ay = byAxis.get('y');
  if (!ax || !ay) {
    notes.push(msg('loadPlan.note.windCases34NeedBothAxes'));
    return { cases, notes };
  }
  const merge = (p: WindCaseLoads['nodal'], q: WindCaseLoads['nodal']) => {
    const m = new Map<number, { nodeId: number; fx: number; fy: number; mz: number }>();
    for (const r of [...p, ...q]) {
      const c = m.get(r.nodeId) ?? { nodeId: r.nodeId, fx: 0, fy: 0, mz: 0 };
      c.fx += r.fx; c.fy += r.fy; c.mz += r.mz;
      m.set(r.nodeId, c);
    }
    return [...m.values()];
  };
  const quadrants: Array<[Sense, Sense]> = input.bothSenses
    ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 1], [1, -1]];
  for (const [sx, sy] of quadrants) {
    const roofQ = larger(roofFor(ax, sx, 1), roofFor(ay, sy, 1));
    push('autoLoad.windCase3', { dirX: dirTxt('x', sx), dirY: dirTxt('y', sy), v },
      merge(lateral(ax, sx, 0.75, 0), lateral(ay, sy, 0.75, 0)), roofQ);
    if (set !== 'all') continue;
    for (const es of [1, -1] as const) {
      push('autoLoad.windCase4', { dirX: dirTxt('x', sx), dirY: dirTxt('y', sy), e: signTxt(es), v },
        merge(lateral(ax, sx, 0.563, es * 0.15 * ax.across), lateral(ay, sy, 0.563, es * 0.15 * ay.across)),
        scaled(roofQ, 0.75));
    }
  }
  if (roof.length > 0) notes.push(msg('loadPlan.note.windRoofApplied', { members: roof.length, width: round(input.tributaryWidth, 2) }));
  return { cases, notes };
}
