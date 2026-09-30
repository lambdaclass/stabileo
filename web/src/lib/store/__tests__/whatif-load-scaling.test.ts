/**
 * Explore's load sliders on every load type the model defines.
 *
 * The analysis is linear, so all loads × k must give displacements,
 * reactions and member forces × k, and one slider must move the response
 * along a straight line: r(k) = r(1) + (k − 1)·(r(2) − r(1)). A load type the
 * slider skipped (a 2D point moment on a member, a 3D point load on a member)
 * broke both. Settlements are support properties, not loads: the sliders
 * leave them alone, and the response is affine in k instead of proportional.
 * Closing Explore gives back the model exactly as it was.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { historyStore, modelStore, uiStore } from '..';
import { whatIf } from '../whatif.svelte';
import type { Load } from '../model.svelte';

type Vec = Map<string, number>;

const DISP = /^(ux|uy|uz|rx|ry|rz)$/;
const REACT = /^(rx|rz|my|fx|fy|fz|mx|mz)$/;
const FORCE = /^(n|v|vy|vz|m|mx|my|mz)(Start|End)$/;
const QUAD = /^(sigmaXx|sigmaYy|tauXy|mx|my|mxy)$/;

/** Every linear response quantity of a solve, keyed by group, entity and field. */
function flatten(r: unknown): Vec {
  const out: Vec = new Map();
  const res = r as Record<string, Array<Record<string, unknown>> | undefined>;
  const take = (group: string, rows: Array<Record<string, unknown>> | undefined, idKey: string, re: RegExp) => {
    for (const row of rows ?? []) {
      for (const [k, v] of Object.entries(row)) {
        if (typeof v === 'number' && re.test(k)) out.set(`${group}:${row[idKey]}:${k}`, v);
      }
    }
  };
  take('u', res.displacements, 'nodeId', DISP);
  take('R', res.reactions, 'nodeId', REACT);
  take('F', res.elementForces, 'elementId', FORCE);
  take('Q', res.quadStresses, 'elementId', QUAD);
  return out;
}

const groupOf = (key: string) => key.split(':')[0];

/** Largest mismatch of `got` against `want`, relative to the largest value of each group. */
function mismatch(got: Vec, want: Vec): number {
  const scale = new Map<string, number>();
  for (const [k, v] of want) scale.set(groupOf(k), Math.max(scale.get(groupOf(k)) ?? 0, Math.abs(v)));
  let worst = 0;
  expect([...got.keys()].sort()).toEqual([...want.keys()].sort());
  for (const [k, w] of want) {
    const s = scale.get(groupOf(k)) || 1;
    worst = Math.max(worst, Math.abs((got.get(k) ?? NaN) - w) / s);
  }
  return worst;
}

const lin = (a: Vec, ka: number, b?: Vec, kb = 0): Vec =>
  new Map([...a].map(([k, v]) => [k, ka * v + kb * (b?.get(k) ?? 0)]));

const maxAbs = (v: Vec) => Math.max(0, ...[...v.values()].map(Math.abs));

const flush = () => vi.advanceTimersByTime(200);
const setAll = (k: number) => { whatIf.loadFactors.forEach((_, i) => whatIf.setLoadFactor(i, k)); flush(); };

let solve: () => Vec;

beforeEach(() => {
  whatIf.abandon();
  historyStore.clear();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(async () => {
  whatIf.abandon();
  vi.clearAllTimers();
  vi.useRealTimers();
  uiStore.analysisMode = '2d';
  modelStore.clear();
});

/** The proofs every model goes through; `types` are the load types it must hold. */
function proveLinear(types: Load['type'][]) {
  it('holds every load type it is meant to', () => {
    expect(new Set(modelStore.model.loads.map((l) => l.type))).toEqual(new Set(types));
  });

  it.each([2.5, 0.4, -1.5])('all loads × %s → displacements, reactions and member forces × k', (k) => {
    const base = solve();
    expect(maxAbs(base)).toBeGreaterThan(0);
    whatIf.open();
    setAll(k);
    expect(mismatch(solve(), lin(base, k))).toBeLessThan(1e-9);
  });

  it('each slider moves the response, along a straight line', () => {
    const n = modelStore.model.loads.length;
    const base = solve();
    whatIf.open();
    for (let i = 0; i < n; i++) {
      whatIf.setLoadFactor(i, 2); flush();
      const r2 = solve();
      whatIf.setLoadFactor(i, 3.5); flush();
      const r35 = solve();
      whatIf.setLoadFactor(i, 1); flush();
      const delta = lin(r2, 1, base, -1);
      // The slider does something: this load's own response is not zero.
      expect(maxAbs(delta), `load ${i} (${modelStore.model.loads[i].type})`).toBeGreaterThan(1e-9 * maxAbs(base));
      expect(mismatch(r35, lin(base, 1, delta, 2.5)), `load ${i} (${modelStore.model.loads[i].type})`).toBeLessThan(1e-9);
    }
  });

  it('scales every magnitude field of every load, and nothing else', () => {
    whatIf.open();
    // The baseline as Explore rebuilds it (restore() writes the canonical fz/my of a legacy load).
    setAll(1);
    const before = structuredClone(modelStore.model.loads.map((l) => ({ type: l.type, data: { ...l.data } })));
    setAll(3);
    const after = modelStore.model.loads;
    const positions = new Set(['id', 'nodeId', 'elementId', 'quadId', 'caseId', 'a', 'b', 'angle', 'isGlobal']);
    for (let i = 0; i < before.length; i++) {
      const b = before[i].data as unknown as Record<string, unknown>;
      const a = after[i].data as unknown as Record<string, unknown>;
      expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
      for (const [k, v] of Object.entries(b)) {
        if (positions.has(k) || typeof v !== 'number') expect(a[k], `${before[i].type}.${k}`).toEqual(v);
        else expect(a[k], `${before[i].type}.${k}`).toBeCloseTo(3 * v, 12);
      }
    }
  });

  it('closing Explore restores the model exactly', async () => {
    const snap = structuredClone(modelStore.snapshot());
    const base = solve();
    whatIf.open();
    whatIf.loadFactors.forEach((_, i) => whatIf.setLoadFactor(i, 1 + 0.3 * (i + 1)));
    whatIf.setAll('e', 2);
    flush();
    uiStore.liveCalc = true; // so close() does not start a solve of its own
    await whatIf.close();
    expect(modelStore.snapshot()).toEqual(snap);
    expect(mismatch(solve(), base)).toBeLessThan(1e-12);
  });
}

describe('2D: every plane load type', () => {
  beforeEach(() => {
    uiStore.analysisMode = '2d';
    modelStore.clear();
    solve = () => {
      const r = modelStore.solve();
      if (!r || typeof r === 'string') throw new Error(String(r));
      return flatten(r);
    };
    // A portal fixed at one foot and pinned at the other: indeterminate, so the
    // temperature load makes forces too.
    const n0 = modelStore.addNode(0, 0), n1 = modelStore.addNode(0, 4), n2 = modelStore.addNode(6, 4), n3 = modelStore.addNode(6, 0);
    const c1 = modelStore.addElement(n0, n1), beam = modelStore.addElement(n1, n2), c2 = modelStore.addElement(n2, n3);
    modelStore.addSupport(n0, 'fixed');
    modelStore.addSupport(n3, 'pinned');
    modelStore.addNodalLoad(n1, 8, -5, 3);
    // A nodal load written with the legacy aliases only (older files).
    modelStore.addLoadEntry({ type: 'nodal', data: { id: 0, nodeId: n2, fx: 0, fy: -7, mz: 2 } as never });
    modelStore.addDistributedLoad(beam, -12, -6, 20, true, undefined, 0.5, 5);
    modelStore.addPointLoadOnElement(beam, 2, -10, { px: 4, my: 20 });
    modelStore.addPointLoadOnElement(c1, 1.5, 3, { mz: -6 }); // legacy moment alias
    modelStore.addPointLoadOnElement(c2, 2, 0, { my: 15 }); // a point moment alone
    modelStore.addThermalLoad(beam, 25, 10);
  });

  proveLinear(['nodal', 'distributed', 'pointOnElement', 'thermal']);

  // The audit's case: a 20 kN·m point moment on a simply supported beam.
  it('a point moment on a member scales with its slider', () => {
    modelStore.clear();
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 0);
    const e = modelStore.addElement(a, b);
    modelStore.addSupport(a, 'pinned');
    modelStore.addSupport(b, 'rollerX');
    modelStore.addPointLoadOnElement(e, 2, 0, { my: 20 });
    const rz = () => (modelStore.solve() as { reactions: Array<{ rz: number }> }).reactions.map((r) => Math.abs(r.rz));
    expect(rz()[0]).toBeCloseTo(20 / 6, 9);
    whatIf.open();
    whatIf.setLoadFactor(0, 2); flush();
    expect(rz()[0]).toBeCloseTo(40 / 6, 9);
  });

  it('a settlement is not a load: the sliders leave it, and the response is affine in k', () => {
    const supportId = [...modelStore.supports.values()].find((s) => s.type === 'pinned')!.id;
    modelStore.updateSupport(supportId, { dz: -0.01 });
    const settled = structuredClone(modelStore.supports.get(supportId));
    const base = solve();
    whatIf.open();
    setAll(2);
    const r2 = solve();
    expect(modelStore.supports.get(supportId)).toEqual(settled);
    setAll(4);
    const r4 = solve();
    // r(k) = r_settlement + k·r_loads, so r(4) − r(2) = 2·(r(2) − r(1)), and r(2) ≠ 2·r(1).
    expect(mismatch(r4, lin(r2, 3, base, -2))).toBeLessThan(1e-9);
    expect(mismatch(r2, lin(base, 2))).toBeGreaterThan(1e-6);
  });
});

function build3D(shells: boolean) {
  historyStore.clear();
  uiStore.analysisMode = shells ? 'pro' : '3d';
  modelStore.clear();
  uiStore.viewportPresentation3D = 'native3d';
  // Quads reach the solver in PRO only.
  solve = () => {
    const r = modelStore.solve3D(false, false, shells);
    if (!r || typeof r === 'string') throw new Error(String(r));
    return flatten(r);
  };
  const mat = modelStore.addMaterial({ name: 'H-25', e: 30000, nu: 0.2, rho: 25 });
  // A 2 × 2 bay on four columns, edge beams, a cantilever and (in PRO) a slab of quads.
  const h = 2, z0 = 3;
  const grid: number[][] = [];
  for (let i = 0; i <= 2; i++) { grid.push([]); for (let j = 0; j <= 2; j++) grid[i].push(modelStore.addNode(i * h, j * h, z0)); }
  const cols: number[] = [];
  for (const [i, j] of [[0, 0], [2, 0], [2, 2], [0, 2]]) {
    const foot = modelStore.addNode(i * h, j * h, 0);
    cols.push(modelStore.addElement(foot, grid[i][j]));
    modelStore.addSupport(foot, 'fixed3d');
  }
  const beams: number[] = [];
  for (let i = 0; i < 2; i++) for (const j of [0, 2]) beams.push(modelStore.addElement(grid[i][j], grid[i + 1][j]));
  for (let j = 0; j < 2; j++) for (const i of [0, 2]) beams.push(modelStore.addElement(grid[i][j], grid[i][j + 1]));
  // Inner nodes: a cross of beams (Basic) or the slab (PRO) holds them.
  beams.push(modelStore.addElement(grid[1][0], grid[1][1]), modelStore.addElement(grid[1][1], grid[1][2]));
  beams.push(modelStore.addElement(grid[0][1], grid[1][1]), modelStore.addElement(grid[1][1], grid[2][1]));
  const tip = modelStore.addNode(2 * h + 2, 2 * h, z0);
  const cant = modelStore.addElement(grid[2][2], tip);

  modelStore.addNodalLoad3D(tip, 1, -2, -5, 0.5, 1.5, -0.7);
  modelStore.addNodalLoad3D(grid[1][1], 0, 0, -8, 0, 0, 0);
  modelStore.addDistributedLoad3D(beams[0], -4, -2, 1, 3);
  modelStore.addDistributedLoad3D(beams[1], -3, -3, 0, 0, 0.5, 1.5);
  modelStore.addPointLoadOnElement3D(cant, 1.2, -6, 2);
  modelStore.addPointLoadOnElement3D(cols[1], 2, 0, 3);
  // The plane load types, which a 3D model built from a 2D one keeps.
  modelStore.addNodalLoad(grid[0][2], 2, -3, 1);
  modelStore.addDistributedLoad(cant, -5);
  modelStore.addPointLoadOnElement(beams[2], 1, -4, { px: 2, my: 5 });
  modelStore.addThermalLoad(cols[2], 20, 6);
  if (shells) {
    const quads: number[] = [];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      quads.push(modelStore.addQuad([grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]], mat, 0.2));
    }
    modelStore.addSurfaceLoad3D(quads[0], 4);
    modelStore.addSurfaceLoad3D(quads[3], -1.5);
    modelStore.addThermalLoadQuad3D(quads[1], 15, 8);
  }
}

const SPACE_AND_PLANE: Load['type'][] = ['nodal3d', 'distributed3d', 'pointOnElement3d', 'nodal', 'distributed', 'pointOnElement', 'thermal'];

describe('Basic 3D: every member load type, space and plane', () => {
  beforeEach(() => build3D(false));
  proveLinear(SPACE_AND_PLANE);

  // The audit's case: a point load on a cantilever, slider × 2.
  it('a point load on a member scales with its slider', () => {
    modelStore.clear();
    uiStore.viewportPresentation3D = 'native3d';
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(5, 0, 0);
    const e = modelStore.addElement(a, b);
    modelStore.addSupport(a, 'fixed3d');
    modelStore.addPointLoadOnElement3D(e, 3, 0, -10);
    const base = solve();
    whatIf.open();
    whatIf.setLoadFactor(0, 2); flush();
    expect(mismatch(solve(), lin(base, 2))).toBeLessThan(1e-9);
  });
});

describe('PRO 3D: the shell load types too', () => {
  beforeEach(() => build3D(true));
  proveLinear([...SPACE_AND_PLANE, 'surface3d', 'thermalQuad3d']);
});
