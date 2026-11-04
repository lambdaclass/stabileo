/**
 * The reference the slab-column joint indicator (`engine/design/analysis-validity.ts`) was checked
 * against: the span building with each column's section represented in the slab, built for this
 * test only (`tieColumnFootprints`: every shell node inside a column's 40 × 40 section tied to the
 * column's node as a rigid body, all six DOFs, the engine's u_s = u_m + θ_m × r).
 *
 * Two bays of 6 × 5 m, two floors, 20 × 50 beams, a 0,15 m slab, 1,2D + 1,6L: 570 kN of slab and
 * 117 kN of beams a floor. The meshes are the ones with nodes on the column faces (0,2 m divides
 * the half side): 0,2 m runs by default, 0,1 and 0,05 m with SLAB_COLUMN_REFERENCE=1 (about 35
 * minutes in all, most of it meshing and solving 48 000 shells at 0,05 m).
 *
 * ── How the split is read ───────────────────────────────────────────
 *
 * At the column faces, the same way on both models: what a floor's columns take (J, from their
 * axial forces) less what the beams deliver at the faces (each beam's shear at 0,20 m from the
 * column axis, on the span's side) less the beams' own weight inside the sections (14 ends ×
 * 0,20 m × 3 kN/m = 8,4 kN) is the slab's load that reaches the columns without passing through a
 * beam. With the one-node joint it is also read as the product reads it, at the node (J − B).
 *
 * ── (a) Equilibrium ─────────────────────────────────────────────────
 *
 * Both models return the applied 1 546,8 kN at the supports and take 570 + 117 kN at each floor's
 * columns, to the solve's arithmetic. It holds equally for both and decides nothing between them.
 *
 * ── (b) Convergence, (c) the idealisation: measured (P1 / P2, % of the floor's 570 kN) ──
 *
 *   mesh                            0,2 m          0,1 m          0,05 m
 *   one node, read at the node      2,0 / 1,9      0,6 / 0,6      0,2 / 0,2
 *   one node, read at the faces     7,6 / 7,4      5,8 / 5,6      5,1 / 4,8
 *   section tied, at the faces     46,5 / 42,4    40,9 / 37,3     39,7 / 36,2
 *
 * The one-node share vanishes as the mesh is refined (×3,4 per halving at the node); the tied
 * section's converges to 39,4 / 35,9 % (observed rate p ≈ 2,2, Richardson from the three meshes). So
 * the one-node joint and the column of finite section disagree at every mesh about how much of
 * the slab reaches the columns straight, and the disagreement grows as the mesh is refined.
 *
 * The interior beam V4 (axis B, 5 m, P1), at its column faces, 0,2 / 0,1 / 0,05 m: one node
 * V 96,8 / 101,3 / 103,5 kN, M −54,7 / −54,9 / −55,0 kN·m; section tied V 68,9 / 75,5 / 77,4 kN,
 * M −55,0 / −56,5 / −56,9 kN·m. The one-node joint loads it a third more in shear at 0,05 m.
 *
 * ── What sets the direct share: the beams' stiffness, not a band around the column ──
 *
 * The section tied, 0,2 m, the beams' bending stiffness multiplied by 1, 10 and 100: P1 shares
 * 46,5 / 9,7 / 2,8 %. Stiffer beams take the slab off the columns, towards the share of the slab
 * nearer the column sections than any beam (2,6 %, integrated below: the tributary of a rigid
 * support), and with no beams (a flat plate) the columns take all of it by statics. The load
 * on the column sections themselves is 0,53 %, and the slab within t/2 of their faces, the bound
 * the previous criterion held the one-node share to, 1,0 %: below even the share of the stiffest
 * beams, and some 40 times below what the column takes with the building's own beams. That bound
 * was argued from the two-way shear critical section at d/2 (CIRSOC 201 §22.6.4.1), which sets
 * where the shear stress around a column is checked; how much of the floor's load crosses it is
 * the analysis', all of it in a flat plate. It does not bound the global split.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore, resultsStore } from '..';
import { verificationStore } from '../verification.svelte';
import { designRunStore } from '../design-run.svelte';
import { currentSlabColumnJoint } from '../analysis-validity-store';
/**
 * The direct share of the reference idealisation on THIS building, % of a floor's slab load: its
 * Richardson limit. It belongs to this building (its beams' and slab's stiffness set it), so the
 * product never quotes it on a member; it is held here as the measured reference.
 */
const FOOTPRINT_REFERENCE_SHARE = 39;
import * as wasmSolver from '../../engine/wasm-solver';
import { building } from './span-fixture';
import '../../engine/design/adapters/cirsoc201-adapter';
import '../../engine/design/adapters/unsupported-adapter';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const PRINT = !!process.env.SPAN_TRACE_PRINT;
const FINE = !!process.env.SLAB_COLUMN_REFERENCE;
const COMBO = '1.2D + 1.6L';
const HALF = 0.2;
/** The solve's arithmetic, as in `design-span-load-path.test.ts`. */
const EXACT = 1e-9;
const AXES = [0, 6, 12].flatMap((x) => [0, 5].map((y) => ({ x, y })));
const r1 = (v: number) => Math.round(v * 10) / 10;

interface Floor { slab: number; beamsWeight: number; J: number; faces: number; nodes: number }
interface BeamAtFaces { V: [number, number]; M: [number, number] }
interface Reading { applied: number; reactions: number; floors: Map<number, Floor>; beams: Map<string, BeamAtFaces>; links: number }

/** The nearest column axis point to a node, and how far it is from it (plan, Chebyshev). */
function axisOf(p: { x: number; y: number }) {
  return AXES.map((a) => ({ a, d: Math.max(Math.abs(a.x - p.x), Math.abs(a.y - p.y)) })).sort((u, v) => u.d - v.d)[0]!;
}

function read(mesh: number, o: { footprint?: boolean; beamStiffness?: number } = {}): Reading {
  building(mesh, { columnSide: 2 * HALF, ...o });
  expect(designRunStore.computeDemands().ok).toBe(true);
  const combo = modelStore.model.combinations.find((c) => c.name === COMBO)!;
  const factor = (id: number) => combo.factors.find((f) => f.caseId === id)?.factor ?? 0;
  const z = (id: number) => modelStore.nodes.get(id)!.z ?? 0;
  const floors = new Map<number, Floor>();
  const fl = (lv: number) => floors.get(lv) ?? (floors.set(lv, { slab: 0, beamsWeight: 0, J: 0, faces: 0, nodes: 0 }), floors.get(lv)!);

  // Applied, from the model.
  let applied = 0;
  const area = new Map<number, number>();
  for (const l of modelStore.model.loads.values() as Iterable<{ type: string; data: { quadId?: number; q?: number; caseId?: number } }>) {
    if (l.type === 'surface3d' && l.data.quadId !== undefined) area.set(l.data.quadId, (area.get(l.data.quadId) ?? 0) + (l.data.q ?? 0) * factor(l.data.caseId ?? 0));
  }
  for (const q of modelStore.quads.values()) {
    const p = q.nodes.map((id) => modelStore.nodes.get(id)!);
    const a = Math.abs((p[2]!.x - p[0]!.x) * (p[3]!.y - p[1]!.y) - (p[2]!.y - p[0]!.y) * (p[3]!.x - p[1]!.x)) / 2;
    const w = a * (area.get(q.id)! + factor(1) * 25 * q.thickness);
    fl(p[0]!.z ?? 0).slab += w; applied += w;
  }
  for (const e of modelStore.elements.values()) {
    const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!;
    const w = factor(1) * 25 * modelStore.sections.get(e.sectionId)!.a * Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
    applied += w;
    if (Math.abs((a.z ?? 0) - (b.z ?? 0)) < 1e-9) fl(a.z ?? 0).beamsWeight += w;
  }
  const reactions = resultsStore.perCombo3D.get(combo.id)!.reactions.reduce((s, r) => s + r.fz, 0);

  // What the members carry, from the stations the design reads.
  const beams = new Map<string, BeamAtFaces>();
  const seen = new Set<string>();
  for (const c of verificationStore.contexts.values()) {
    const key = c.span?.key ?? `e${c.elementId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const s = c.stations!.comboResults.find((r) => r.comboName === COMBO)!.stations;
    const e = modelStore.elements.get(c.elementId)!;
    const start = c.span?.start ?? e.nodeI, end = c.span?.end ?? e.nodeJ;
    if (c.elementType === 'beam') {
      const V = c.axes.shear.toLowerCase() as 'vy' | 'vz', M = V === 'vz' ? 'my' : 'mz';
      const lv = z(start), A = axisOf(modelStore.nodes.get(start)!), B = axisOf(modelStore.nodes.get(end)!);
      if (A.a === B.a) continue; // a piece inside a column's section: its weight is counted below
      fl(lv).nodes += Math.abs(s[0]![V] - s[s.length - 1]![V]);
      const tf = (HALF - A.d) / c.L, tl = 1 - (HALF - B.d) / c.L;
      const at = (t: number, last: boolean) => {
        const i = s.map((x, k) => [x, k] as const).filter(([x]) => Math.abs(x.t - t) < 1e-6).map(([, k]) => k);
        expect(i.length, `a station at the face, ${key} t ${t}`).toBeGreaterThan(0);
        return s[last ? i[i.length - 1]! : i[0]!]!;
      };
      const a = at(tf, true), b = at(tl, false);
      const sense = Math.sign(a[V] - b[V]) || 1;
      fl(lv).faces += (a[V] - b[V]) * sense;
      beams.set(`${A.a.x},${A.a.y}>${B.a.x},${B.a.y}@${lv}`, { V: [a[V] * sense, -b[V] * sense], M: [a[M], b[M]] });
    } else if (c.elementType === 'column') {
      const atI = -s[0]!.n, atJ = -s[s.length - 1]!.n;
      const [top, foot] = z(e.nodeJ) > z(e.nodeI) ? [{ z: z(e.nodeJ), n: atJ }, { z: z(e.nodeI), n: atI }] : [{ z: z(e.nodeI), n: atI }, { z: z(e.nodeJ), n: atJ }];
      if (top.z > 0) fl(top.z).J += top.n;
      if (foot.z > 0) fl(foot.z).J -= foot.n;
    }
  }
  return { applied, reactions, floors, beams, links: modelStore.model.constraints.length };
}

/** The beams' weight inside the column sections, a floor: 14 ends × 0,20 m × 1,2 · 25 · 0,10 kN/m. */
const INSIDE = 14 * HALF * 1.2 * 25 * 0.1;
/** % of the floor's slab load reaching the columns straight, at the faces and (one node) at the node. */
const atFaces = (f: Floor) => r1((100 * (f.J - f.faces - INSIDE)) / f.slab);
const atNode = (f: Floor) => r1((100 * (f.J - f.nodes)) / f.slab);
const floorsOf = (x: Reading, g: (f: Floor) => number) => [...x.floors.entries()].sort((a, b) => a[0] - b[0]).map(([, f]) => g(f));
const V4 = '6,0>6,5@3';
const beamV4 = (x: Reading) => { const b = x.beams.get(V4)!; return [r1(b.V[0]), r1(b.M[0])]; };

/**
 * The share of the slab nearer the column sections than any beam (outside the sections): the
 * load a column takes straight when the beams are as stiff as it is, by tributary areas.
 * Midpoint rule on a 1 200 × 500 grid of the 12 × 5 m slab.
 */
function rigidSupportTributary(): number {
  const segs: Array<[number, number, number, number]> = [];
  for (const y of [0, 5]) for (const [x0, x1] of [[0, 6], [6, 12]] as const) segs.push([x0 + HALF, y, x1 - HALF, y]);
  for (const x of [0, 6, 12]) segs.push([x, HALF, x, 5 - HALF]);
  const toSeg = (px: number, py: number, [ax, ay, bx, by]: [number, number, number, number]) => {
    const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(px - ax - t * vx, py - ay - t * vy);
  };
  let n = 0, c = 0;
  for (let i = 0; i < 1200; i++) for (let j = 0; j < 500; j++) {
    const px = (i + 0.5) * 0.01, py = (j + 0.5) * 0.01;
    const dc = Math.min(...AXES.map((a) => Math.hypot(Math.max(Math.abs(px - a.x) - HALF, 0), Math.max(Math.abs(py - a.y) - HALF, 0))));
    const db = Math.min(...segs.map((s) => toSeg(px, py, s)));
    n++;
    if (dc < db) c++;
  }
  return r1((100 * c) / n);
}

describe('the slab-column joint on the span building: one node against the column\'s section, 0,2 m', () => {
  const x = new Map<string, Reading>();
  beforeAll(() => {
    x.set('node', read(0.2));
    x.set('section', read(0.2, { footprint: true }));
    x.set('k10', read(0.2, { footprint: true, beamStiffness: 10 }));
    x.set('k100', read(0.2, { footprint: true, beamStiffness: 100 }));
    if (!PRINT) return;
    for (const [k, v] of x) console.log(`${k}: links ${v.links} faces ${floorsOf(v, atFaces)} node ${floorsOf(v, atNode)} V4 ${beamV4(v)} beams ${JSON.stringify([...v.beams].map(([p, b]) => [p, b.V.map(r1), b.M.map(r1)]))}`);
  }, 600_000);

  it('(a) both are in equilibrium: the supports return what is applied, each floor\'s columns take slab and beams', () => {
    for (const [k, v] of x) {
      expect(Math.abs(v.applied - 1546.8), k).toBeLessThan(EXACT * 1546.8);
      expect(Math.abs(v.reactions - v.applied), k).toBeLessThan(EXACT * v.applied);
      for (const f of v.floors.values()) {
        expect(Math.abs(f.slab - 570), k).toBeLessThan(EXACT * 570);
        expect(Math.abs(f.J - f.slab - f.beamsWeight), k).toBeLessThan(EXACT * f.slab);
      }
    }
  });

  it('the tied model holds every shell node inside each column\'s section: 44 links (two floors, 4 corners and 2 edges)', () => {
    // At 0,2 m a corner column's quarter of the slab has 3 nodes besides its own, an edge column's half 5.
    expect(x.get('section')!.links).toBe(2 * (4 * 3 + 2 * 5));
    expect(x.get('node')!.links).toBe(0);
  });

  it('(c) the column\'s section takes straight about 40 % of the slab, the one node 2 %', () => {
    expect(floorsOf(x.get('node')!, atNode)).toEqual(NODE_02_AT_NODE);
    expect(floorsOf(x.get('node')!, atFaces)).toEqual(NODE_02_AT_FACES);
    expect(floorsOf(x.get('section')!, atFaces)).toEqual(SECTION_02);
    // V4 at its face, shear and moment: the one node loads it more in shear.
    expect([beamV4(x.get('node')!), beamV4(x.get('section')!)]).toEqual(V4_02);
  });

  it('the beams\' stiffness sets the share: stiffer beams take the slab off the columns, towards the rigid-support tributary', () => {
    const p1 = ['section', 'k10', 'k100'].map((k) => floorsOf(x.get(k)!, atFaces)[0]!);
    expect(p1).toEqual(STIFFNESS_02);
    expect(p1[1]!).toBeLessThan(p1[0]!);
    expect(p1[2]!).toBeLessThan(p1[1]!);
    const tributary = rigidSupportTributary();
    expect(tributary).toBe(2.6);
    // The footprint's own load (0,53 %) and the t/2 band (1,0 %) are below every one of them.
    for (const s of [...p1, tributary]) { expect(s).toBeGreaterThan(1.0); expect(s).toBeGreaterThan(0.53); }
  }, 60_000);

  it('the indicator: one node is a point joint on both floors, the tied sections are represented', () => {
    read(0.2);
    const node = currentSlabColumnJoint();
    expect(node.verdict).toBe('pointJoint');
    expect([...new Set(node.pointJoints.map((m) => m.params?.level))].sort()).toEqual([3, 6]);
    read(0.2, { footprint: true });
    expect(currentSlabColumnJoint().verdict).toBe('sectionRepresented');
  }, 60_000);
});

describe.runIf(FINE)('the reference converges: 0,2, 0,1 and 0,05 m', () => {
  const MESHES = [0.2, 0.1, 0.05] as const;
  const node = new Map<number, Reading>(), section = new Map<number, Reading>();
  beforeAll(() => {
    for (const m of MESHES) { node.set(m, read(m)); section.set(m, read(m, { footprint: true })); }
    if (PRINT) for (const m of MESHES) console.log(`mesh ${m}: node ${floorsOf(node.get(m)!, atNode)} / ${floorsOf(node.get(m)!, atFaces)} section ${floorsOf(section.get(m)!, atFaces)} V4 ${beamV4(node.get(m)!)} | ${beamV4(section.get(m)!)}`);
  }, 7_200_000);

  it('the one node\'s share vanishes, the section\'s converges to FOOTPRINT_REFERENCE_SHARE', () => {
    expect(MESHES.map((m) => [m, floorsOf(node.get(m)!, atNode), floorsOf(node.get(m)!, atFaces), floorsOf(section.get(m)!, atFaces)])).toEqual(FINE_TABLE);
    // The one node at its node: vanishing, every halving.
    for (const k of [0, 1]) for (let i = 1; i < MESHES.length; i++) expect(floorsOf(node.get(MESHES[i]!)!, atNode)[k]!).toBeLessThan(floorsOf(node.get(MESHES[i - 1]!)!, atNode)[k]!);
    // V4 at its face: [V kN, M kN·m], one node | section tied.
    expect(MESHES.map((m) => [beamV4(node.get(m)!), beamV4(section.get(m)!)])).toEqual([
      [[96.8, -54.7], [68.9, -55]], [[101.3, -54.9], [75.5, -56.5]], [[103.5, -55], [77.4, -56.9]],
    ]);
    for (const k of [0, 1]) {
      const s = MESHES.map((m) => floorsOf(section.get(m)!, atFaces)[k]!);
      // Monotone, each step smaller than the one before: converging.
      expect(s[1]!).toBeLessThan(s[0]!); expect(s[2]!).toBeLessThan(s[1]!);
      const d1 = s[0]! - s[1]!, d2 = s[1]! - s[2]!;
      expect(d2).toBeLessThan(d1);
      // Richardson: the limit from the three meshes and the observed rate.
      const p = Math.log2(d1 / d2), limit = s[2]! - d2 / (2 ** p - 1);
      if (PRINT) console.log(`floor ${k}: rate ${p} limit ${limit}`);
      if (k === 0) expect(Math.round(limit)).toBe(FOOTPRINT_REFERENCE_SHARE);
    }
  });
});

/** Measured, P1 and P2, %. */
const NODE_02_AT_NODE = [2, 1.9];
const NODE_02_AT_FACES = [7.6, 7.4];
const SECTION_02 = [46.5, 42.4];
/** V4 at its first face: [V kN, M kN·m], one node then section tied. */
const V4_02 = [[96.8, -54.7], [68.9, -55]];
const STIFFNESS_02 = [46.5, 9.7, 2.8];
const FINE_TABLE: unknown[] = [
  [0.2, [2, 1.9], [7.6, 7.4], [46.5, 42.4]],
  [0.1, [0.6, 0.6], [5.8, 5.6], [40.9, 37.3]],
  [0.05, [0.2, 0.2], [5.1, 4.8], [39.7, 36.2]],
];
