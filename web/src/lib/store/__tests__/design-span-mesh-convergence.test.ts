/**
 * The forces the beams of the span building are designed for, solved under slab meshes of 6, 2,
 * 1, 0,5 and 0,25 m: what converges, how fast, and which meshes are outside the range where it
 * does. `design-span-mesh-guard.test.ts` shows the design and the detailing give the same steel
 * for the same forces on every mesh, so these forces are where the meshes' steel differs.
 *
 * Read per design member (a span, or a beam the mesh did not cut) from the contexts the design
 * builds (`computeDemands`, `design-spans.ts`), in the 1,2D + 1,6L combination for the load and
 * in the governing one for the rest:
 *
 *   - Mu+ and Mu−, the governing sagging and hogging moments;
 *   - Vu at d from the support face (the critical section the design reads, `tCritShear`);
 *   - Tu, the largest torsion;
 *   - the slab's load on the beam: what the beam carries between its two end nodes,
 *     V(0) − V(L), less its own weight, 1,2 · 25 kN/m³ · 0,10 m² · L.
 *
 * That load is the FORCES the shells put on the beam's nodes, and on the coarse meshes it is not
 * all they put there: the slab shares each node's rotation with the beam and hands it couples
 * too (the moment jumps between pieces). V4 at 1 m (40 × 40 columns, 1,2D + 1,6L): forces 68,7 kN,
 * couples 31,2 and 8,9 kN·m at 1 and 2 m from its end; by statics the forces alone give 6,9 kN·m at
 * midspan against the 46,9 the stations read, and the couples close it. The couples vanish as the
 * mesh is refined (Σ|ΔM| 80 / 22 / 1,6 kN·m at 1 / 0,5 / 0,25 m) and the load arrives as force
 * (68,7 → 204,8 kN), so V4's midspan moment barely moves (46,9 → 49,6 kN·m) while the force it
 * takes triples; its end shear (41,9 → 109,9 kN) and its hogging moment (50,5 → 77,2 kN·m) do not
 * hold. The load path itself is read in `design-span-load-path.test.ts`.
 *
 * Measured (level P1; kN, kN·m), at 6 / 2 / 1 / 0,5 / 0,25 m:
 *
 *   V2-1 (6 m, edge)    Mu+  5,8 / 28,6 / 33,2 / 34,2 / 34,2   Mu− 10,0 / 24,1 / 48,5 / 56,0 / 56,9
 *                       Vu,d 8,4 /  8,6 / 25,8 / 38,3 / 40,8   Tu 0,01 / 5,65 / 7,56 / 8,58 / 9,08
 *                       slab 0,0 /  1,1 / 33,9 / 58,0 / 61,7
 *   V4 (5 m, interior)  Mu+  5,1 / 57,4 / 59,6 / 62,5 / 62,6   Mu−  5,8 /  3,4 / 32,8 / 53,2 / 56,7
 *                       Vu,d 6,6 /  9,7 / 37,4 / 57,5 / 70,3   slab 0,0 / 8,0 / 63,5 / 150,5 / 185,4
 *   floor: slab load reaching the beams, of 570 kN: 0 / 19 / 260 / 492 / 553 (0 / 3 / 46 / 86 / 97 %)
 *
 * ── What converges and how fast ─────────────────────────────────────
 *
 * The shells are bilinear: the displacements converge as h², the moments recovered from them as
 * h, the node forces the shells hand the beams as h² (they are the stiffness times the
 * displacements). Halving h should then shrink each step at least by half (rate p ≥ 1) for the
 * moments and the load, and that is what is asserted between 1, 0,5 and 0,25 m — a property of
 * the convergence, not a margin around a measured value. Measured, the floor's deficit shrinks
 * by 4,0 and then 4,6 per halving (p ≈ 2), the moments' steps by 5 to 30, the slab load of the
 * interior beams V4 and V9 by 2,5 (p ≈ 1,3), the others' by 4 or more.
 *
 * Vu at d and Tu converge slower, and only their monotone convergence is asserted: the slab is
 * held at each column by one node, a point support of a plate, around which the plate's solution
 * is singular and the theory gives no rate. The shear near the interior beams' columns converges
 * at p ≈ 0,65 (V4: steps 20,1 and 12,8 kN): at 0,25 m it is still ~25 % short of its limit. The
 * torsion, the slab's edge moment, at p ≈ 1.
 *
 * ── Which meshes are outside ────────────────────────────────────────
 *
 * A mesh is in the converged range when halving it shrinks the next step at least by half. At
 * 6 m a bay is one shell whose corners are the columns: no slab load can reach a beam, which has
 * no node between its columns (asserted exactly), and nothing rotates the beam along its length,
 * so it carries its own weight and no torsion. At 2 m the beams take 3 % of the slab's load and
 * the step to 1 m is as large as the step after it (240 then 232 kN): outside. 1 m and finer
 * are inside.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore } from '..';
import { verificationStore } from '../verification.svelte';
import { designRunStore } from '../design-run.svelte';
import * as wasmSolver from '../../engine/wasm-solver';
import { building, designPlace, physicalBeams } from './span-fixture';
import type { MemberContext } from '../../engine/design/member-context';
import type { StationForces } from '../../engine/station-design-forces';
import '../../engine/design/adapters/cirsoc201-adapter';
import '../../engine/design/adapters/unsupported-adapter';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const PRINT = !!process.env.SPAN_TRACE_PRINT;
const MESHES = [6, 2, 1, 0.5, 0.25] as const;
/** The fixture's slab and beam: 0,15 m of 25 kN/m³ plus 1,5 kPa dead, 2 kPa live; 0,10 m² beams. */
const SLAB_FACTORED = 1.2 * (25 * 0.15 + 1.5) + 1.6 * 2;
const BEAM_FACTORED = 1.2 * 25 * 0.1;
const COMBO = '1.2D + 1.6L';

interface SpanForces {
  /** «V2-1»: the physical beam and the member's place along it. */
  label: string;
  level: number;
  sag: number;
  hog: number;
  /** Vu at d from the face, the larger end, kN. */
  vd: number;
  tu: number;
  /** The slab's load on the beam under 1,2D + 1,6L, kN. */
  slab: number;
}

interface MeshForces { spans: Map<string, SpanForces>; /** Σ slab load on each level's beams, and the slab's total. */ floors: Map<number, { beams: number; slab: number }> }

/** V at a position along the member, linear between the stations around it. */
function shearAt(st: readonly StationForces[], key: 'vy' | 'vz', t: number): number {
  let k = st.findIndex((s) => s.t >= t);
  if (k <= 0) k = 1;
  const a = st[k - 1]!, b = st[k]!;
  const w = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return a[key] + w * (b[key] - a[key]);
}

function forcesAt(mesh: number): MeshForces {
  building(mesh);
  expect(designRunStore.computeDemands().ok).toBe(true);
  const nameOf = new Map<number, string>();
  for (const b of physicalBeams()) for (const id of b.elements) nameOf.set(id, b.name);
  const members = new Map<string, MemberContext>();
  for (const c of verificationStore.contexts.values()) if (c.elementType === 'beam') members.set(designPlace(c), c);
  // Each physical beam's members in order along it, from the one nearest the origin.
  const byBeam = new Map<string, string[]>();
  for (const [place, c] of members) byBeam.set(nameOf.get(c.elementId)!, [...(byBeam.get(nameOf.get(c.elementId)!) ?? []), place]);
  const spans = new Map<string, SpanForces>();
  for (const [name, places] of byBeam) {
    places.sort().forEach((place, k) => {
      const c = members.get(place)!;
      const st = c.stations!, cs = c.criticalSections!;
      const V = c.axes.shear.toLowerCase() as 'vy' | 'vz';
      const demand = (cat: string) => Math.abs(c.demands?.demands.find((d) => d.category === cat)?.value ?? 0);
      const combo = st.comboResults.find((r) => r.comboName === COMBO);
      expect(combo, `${COMBO} on ${name}`).toBeTruthy();
      const s = combo!.stations;
      spans.set(`${name}-${k + 1}`, {
        label: `${name}-${k + 1}`, level: Number(place.split('>')[0]!.split(',')[2]),
        sag: demand(c.axes.sagCategory), hog: demand(c.axes.hogCategory),
        vd: Math.max(...st.comboResults.flatMap((r) => [cs.start.tCritShear, 1 - cs.end.tCritShear].map((t) => Math.abs(shearAt(r.stations, V, t))))),
        tu: Math.max(...st.comboResults.flatMap((r) => r.stations.map((x) => Math.abs(x.torsion)))),
        slab: Math.abs(s[0]![V] - s[s.length - 1]![V]) - BEAM_FACTORED * c.L,
      });
    });
  }
  const floors = new Map<number, { beams: number; slab: number }>();
  for (const sp of spans.values()) {
    const f = floors.get(sp.level) ?? { beams: 0, slab: 0 };
    f.beams += sp.slab;
    floors.set(sp.level, f);
  }
  for (const q of modelStore.quads.values()) {
    const p = q.nodes.map((id) => modelStore.nodes.get(id)!);
    // A plane quad's area: half the cross product of its diagonals.
    const d1 = { x: p[2]!.x - p[0]!.x, y: p[2]!.y - p[0]!.y }, d2 = { x: p[3]!.x - p[1]!.x, y: p[3]!.y - p[1]!.y };
    floors.get(p[0]!.z ?? 0)!.slab += Math.abs(d1.x * d2.y - d1.y * d2.x) / 2 * SLAB_FACTORED;
  }
  return { spans, floors };
}

describe('the beams\' design forces as the slab mesh is refined from 6 m to 0,25 m', () => {
  const f = new Map<number, MeshForces>();
  beforeAll(() => {
    for (const m of MESHES) f.set(m, forcesAt(m));
    if (!PRINT) return;
    const r = (v: number) => v.toFixed(1);
    for (const label of [...f.get(1)!.spans.keys()].sort()) {
      const row = (k: keyof Omit<SpanForces, 'label' | 'level'>) => MESHES.map((m) => r(f.get(m)!.spans.get(label)![k])).join(' / ');
      console.log(`${label}: Mu+ ${row('sag')} | Mu− ${row('hog')} | Vu,d ${row('vd')} | Tu ${row('tu')} | slab ${row('slab')}`);
    }
    for (const level of f.get(1)!.floors.keys()) {
      console.log(`level ${level}: slab ${r(f.get(1)!.floors.get(level)!.slab)} kN, on the beams ` + MESHES.map((m) => r(f.get(m)!.floors.get(level)!.beams)).join(' / '));
    }
  }, 300_000);

  const at = (m: number, label: string) => f.get(m)!.spans.get(label)!;
  const labels = () => [...f.get(1)!.spans.keys()];

  it('reads the same fourteen design members on every mesh', () => {
    for (const m of MESHES) expect([...f.get(m)!.spans.keys()].sort(), `mesh ${m}`).toEqual(labels().sort());
    expect(labels()).toHaveLength(14);
  });

  it('6 m is outside: no slab load reaches a beam, which has no node between its columns', () => {
    for (const s of f.get(6)!.spans.values()) expect(Math.abs(s.slab), s.label).toBeLessThan(1e-6);
  });

  it('the slab load reaching the beams converges from 1 m down, and 2 m is outside that range', () => {
    for (const level of f.get(1)!.floors.keys()) {
      const deficit = (m: number) => f.get(m)!.floors.get(level)!.slab - f.get(m)!.floors.get(level)!.beams;
      // The slab's load is the same on every mesh (the quads tile the same floor).
      for (const m of MESHES) expect(f.get(m)!.floors.get(level)!.slab).toBeCloseTo(570, 6);
      const step = (h: number) => deficit(h) - deficit(h / 2);
      // In the converged range a halving shrinks the next step at least by half (p ≥ 1; the
      // bilinear shell gives p = 2). 1 m and 0,5 m are; 2 m is not.
      expect(step(1) / step(0.5), `level ${level}: 1 → 0,5 → 0,25 m`).toBeGreaterThanOrEqual(2);
      expect(step(2) / step(1), `level ${level}: 2 → 1 → 0,5 m`).toBeLessThan(2);
      for (const m of [2, 1, 0.5]) expect(step(m), `level ${level} at ${m} m`).toBeGreaterThan(0);
    }
  });

  it('the moments and each beam\'s slab load converge at p ≥ 1 between 1, 0,5 and 0,25 m', () => {
    for (const label of labels()) for (const k of ['sag', 'hog', 'slab'] as const) {
      const coarse = Math.abs(at(0.5, label)[k] - at(1, label)[k]);
      const fine = Math.abs(at(0.25, label)[k] - at(0.5, label)[k]);
      expect(fine, `${label} ${k}: ${at(1, label)[k]} / ${at(0.5, label)[k]} / ${at(0.25, label)[k]}`).toBeLessThanOrEqual(coarse / 2);
    }
  });

  it('Vu at d and Tu converge monotonically between 1, 0,5 and 0,25 m', () => {
    for (const label of labels()) for (const k of ['vd', 'tu'] as const) {
      const q = [1, 0.5, 0.25].map((m) => at(m, label)[k]);
      // V4 and V9 sit on the symmetry plane x = 6 m: no torsion on any mesh.
      if (k === 'tu' && q.every((v) => v < 0.01)) continue;
      const msg = `${label} ${k}: ${q.join(' / ')}`;
      expect(q[1]! - q[0]!, msg).toBeGreaterThan(0);
      expect(q[2]! - q[1]!, msg).toBeGreaterThan(0);
      expect(q[2]! - q[1]!, msg).toBeLessThan(q[1]! - q[0]!);
    }
  });
});
