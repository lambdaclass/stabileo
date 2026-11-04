/**
 * A circular and an L column designed in a frame: each gets bars around its own outline and ties,
 * and verifies through the general section.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '../../../store';
import { designRunStore } from '../../../store/design-run.svelte';
import { verificationStore } from '../../../store/verification.svelte';
import * as wasmSolver from '../../wasm-solver';
import { shapedBarPositions } from '../shaped-column';
import { stateSuiteLateral } from '../../../store/__tests__/suite-lateral';

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

function portal(colSec: Record<string, unknown>, load: [number, number, number] = [20, 10, -400]) {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
  // The reading of the beam's role in the lateral system this suite was written under (`suite-lateral.ts`).
  stateSuiteLateral();
  const mat = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
  const col = modelStore.addSection(colSec as never);
  const beam = modelStore.addSection({ name: '25×50', a: 0.125, iy: 0.0026, iz: 0.00065, j: 0.0017, b: 0.25, h: 0.5, shape: 'rect' } as never);
  const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(0, 0, 3), modelStore.addNode(5, 0, 3), modelStore.addNode(5, 0, 0)];
  modelStore.addSupport(n[0]!, 'fixed3d' as never); modelStore.addSupport(n[3]!, 'fixed3d' as never);
  const cols = [[0, 1], [3, 2]].map(([a, b]) => { const c = modelStore.addElement(n[a!]!, n[b!]!, 'frame'); modelStore.updateElementMaterial(c, mat); modelStore.updateElementSection(c, col); return c; });
  const bm = modelStore.addElement(n[1]!, n[2]!, 'frame'); modelStore.updateElementMaterial(bm, mat); modelStore.updateElementSection(bm, beam);
  modelStore.addDistributedLoad3D(bm, 0, 0, -40, -40, undefined, undefined, 1);
  modelStore.addNodalLoad3D(n[1]!, load[0], load[1], load[2], 0, 0, 0, 1);
  const combo = modelStore.solveCombinations3D(false, false, true);
  if (!combo || typeof combo === 'string') throw new Error(String(combo));
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
  expect(designRunStore.computeDemands().ok).toBe(true);
  expect(designRunStore.autoDesign(cols).ok).toBe(true);
  return cols;
}

describe('shaped columns designed', () => {
  it('a circular column', () => {
    const D = 0.45, I = Math.PI * D ** 4 / 64;
    for (const id of portal({ name: 'Ø45', a: Math.PI * D * D / 4, iy: I, iz: I, j: 2 * I, h: D, shape: 'CHS' })) {
      expect(verificationStore.contextFor(id)?.shape).toEqual({ kind: 'circle', D });
      const o = verificationStore.outcomeFor(id);
      expect(o?.outcome, JSON.stringify(o?.reasons)).toBe('VERIFIED');
      const r = modelStore.elements.get(id)!.reinforcement!;
      expect(r.shaped?.count).toBeGreaterThanOrEqual(6);
      expect(verificationStore.providedFor(id)!.checks.some((c) => c.category === 'Biaxial P-M (circular section)')).toBe(true);
    }
  });

  it('the detailing puts a circular column\'s bars on a ring and its ties on circles', async () => {
    const D = 0.45, I = Math.PI * D ** 4 / 64;
    const [c1] = portal({ name: 'Ø45', a: Math.PI * D * D / 4, iy: I, iz: I, j: 2 * I, h: D, shape: 'CHS' });
    const { detailingStore } = await import('../../../store/detailing.svelte');
    const res = detailingStore.generate()!;
    const bars = res.assemblies.flatMap((a) => a.bars).filter((b) => b.ownerElementIds.includes(c1!));
    const longs = bars.filter((b) => b.role === 'longitudinal');
    const n = modelStore.elements.get(c1!)!.reinforcement!.shaped!.count;
    expect(longs.length).toBeGreaterThanOrEqual(n);
    // Every longitudinal bar at R = D/2 − cover − tie − db/2 from the column axis, the tie the design chose.
    const r = modelStore.elements.get(c1!)!.reinforcement!;
    const ctx = verificationStore.contextFor(c1!)!;
    const R = D / 2 - ctx.material.cover - r.stirrups!.diameter / 1000 - r.shaped!.diameter / 2000;
    for (const b of longs.slice(0, n)) expect(Math.hypot(b.segments[0]!.start.x, b.segments[0]!.start.y)).toBeCloseTo(R, 6);
    const hoops = bars.filter((b) => b.id.includes('-hoop'));
    expect(hoops.length).toBeGreaterThan(5);
    const Rt = D / 2 - ctx.material.cover - r.stirrups!.diameter / 2000;
    expect(Math.hypot(hoops[0]!.segments[0]!.start.x, hoops[0]!.segments[0]!.start.y)).toBeCloseTo(Rt, 6);
  });

  /*
   * A spiral, by hand, at the axial load the check reports: the circle's Whitney block on the
   * circular segment (closed form), each bar εs = 0,003·(c − ds)/c, fs within ±fy, the displaced
   * concrete taken out; c where φ·Pn = Pu, φ by Tabla 21.2.2 (a)/(c)/(e): 0,75 up to εty,
   * 0,75 + 0,15·(εt − εty)/0,003, 0,90 from εty + 0,003. Pn,max = 0,85·Po (Tabla 22.4.2.1 (b)).
   * The 2005 spiral φ, 0,70, misses it by about 7 % where the section is compression-controlled.
   */
  it('a circular column with a spiral takes the 2025 spiral φ', async () => {
    const D = 0.45, R = D / 2, I = Math.PI * D ** 4 / 64;
    const cols = portal({ name: 'Ø45', a: Math.PI * D * D / 4, iy: I, iz: I, j: 2 * I, h: D, shape: 'CHS' }, [20, 0, -1600]);
    const { setShapedBars } = await import('../../../store/rebar-edit');
    for (const id of cols) {
      setShapedBars(id, { count: 8, diameter: 16, spiral: { diameter: 10, pitch: 0.06 } });
      const ctx = verificationStore.contextFor(id)!;
      const pm = verificationStore.providedFor(id)!.checks.find((c) => c.category === 'Biaxial P-M (circular section)')!;
      const Pu = Number(/Pu=(-?\d+) kN/.exec(pm.description)![1]);
      const { fc, fy, cover } = ctx.material;
      const a16 = Math.PI * 0.016 ** 2 / 4, Es = 200000, ecu = 0.003, b1 = 0.85, ety = fy / Es;
      const pts = shapedBarPositions({ kind: 'circle', D }, 8, 16, cover, 10);
      const seg = (a: number) => {
        const t = 2 * Math.acos(Math.max(-1, Math.min(1, (R - a) / R)));
        const A = (R * R / 2) * (t - Math.sin(t));
        return { A, yc: A > 0 ? (4 * R * Math.sin(t / 2) ** 3) / (3 * (t - Math.sin(t))) : R };
      };
      const state = (c: number) => {
        const s = seg(Math.min(b1 * c, D));
        let N = 0.85 * fc * 1000 * s.A, M = 0.85 * fc * 1000 * s.A * s.yc, et = 0;
        for (const p of pts) {
          const eps = ecu * (c - (R - p.y)) / c;
          const f = Math.max(-fy, Math.min(fy, Es * eps)) * 1000 - (eps > 0 && R - p.y < b1 * c ? 0.85 * fc * 1000 : 0);
          N += a16 * f; M += a16 * f * p.y; et = Math.max(et, -eps);
        }
        const phi = et <= ety ? 0.75 : et >= ety + 0.003 ? 0.9 : 0.75 + 0.15 * (et - ety) / 0.003;
        return { phiN: phi * N, phiM: phi * M, phi };
      };
      const Ag = Math.PI * D * D / 4, P0 = 0.85 * fc * 1000 * (Ag - 8 * a16) + fy * 1000 * 8 * a16;
      expect(Pu).toBeLessThan(0.75 * 0.85 * P0);
      let lo = 0.01, hi = 3 * D;
      for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (state(mid).phiN > Pu) hi = mid; else lo = mid; }
      const hand = state((lo + hi) / 2);
      expect(pm.capacity! / hand.phiM).toBeGreaterThan(0.99);
      expect(pm.capacity! / hand.phiM).toBeLessThan(1.01);
    }
  });

  it('an L column', () => {
    for (const id of portal({ name: 'L 50×50×20', a: 0.5 * 0.2 + 0.2 * 0.3, iy: 0.0035, iz: 0.0035, j: 0.001, b: 0.5, h: 0.5, tw: 0.2, tf: 0.2, shape: 'L' })) {
      expect(verificationStore.contextFor(id)?.shape?.kind).toBe('L');
      const o = verificationStore.outcomeFor(id);
      expect(o?.outcome, JSON.stringify(o?.reasons)).toBe('VERIFIED');
      expect(modelStore.elements.get(id)!.reinforcement!.shaped!.count).toBeGreaterThanOrEqual(6);
    }
  });
});
