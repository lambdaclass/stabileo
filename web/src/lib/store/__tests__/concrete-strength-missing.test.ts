import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore, resultsStore, verificationStore, historyStore } from '../index';
import { designRunStore } from '../design-run.svelte';
import building from '../../templates/fixtures/3d-building.json';
import { solveCombinations3D, validateAndSolve3D } from '../../engine/solver-service';
import * as wasmSolver from '../../engine/wasm-solver';
import { rcCheckability, censusRcCheckability } from '../../engine/auto-verify';

beforeAll(async () => {
  await new Promise(r => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

type Mat = { id: number; name: string; fy?: number; fc?: number };

function solveBuilding(editMaterial: (m: Mat) => Mat = (m) => m) {
  modelStore.clear();
  resultsStore.clear();
  verificationStore.clear();
  historyStore.clear();
  designRunStore.resetMarks();
  modelStore.restore({
    nodes: building.nodes.map((n: any) => [n.id, n]) as never,
    materials: (building.materials as Mat[]).map((m) => [m.id, editMaterial({ ...m })]) as never,
    sections: building.sections.map((s: any) => [s.id, s]) as never,
    elements: building.elements.map((e: any) => [e.id, e]) as never,
    supports: building.supports.map((s: any) => [s.id, s]) as never,
    loads: building.loads as never,
    loadCases: building.loadCases as never,
    combinations: building.combinations as never,
    nextId: { node: 1000, material: 10, section: 10, element: 1000, support: 1000, load: 1000 },
  } as never);
  const combo = solveCombinations3D(modelStore.model as never, modelStore.model.loadCases, modelStore.model.combinations, true, false);
  if (typeof combo === 'string' || !combo) throw new Error(`solve: ${combo}`);
  const res = validateAndSolve3D(modelStore.model as never, true, false);
  if (typeof res === 'string' || !res) throw new Error(`solve3D: ${res}`);
  resultsStore.setResults3D(res as never);
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
}

describe('a concrete material with no f′c (#766)', () => {
  it('is told apart from steel by the RC census', () => {
    const sections = new Map([[1, { id: 1, name: 'V 30×60', b: 0.3, h: 0.6 }]]);
    const materials = new Map([
      [1, { id: 1, name: 'H-30', e: 32000 }],
      [2, { id: 2, name: 'F-24', e: 200000, fy: 235 }],
      [3, { id: 3, name: 'Steel without fy', e: 200000 }],
    ]);
    expect(rcCheckability({ sectionId: 1, materialId: 1 }, { sections, materials })).toBe('noStrength');
    expect(rcCheckability({ sectionId: 1, materialId: 2 }, { sections, materials })).toBe('notConcrete');
    expect(rcCheckability({ sectionId: 1, materialId: 3 }, { sections, materials })).toBe('notConcrete');
    const elements = new Map([
      [1, { id: 1, nodeI: 1, nodeJ: 2, sectionId: 1, materialId: 1, type: 'frame' }],
      [2, { id: 2, nodeI: 2, nodeJ: 3, sectionId: 1, materialId: 1, type: 'frame' }],
      [3, { id: 3, nodeI: 3, nodeJ: 4, sectionId: 1, materialId: 2, type: 'frame' }],
    ]);
    const c = censusRcCheckability({ elements, sections, materials });
    expect(c).toMatchObject({ total: 3, checkable: 0, noStrength: 2, notConcrete: 1 });
    expect(c.noStrengthMaterials).toEqual(['H-30']);
  });

  it('designs every member of the 3d-building example as shipped', () => {
    solveBuilding();
    const r = designRunStore.computeDemands();
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(verificationStore.contexts.size).toBe(building.elements.length);
    const check = designRunStore.runCodeCheck();
    expect(check.ok, JSON.stringify(check)).toBe(true);
    expect(new Set(verificationStore.concrete.map((v) => v.elementId)).size).toBe(building.elements.length);
  });

  it('names the material and says f′c is missing, not that the members are steel', () => {
    solveBuilding((m) => {
      if (m.name !== 'H-30') return m;
      const { fy: _fy, fc: _fc, ...rest } = m;
      return rest;
    });
    expect(designRunStore.computeDemands().ok).toBe(true);
    const r = designRunStore.runCodeCheck();
    expect(r.ok).toBe(false);
    expect(r.reasonKey).toBe('design.error.concreteStrengthMissing');
    expect(r.params).toEqual({ code: expect.any(String), material: 'H-30', n: building.elements.length });
    expect(designRunStore.lastError?.key).toBe('design.error.concreteStrengthMissing');
  });
});
