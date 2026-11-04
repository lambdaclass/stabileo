/**
 * The stairs of an imported building, built as flights and landings once the floors are in.
 *
 * Each flight of the file (`IfcStairRead`) is built as the Stairs tools build one
 * (`buildFlightInto`): one shell per step, its waist as thick as the file's, the steps' weight on
 * the dead case. Each landing is a slab of shells at its mid-depth, cut where the flights reach
 * it, so a flight's edge on a landing shares its nodes (the file draws a flight's edge a few
 * centimetres off the landing, or a little into it: the edge is taken onto it). An edge on no
 * landing goes to the nearest level within a few decimetres (the file draws a flight's top under
 * the slab it reaches).
 *
 * The stair is then joined to the structure: each of its free edges and its landings' borders to
 * the nearest node of the building within 0,6 m, by a stiff connector; a lower edge with nothing near
 * is set in the ground (fixed). A part of a stair joined to nothing is left out, which a solve
 * would refuse as disconnected. Each flight kept is declared a stair (`designStairFromFlight`)
 * with its riser, tread, steps, width and waist, for the stair design.
 */
import { modelStore } from '../store/model.svelte';
import { buildFlightInto } from '../model/stair-convert';
import { stepWeightPerInclinedArea, type StairSpec } from '../model/stair';
import { designStairFromFlight } from '../store/stair-link';
import { findCoincidentNode } from '../engine/mesh-weld';
import type { Level } from '../model/grid';
import type { IfcStairRead } from './ifc-mapper';

export interface StairsPlaced { flights: number; landings: number; tied: number; grounded: number; skipped: string[] }

type P = { x: number; y: number; z: number };
const REACH = 0.6;
/** How far off a landing, in plan and in height, a flight's edge is still taken onto it, m. */
const ON_LANDING = 0.15, ON_LANDING_Z = 0.3;
/** Cuts of a landing closer than this are one: no sliver shells, m. */
const CUT_MERGE = 0.1;
/**
 * The stiffness a stair is joined to the structure with, kN/m and kN·m/rad: some ten times a
 * concrete slab's own over a metre, so the joint holds as a rigid one would without spoiling the
 * solve's conditioning.
 */
const LINK_K = 1e7, LINK_KR = 1e6;
/** A riser where the file states none: what a dwelling stair has. */
const DEFAULT_RISER = 0.175;

interface Landing {
  o: P; eu: P; ev: P; lu: number; lv: number; z: number; thickness: number;
  cu: number[]; cv: number[];
  quads: number[]; nodes: number[]; border: number[];
}
interface Flight { name: string; spec: StairSpec; width: number; quads: number[]; low: P[]; high: P[]; lowOnLanding: boolean; highOnLanding: boolean }

export function placeStairs(stairs: readonly IfcStairRead[], levels: readonly Level[], o: { materialId?: number } = {}): StairsPlaced {
  const out: StairsPlaced = { flights: 0, landings: 0, tied: 0, grounded: 0, skipped: [] };
  if (!stairs.length) return out;
  const m = modelStore.model;
  const mat = o.materialId ?? [...m.materials.values()].find((x) => (x.fc ?? x.fy ?? 999) <= 80)?.id;
  if (mat === undefined) { out.skipped.push(...stairs.map((s) => s.name)); return out; }
  const density = m.materials.get(mat)?.rho ?? 25;
  const deadCase = m.loadCases.find((c) => c.type === 'D')?.id ?? m.loadCases[0]?.id ?? 1;
  const toLevel = (z: number) => {
    const lv = [...levels].sort((a, b) => Math.abs(a.z - z) - Math.abs(b.z - z))[0];
    return lv && Math.abs(lv.z - z) < 0.4 ? lv.z : z;
  };
  const before = new Set(m.nodes.keys());
  const nodeAt = (p: P) => findCoincidentNode(modelStore.model.nodes.values(), p.x, p.y, p.z) ?? modelStore.addNode(p.x, p.y, p.z !== 0 ? p.z : undefined);
  const flights: Flight[] = [];
  const landings: Landing[] = [];

  for (const s of stairs) {
    // The landings first, each in its own axes; their height taken to a level as a flight's edge is.
    const own: Landing[] = (s.landings ?? []).map((l) => {
      const [a, b, , d] = l.corners;
      const lu = Math.hypot(b.x - a.x, b.y - a.y), lv = Math.hypot(d.x - a.x, d.y - a.y);
      const z = toLevel(a.z);
      return {
        o: { ...a, z }, eu: { x: (b.x - a.x) / lu, y: (b.y - a.y) / lu, z: 0 }, ev: { x: (d.x - a.x) / lv, y: (d.y - a.y) / lv, z: 0 },
        lu, lv, z, thickness: l.thickness, cu: [0, lu], cv: [0, lv], quads: [], nodes: [], border: [],
      };
    }).filter((l) => l.lu > 0.2 && l.lv > 0.2);
    const local = (l: Landing, p: P) => ({ u: (p.x - l.o.x) * l.eu.x + (p.y - l.o.y) * l.eu.y, v: (p.x - l.o.x) * l.ev.x + (p.y - l.o.y) * l.ev.y });
    const onLanding = (p: P) => own.find((l) => {
      const q = local(l, p);
      return q.u > -ON_LANDING && q.u < l.lu + ON_LANDING && q.v > -ON_LANDING && q.v < l.lv + ON_LANDING && Math.abs(p.z - l.z) < ON_LANDING_Z;
    });
    // A flight's edge on a landing: taken onto it, and the landing cut there.
    const edgeOf = (edge: readonly P[]) => {
      const l = onLanding(edge[0]!) ?? onLanding(edge[1]!);
      if (!l || !edge.every((p) => onLanding(p) === l)) return { pts: edge.map((p) => ({ ...p, z: toLevel(p.z) })), l: undefined };
      const qs = edge.map((p) => local(l, p)).map((q) => ({ u: Math.min(l.lu, Math.max(0, q.u)), v: Math.min(l.lv, Math.max(0, q.v)) }));
      for (const q of qs) { l.cu.push(q.u); l.cv.push(q.v); }
      return { pts: qs, l };
    };
    const pending: Array<{ f: IfcStairRead['flights'][number]; low: ReturnType<typeof edgeOf>; high: ReturnType<typeof edgeOf> }> = [];
    for (const f of s.flights) pending.push({ f, low: edgeOf(f.low), high: edgeOf(f.high) });
    // Each landing's cuts merged, and a flight's edge moved onto the merged ones.
    const merge = (cuts: number[]) => {
      const sorted = [...cuts].sort((a, b) => a - b), kept: number[] = [];
      for (const c of sorted) if (!kept.length || c - kept[kept.length - 1]! > CUT_MERGE) kept.push(c);
      // The landing's far side is kept as drawn.
      if (kept.length > 1 && sorted[sorted.length - 1]! - kept[kept.length - 1]! > 1e-9) kept[kept.length - 1] = sorted[sorted.length - 1]!;
      return kept;
    };
    for (const l of own) { l.cu = merge(l.cu); l.cv = merge(l.cv); }
    const nearestCut = (cuts: number[], x: number) => cuts.reduce((b, c) => (Math.abs(c - x) < Math.abs(b - x) ? c : b), cuts[0]!);
    const world = (l: Landing, u: number, v: number): P => ({ x: l.o.x + u * l.eu.x + v * l.ev.x, y: l.o.y + u * l.eu.y + v * l.ev.y, z: l.z });
    const place = (e: ReturnType<typeof edgeOf>): P[] => {
      if (!e.l) return e.pts as P[];
      const l = e.l;
      return (e.pts as Array<{ u: number; v: number }>).map((q) => world(l, nearestCut(l.cu, q.u), nearestCut(l.cv, q.v)));
    };
    // The landings' shells, a grid on their cuts.
    for (const l of own) {
      const grid = l.cu.map((u) => l.cv.map((v) => nodeAt(world(l, u, v))));
      for (let i = 0; i + 1 < l.cu.length; i++) for (let j = 0; j + 1 < l.cv.length; j++) {
        l.quads.push(modelStore.addQuad([grid[i]![j]!, grid[i + 1]![j]!, grid[i + 1]![j + 1]!, grid[i]![j + 1]!], mat, l.thickness));
      }
      l.nodes = grid.flat();
      l.border = grid.flatMap((col, i) => col.filter((_, j) => i === 0 || i === l.cu.length - 1 || j === 0 || j === l.cv.length - 1));
      landings.push(l);
    }
    for (const { f, low: lo, high: hi } of pending) {
      const low = place(lo), high = place(hi);
      const rise = (high[0]!.z + high[1]!.z) / 2 - (low[0]!.z + low[1]!.z) / 2;
      const mid = (a: P, b: P) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      const ml = mid(low[0]!, low[1]!), mh = mid(high[0]!, high[1]!);
      const run = Math.hypot(mh.x - ml.x, mh.y - ml.y);
      if (!(rise > 0.2 && run > 0.3)) { out.skipped.push(s.name); continue; }
      const steps = Math.max(2, Math.round(rise / (s.riserHeight ?? DEFAULT_RISER)));
      const spec: StairSpec = { riser: rise / steps, tread: run / (steps - 1), steps, waist: f.waist };
      const quads = buildFlightInto([low[0]!, low[1]!, high[1]!, high[0]!], {
        divisions: Math.min(40, steps), materialId: mat, waist: f.waist,
        stepLoad: stepWeightPerInclinedArea(spec, density), deadCase,
      });
      if (!quads.length) { out.skipped.push(s.name); continue; }
      flights.push({ name: s.name, spec, width: Math.hypot(low[1]!.x - low[0]!.x, low[1]!.y - low[0]!.y), quads, low, high, lowOnLanding: !!lo.l, highOnLanding: !!hi.l });
    }
  }

  // The stair's own nodes: never a link's master, so links do not chain.
  const mine = new Set([...modelStore.model.nodes.keys()].filter((id) => !before.has(id)));
  const slaves = new Set(modelStore.model.constraints.flatMap((c) => ('slaveNode' in c ? [(c as { slaveNode: number }).slaveNode] : [])));
  const nearest = (id: number) => {
    const n = modelStore.model.nodes.get(id)!;
    let best: number | null = null, bd = REACH;
    for (const [k, q] of modelStore.model.nodes) {
      if (mine.has(k) || slaves.has(k)) continue;
      const d = Math.hypot(q.x - n.x, q.y - n.y, (q.z ?? 0) - (n.z ?? 0));
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  };
  const idOf = (p: P) => findCoincidentNode(modelStore.model.nodes.values(), p.x, p.y, p.z);
  const tiedNodes = new Set<number>(), fixedNodes = new Set<number>();
  // A stiff connector, not a rigid-link constraint: the constraints' check went over every node
  // for each of them, which took a building's combinations from seconds to minutes, and a model with
  // constraints withholds the participation factors its response spectrum needs.
  const tie = (id: number, master: number) => {
    if (tiedNodes.has(id) || fixedNodes.has(id)) return;
    modelStore.addConnector({ nodeI: master, nodeJ: id, kAxial: LINK_K, kShear: LINK_K, kShearZ: LINK_K, kMoment: LINK_KR, kBendY: LINK_KR, kBendZ: LINK_KR });
    tiedNodes.add(id); slaves.add(id);
  };
  for (const f of flights) {
    for (const [edge, onL, isLow] of [[f.low, f.lowOnLanding, true], [f.high, f.highOnLanding, false]] as const) {
      if (onL) continue;
      const ids = edge.map(idOf).filter((x): x is number => x !== null);
      const masters = ids.map(nearest);
      if (ids.length && masters.every((x) => x !== null)) { ids.forEach((id, k) => tie(id, masters[k]!)); out.tied++; }
      else if (isLow && ids.length) {
        // A foot with nothing near stands on the ground (fixed, as the block it stands on: pinned
        // along one line, the flight would turn about it).
        for (const id of ids) { if (!tiedNodes.has(id)) { modelStore.addSupport(id, 'fixed3d' as never); fixedNodes.add(id); } }
        out.grounded++;
      }
    }
  }
  // A landing against a floor or a wall rests on it where they meet.
  for (const l of landings) for (const id of l.border) { const k = nearest(id); if (k !== null) tie(id, k); }

  // The stair's parts, as its shells join them; each must reach the structure by a link.
  const parts: Array<{ quads: number[]; flights: Flight[]; landings: Landing[] }> = [];
  const owner = new Map<number, number>();
  const pieces: Array<{ quads: number[]; flight?: Flight; landing?: Landing }> = [...flights.map((f) => ({ quads: f.quads, flight: f })), ...landings.map((l) => ({ quads: l.quads, landing: l }))];
  const nodesOf = (qs: number[]) => qs.flatMap((q) => modelStore.model.quads.get(q)?.nodes ?? []);
  const parent = pieces.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  pieces.forEach((p, i) => { for (const n of nodesOf(p.quads)) { const j = owner.get(n); if (j === undefined) owner.set(n, i); else parent[find(i)] = find(j); } });
  const byRoot = new Map<number, number[]>();
  pieces.forEach((_, i) => byRoot.set(find(i), [...(byRoot.get(find(i)) ?? []), i]));
  for (const idx of byRoot.values()) {
    parts.push({ quads: idx.flatMap((i) => pieces[i]!.quads), flights: idx.flatMap((i) => (pieces[i]!.flight ? [pieces[i]!.flight!] : [])), landings: idx.flatMap((i) => (pieces[i]!.landing ? [pieces[i]!.landing!] : [])) });
  }
  for (const part of parts) {
    const ns = new Set(nodesOf(part.quads));
    if ([...ns].some((n) => tiedNodes.has(n))) {
      out.flights += part.flights.length; out.landings += part.landings.length;
      for (const f of part.flights) designStairFromFlight(f.spec, f.width, f.quads);
      continue;
    }
    // Joined to nothing: left out rather than left floating, which would stop the solve.
    for (const q of part.quads) modelStore.removeQuad(q);
    for (const n of ns) if (mine.has(n)) modelStore.removeNode(n);
    for (const f of part.flights) if (!out.skipped.includes(f.name)) out.skipped.push(f.name);
    out.grounded -= part.flights.filter((f) => !f.lowOnLanding).length;
  }
  out.grounded = Math.max(0, out.grounded);
  return out;
}
