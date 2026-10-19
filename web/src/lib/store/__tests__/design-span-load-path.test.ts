/**
 * Where the load of the span building's slabs goes, mesh by mesh: what is applied, what the
 * supports give back, and how each floor's slab load splits between the beams and the columns.
 *
 * Two bays of 6 × 5 m, two floors, 40 × 40 columns (`span-fixture.ts`), solved under 1,2D + 1,6L
 * with the slab meshed at 6, 2, 1, 0,5 and 0,25 m. Applied, per floor (kN):
 *
 *   slab area loads   (1,2 · 1,5 + 1,6 · 2) kPa · 60 m²        = 300,0
 *   slab self-weight   1,2 · 25 · 0,15 kPa · 60 m²              = 270,0   → slab 570,0
 *   beams' weight      1,2 · 25 · 0,10 · 39 m                   = 117,0
 *   columns' weight    1,2 · 25 · 0,16 · 3 m · 6, per storey     =  86,4
 *
 * so 2 · (570 + 117) + 2 · 86,4 = 1 546,8 kN, and the supports return exactly that on every mesh
 * (to 1e-12 of it, the solve's arithmetic).
 *
 * ── Two questions, kept apart ───────────────────────────────────────
 *
 * Equilibrium is exact on every mesh, the coarsest included: the supports give back what is
 * applied, and at each floor what reaches the columns is the slab's 570 kN plus the beams' weight.
 * Each is asserted to the solve's arithmetic.
 *
 * WHICH WAY the slab's 570 kN reaches the columns is the mesh's: through the beams (the shear the
 * slab hands each beam between its end nodes, V(0) − V(L) less its own weight) or straight into a
 * column, through the shell nodes the slab shares with it (what the columns take at the floor less
 * what the beams bring them). Measured, floor P1 (P2 within 1,5 kN):
 *
 *   mesh               6 m     2 m     1 m     0,5 m   0,25 m
 *   through the beams  0,0    18,7   257,5   490,1   552,5
 *   into the columns 570,0   551,3   312,5    79,9    17,5
 *
 * At 6 m a bay is one shell whose corners are the column nodes: a beam has no node between its
 * columns and nothing reaches it, the whole slab goes into the columns. The split converges as
 * the mesh is refined (`design-span-mesh-convergence.test.ts`), and 6 m and 2 m are outside the
 * range where it does: the steel they give is buildable and is not the building's. What it converges
 * to is the one-node joint's own limit, no slab load straight into the columns; with each column's
 * section tied to the slab the columns take about 39 % of it straight on P1
 * (`slab-column-footprint-reference.test.ts`). So equilibrium and convergence settle nothing about
 * the third question, whether the idealisation of the joint is adequate (`analysis-validity.ts`).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore, resultsStore } from '..';
import { verificationStore } from '../verification.svelte';
import { designRunStore } from '../design-run.svelte';
import * as wasmSolver from '../../engine/wasm-solver';
import { building } from './span-fixture';
import '../../engine/design/adapters/cirsoc201-adapter';
import '../../engine/design/adapters/unsupported-adapter';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const PRINT = !!process.env.SPAN_TRACE_PRINT;
const MESHES = [6, 2, 1, 0.5, 0.25] as const;
const COMBO = '1.2D + 1.6L';
const F_D = 1.2, F_L = 1.6, RHO = 25;
/**
 * The solve's arithmetic: a sparse direct solve in double precision returns forces whose sums
 * close to a few hundred ulps of the largest (measured 6e-13 of the total at 0,25 m). 1e-9 is
 * three orders above that and three below the smallest load path reported (0,1 kN of 570).
 */
const EXACT = 1e-9;

interface FloorPath {
  /** The slab's own weight and its area loads, kN. */
  slab: number;
  beamsWeight: number;
  /** What the floor's columns take at their joints: Σ (N below − N above), kN. */
  intoColumns: number;
  /** The slab's load the beams carry: Σ over beams of V(0) − V(L) less their weight, kN. */
  throughBeams: number;
  /** The rest of what the columns take: the slab's load at the shell nodes on the column nodes. */
  direct: number;
}

interface MeshPath { applied: number; reactions: number; floors: Map<number, FloorPath> }

function pathAt(mesh: number): MeshPath {
  building(mesh, { columnSide: 0.4 });
  expect(designRunStore.computeDemands().ok).toBe(true);
  const combo = modelStore.model.combinations.find((c) => c.name === COMBO)!;
  const factor = (caseId: number) => combo.factors.find((f) => f.caseId === caseId)?.factor ?? 0;
  expect([factor(1), factor(2)]).toEqual([F_D, F_L]);
  const z = (id: number) => modelStore.nodes.get(id)!.z ?? 0;

  // ── Applied, from the model ──
  const floors = new Map<number, FloorPath>();
  const floor = (lv: number) => {
    if (!floors.has(lv)) floors.set(lv, { slab: 0, beamsWeight: 0, intoColumns: 0, throughBeams: 0, direct: 0 });
    return floors.get(lv)!;
  };
  let applied = 0;
  const areaLoad = new Map<number, number>();
  for (const l of modelStore.model.loads.values() as Iterable<{ type: string; data: { quadId?: number; q?: number; caseId?: number } }>) {
    if (l.type !== 'surface3d' || l.data.quadId === undefined) continue;
    areaLoad.set(l.data.quadId, (areaLoad.get(l.data.quadId) ?? 0) + (l.data.q ?? 0) * factor(l.data.caseId ?? 0));
  }
  expect(areaLoad.size).toBe(modelStore.quads.size);
  for (const q of modelStore.quads.values()) {
    const p = q.nodes.map((id) => modelStore.nodes.get(id)!);
    const d1 = { x: p[2]!.x - p[0]!.x, y: p[2]!.y - p[0]!.y }, d2 = { x: p[3]!.x - p[1]!.x, y: p[3]!.y - p[1]!.y };
    const area = Math.abs(d1.x * d2.y - d1.y * d2.x) / 2;
    const w = area * (areaLoad.get(q.id)! + F_D * RHO * q.thickness);
    floor(p[0]!.z ?? 0).slab += w;
    applied += w;
  }
  for (const e of modelStore.elements.values()) {
    const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!;
    const w = F_D * RHO * modelStore.sections.get(e.sectionId)!.a * Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
    applied += w;
    if (Math.abs((a.z ?? 0) - (b.z ?? 0)) < 1e-9) floor(a.z ?? 0).beamsWeight += w;
  }
  const reactions = resultsStore.perCombo3D.get(combo.id)!.reactions.reduce((s, r) => s + r.fz, 0);

  // ── What the members carry, from the stations the design reads ──
  const seen = new Set<string>();
  for (const c of verificationStore.contexts.values()) {
    const key = c.span?.key ?? `e${c.elementId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const s = c.stations!.comboResults.find((r) => r.comboName === COMBO)!.stations;
    const e = modelStore.elements.get(c.elementId)!;
    if (c.elementType === 'beam') {
      const V = c.axes.shear.toLowerCase() as 'vy' | 'vz';
      const lv = z(c.span?.start ?? e.nodeI);
      floor(lv).throughBeams += Math.abs(s[0]![V] - s[s.length - 1]![V]) - F_D * RHO * c.section.b * c.section.h * c.L;
    } else if (c.elementType === 'column') {
      // Compression at each end; t = 0 is node I. A column takes −N from the joint at its top
      // and gives −N to the one at its foot.
      const atI = -s[0]!.n, atJ = -s[s.length - 1]!.n;
      const [top, foot] = z(e.nodeJ) > z(e.nodeI) ? [{ z: z(e.nodeJ), n: atJ }, { z: z(e.nodeI), n: atI }] : [{ z: z(e.nodeI), n: atI }, { z: z(e.nodeJ), n: atJ }];
      if (floors.has(top.z)) floor(top.z).intoColumns += top.n;
      if (floors.has(foot.z)) floor(foot.z).intoColumns -= foot.n;
    }
  }
  for (const f of floors.values()) f.direct = f.intoColumns - f.beamsWeight - f.throughBeams;
  return { applied, reactions, floors };
}

describe('the slab load of the span building, from the slab to the supports, on every mesh', () => {
  const p = new Map<number, MeshPath>();
  beforeAll(() => {
    for (const m of MESHES) p.set(m, pathAt(m));
    if (!PRINT) return;
    const r = (v: number) => v.toFixed(1);
    for (const [m, x] of p) {
      console.log(`MESH ${m}: applied ${x.applied} reactions ${x.reactions}`);
      for (const [lv, f] of x.floors) console.log(`  z ${lv}: slab ${r(f.slab)} beams' weight ${r(f.beamsWeight)} into columns ${r(f.intoColumns)} = beams' weight + through beams ${r(f.throughBeams)} + direct ${r(f.direct)}`);
    }
  }, 300_000);

  it('applies the same loads on every mesh: 570 kN of slab and 117 kN of beams a floor, 1 546,8 kN in all', () => {
    for (const [m, x] of p) {
      expect(Math.abs(x.applied - 1546.8), `mesh ${m}`).toBeLessThan(EXACT * 1546.8);
      expect([...x.floors.keys()].sort(), `mesh ${m}`).toEqual([3, 6]);
      for (const f of x.floors.values()) {
        expect(Math.abs(f.slab - 570), `mesh ${m}`).toBeLessThan(EXACT * 570);
        expect(Math.abs(f.beamsWeight - 117), `mesh ${m}`).toBeLessThan(EXACT * 117);
      }
    }
  });

  it('is in equilibrium on every mesh, the coarsest included: the supports return what is applied', () => {
    for (const [m, x] of p) expect(Math.abs(x.reactions - x.applied), `mesh ${m}: ${x.reactions} against ${x.applied}`).toBeLessThan(EXACT * x.applied);
  });

  it('at every floor of every mesh the columns take the slab and the beams\' weight, all of it', () => {
    for (const [m, x] of p) for (const [lv, f] of x.floors) {
      expect(Math.abs(f.intoColumns - f.slab - f.beamsWeight), `mesh ${m}, z ${lv}`).toBeLessThan(EXACT * f.slab);
    }
  });

  it('which way the slab reaches the columns is the mesh\'s: at 6 m all of it straight into them', () => {
    const split = (m: number) => [...p.get(m)!.floors.entries()].sort((a, b) => a[0] - b[0])
      .map(([, f]) => [Math.round(f.throughBeams * 10) / 10, Math.round(f.direct * 10) / 10]);
    // At 6 m a beam has no node between its columns: nothing of the slab reaches it.
    for (const f of p.get(6)!.floors.values()) {
      expect(Math.abs(f.throughBeams)).toBeLessThan(EXACT * f.slab);
      expect(Math.abs(f.direct - f.slab)).toBeLessThan(EXACT * f.slab);
    }
    // The split as measured, P1 and P2: [through the beams, straight into the columns], kN.
    expect(MESHES.map((m) => [m, ...split(m)])).toEqual(SPLIT);
    // Refining the mesh sends more of it through the beams, every step.
    for (const lv of [3, 6]) {
      const through = MESHES.map((m) => p.get(m)!.floors.get(lv)!.throughBeams);
      for (let k = 1; k < through.length; k++) expect(through[k]!, `z ${lv}, ${MESHES[k]} m`).toBeGreaterThan(through[k - 1]!);
    }
  });
});

/** Measured: per mesh, per floor (P1, P2), [through the beams, straight into the columns], kN. */
const SPLIT: unknown[] = [
  [6, [0, 570], [0, 570]],
  [2, [18.7, 551.3], [19.1, 550.9]],
  [1, [257.5, 312.5], [259, 311]],
  [0.5, [490.1, 79.9], [491.1, 78.9]],
  [0.25, [552.5, 17.5], [552.9, 17.1]],
];
