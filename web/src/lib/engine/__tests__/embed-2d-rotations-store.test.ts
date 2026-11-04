/**
 * A flat plane model solved through the space solver (`shouldEmbedFlat2DModelIn3D`: the model
 * stands in X–Z, (x, y) → (x, 0, y)) must give the plane solve's answer. Standing the plane in X–Z
 * is a reflection of the drawn X–Y one: the plane rotation θ, counter-clockwise as drawn, is a
 * rotation about −Y there (docs/solver/assembly-constraints.md §2.3, AC-15). So every quantity that
 * carries a rotation or a moment changes sign on the way in, and the space results read
 *   ux = ux₂, uz = uz₂, θy = −θ₂,   Fx = Rx₂, Fz = Rz₂, My = −M₂.
 *
 * Through the real path: the model store, `buildSolverInput3D` / `buildSolverInput2D`, the WASM
 * engine. Each load or support that carries a rotation or a moment is checked on its own.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import '../../store/index';
import { initSolver } from '../wasm-solver';
import type { AnalysisResults } from '../types';
import type { AnalysisResults3D } from '../types-3d';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); });

function solveBoth(): { r2: AnalysisResults; r3: AnalysisResults3D } {
  const r2 = modelStore.solve(false);
  if (!r2 || typeof r2 === 'string') throw new Error(`2D: ${String(r2)}`);
  // The embedding is what this is about: make sure it is the path taken.
  const input = modelStore.buildSolverInput3D(false, false);
  expect(input, 'space input').toBeTruthy();
  for (const n of input!.nodes.values()) expect(n.y, 'node stands in X–Z').toBe(0);
  const r3 = modelStore.solve3D(false, false, false);
  if (!r3 || typeof r3 === 'string') throw new Error(`3D: ${String(r3)}`);
  return { r2, r3 };
}

function expectSameAnswer(r2: AnalysisResults, r3: AnalysisResults3D, what: string): void {
  const tol = (a: number, b: number) => 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  let moved = 0;
  for (const d2 of r2.displacements) {
    const d3 = r3.displacements.find((d) => d.nodeId === d2.nodeId)!;
    expect(Math.abs(d3.ux - d2.ux), `${what}: ux node ${d2.nodeId} (${d3.ux} vs ${d2.ux})`).toBeLessThan(tol(d3.ux, d2.ux) * 1e3);
    expect(Math.abs(d3.uz - d2.uz), `${what}: uz node ${d2.nodeId} (${d3.uz} vs ${d2.uz})`).toBeLessThan(tol(d3.uz, d2.uz) * 1e3);
    expect(Math.abs(-d3.ry - d2.ry), `${what}: θ node ${d2.nodeId} (−θy ${-d3.ry} vs θ ${d2.ry})`).toBeLessThan(tol(d3.ry, d2.ry) * 1e3);
    moved += Math.abs(d2.ux) + Math.abs(d2.uz) + Math.abs(d2.ry);
  }
  expect(moved, `${what}: the model moves`).toBeGreaterThan(1e-8);
  for (const q2 of r2.reactions) {
    const q3 = r3.reactions.find((q) => q.nodeId === q2.nodeId)!;
    expect(Math.abs(q3.fx - q2.rx), `${what}: Rx node ${q2.nodeId} (${q3.fx} vs ${q2.rx})`).toBeLessThan(1e-6 * Math.max(1, Math.abs(q2.rx)));
    expect(Math.abs(q3.fz - q2.rz), `${what}: Rz node ${q2.nodeId} (${q3.fz} vs ${q2.rz})`).toBeLessThan(1e-6 * Math.max(1, Math.abs(q2.rz)));
    expect(Math.abs(-q3.my - q2.my), `${what}: M node ${q2.nodeId} (−My ${-q3.my} vs M ${q2.my})`).toBeLessThan(1e-6 * Math.max(1, Math.abs(q2.my)));
  }
}

/** A two-span beam along X: 1 (0, 0) — 2 (3, 0) — 3 (6, 0). */
function beam(): [number, number, number] {
  const n1 = modelStore.addNode(0, 0), n2 = modelStore.addNode(3, 0), n3 = modelStore.addNode(6, 0);
  modelStore.addElement(n1, n2, 'frame');
  modelStore.addElement(n2, n3, 'frame');
  return [n1, n2, n3];
}

describe('flat plane model through the space solver: rotations and moments', () => {
  it('a nodal moment', () => {
    const [n1, n2, n3] = beam();
    modelStore.addSupport(n1, 'fixed');
    modelStore.addSupport(n3, 'rollerX');
    modelStore.addNodalLoad(n2, 0, 0, 10);
    const { r2, r3 } = solveBoth();
    // The plane answer: a counter-clockwise couple turns the loaded node counter-clockwise.
    expect(r2.displacements.find((d) => d.nodeId === n2)!.ry).toBeGreaterThan(0);
    expectSameAnswer(r2, r3, 'nodal moment');
  });

  it('a nodal moment with forces, on a portal (a sway frame)', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 4), c = modelStore.addNode(5, 4), d = modelStore.addNode(5, 0);
    modelStore.addElement(a, b, 'frame');
    modelStore.addElement(b, c, 'frame');
    modelStore.addElement(c, d, 'frame');
    modelStore.addSupport(a, 'fixed');
    modelStore.addSupport(d, 'pinned');
    modelStore.addNodalLoad(b, 5, -20, 15);
    modelStore.addNodalLoad(c, 0, -20, -8);
    const { r2, r3 } = solveBoth();
    expectSameAnswer(r2, r3, 'portal with nodal moments');
  });

  it('a prescribed rotation on a fixed support', () => {
    const [n1, , n3] = beam();
    modelStore.addSupport(n1, 'fixed', undefined, { dry: 0.002 });
    modelStore.addSupport(n3, 'fixed');
    const { r2, r3 } = solveBoth();
    expect(r2.displacements.find((d) => d.nodeId === n1)!.ry).toBeCloseTo(0.002, 12);
    expectSameAnswer(r2, r3, 'prescribed rotation');
  });

  it('a prescribed rotation given in the legacy field (drz)', () => {
    const [n1, , n3] = beam();
    modelStore.addSupport(n1, 'fixed', undefined, { drz: -0.003 });
    modelStore.addSupport(n3, 'pinned');
    const { r2, r3 } = solveBoth();
    expect(r2.displacements.find((d) => d.nodeId === n1)!.ry).toBeCloseTo(-0.003, 12);
    expectSameAnswer(r2, r3, 'prescribed rotation (drz)');
  });

  it('a prescribed rotation together with a settlement and a load', () => {
    const [n1, n2, n3] = beam();
    modelStore.addSupport(n1, 'fixed', undefined, { dry: 0.001, dz: -0.005 });
    modelStore.addSupport(n3, 'rollerX');
    modelStore.addNodalLoad(n2, 2, -10, 4);
    const { r2, r3 } = solveBoth();
    expectSameAnswer(r2, r3, 'rotation + settlement + load');
  });

  it('a rotational spring, under a nodal moment', () => {
    const [n1, n2, n3] = beam();
    // A plane spring support: kx, ky translations, kz the rotation spring (kN·m/rad).
    modelStore.addSupport(n1, 'spring', { kx: 1e6, ky: 1e6, kz: 2000 });
    modelStore.addSupport(n3, 'rollerX');
    modelStore.addNodalLoad(n2, 0, -10, 6);
    const { r2, r3 } = solveBoth();
    expectSameAnswer(r2, r3, 'rotational spring');
  });

  it('a rotational spring with a prescribed rotation on a fixed support', () => {
    const [n1, n2, n3] = beam();
    modelStore.addSupport(n1, 'fixed', undefined, { dry: 0.001 });
    modelStore.addSupport(n3, 'spring', { kx: 1e6, ky: 1e6, kz: 500 });
    modelStore.addNodalLoad(n2, 0, -5, -3);
    const { r2, r3 } = solveBoth();
    expectSameAnswer(r2, r3, 'rotational spring + prescribed rotation');
  });

  it('a nodal moment at a hinge-free inclined member end', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(3, 4), c = modelStore.addNode(7, 4);
    modelStore.addElement(a, b, 'frame');
    modelStore.addElement(b, c, 'frame');
    modelStore.addSupport(a, 'fixed');
    modelStore.addSupport(c, 'pinned');
    modelStore.addNodalLoad(b, 0, 0, 12);
    const { r2, r3 } = solveBoth();
    expectSameAnswer(r2, r3, 'moment on an inclined frame');
  });

  // A couple on a member (`pointOnElement.my`) is dropped by the space mapping on main and its
  // sign is that of the nodal one: #343 / #274 fix both in `buildSolverLoads3D`. Kept as a known
  // failure here so it cannot pass unnoticed; when #274 lands, `it.fails` turns red and becomes `it`.
  it('a couple on a member (#343, fixed by #274)', () => {
    const [n1, , n3] = beam();
    modelStore.addSupport(n1, 'fixed');
    modelStore.addSupport(n3, 'fixed');
    const e = [...modelStore.elements.keys()][0]!;
    modelStore.addPointLoadOnElement(e, 1, 0, { my: 10 });
    const { r2, r3 } = solveBoth();
    expectSameAnswer(r2, r3, 'member couple');
  });
});
