/**
 * A concrete whose `fy` holds the rebar grade.
 *
 * `fy` carries f'c for a concrete, and 420 is the number an engineer associates with a concrete
 * member first. With it, the magnitude rule files the material as steel, the concrete design
 * builds no member context, and every member read `unavailable` with no message anywhere. When
 * a message did come, from the code check, it said all the members were steel.
 *
 * These pin the three places that now say what happened: the pure predicate, the model check
 * that reaches the diagnostics panel and the Basic solve, and the design command itself.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { modelStore, resultsStore, verificationStore, historyStore } from '../index';
import { designRunStore } from '../design-run.svelte';
import qa8 from '../../templates/fixtures/rc-design-qa-8.json';
import { solveCombinations3D, validateAndSolve3D } from '../../engine/solver-service';
import * as wasmSolver from '../../engine/wasm-solver';
import { concreteStrengthConflict, materialFamilyOf } from '../../engine/steel/material-family';
import { catalogueGradeFamily } from '../../engine/steel/grade-family';
import { concreteStrengthWarnings } from '../../engine/model-diagnostics';

beforeAll(async () => {
  await new Promise(r => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

const H30 = { e: 30000, nu: 0.2, rho: 25 };

describe('concreteStrengthConflict', () => {
  it('flags a concrete modulus carrying a steel fy, which the magnitude rule calls steel', () => {
    const m = { ...H30, fy: 420 };
    expect(materialFamilyOf(m).family).toBe('steel');
    expect(concreteStrengthConflict(m, catalogueGradeFamily)).toBe('stiffnessSaysConcrete');
  });

  it('flags a catalogue concrete whose fy was edited past the ceiling', () => {
    const m = { ...H30, fy: 420, gradeId: 'cirsoc-h30' };
    expect(materialFamilyOf(m, catalogueGradeFamily).family).toBe('concrete');
    expect(concreteStrengthConflict(m, catalogueGradeFamily)).toBe('gradeSaysConcrete');
  });

  it('leaves alone what is consistent', () => {
    expect(concreteStrengthConflict({ ...H30, fy: 30 }, catalogueGradeFamily)).toBeNull();
    expect(concreteStrengthConflict({ ...H30, fy: 30, gradeId: 'cirsoc-h30' }, catalogueGradeFamily)).toBeNull();
    // Steel and aluminium sit far outside the concrete modulus band.
    expect(concreteStrengthConflict({ e: 200000, fy: 420 }, catalogueGradeFamily)).toBeNull();
    expect(concreteStrengthConflict({ e: 70000, fy: 250 }, catalogueGradeFamily)).toBeNull();
    // A declared steel grade is a declaration; its modulus is someone else's check.
    expect(concreteStrengthConflict({ e: 30000, fy: 235, gradeId: 'iram-f24' }, catalogueGradeFamily)).toBeNull();
    expect(concreteStrengthConflict({ ...H30 }, catalogueGradeFamily)).toBeNull();
    expect(concreteStrengthConflict(null)).toBeNull();
  });
});

describe('concreteStrengthWarnings', () => {
  const elements = new Map([
    [1, { id: 1, materialId: 1 }], [2, { id: 2, materialId: 1 }], [3, { id: 3, materialId: 2 }],
  ]) as never;

  it('warns once per material, naming every member that uses it', () => {
    const materials = new Map([
      [1, { id: 1, name: 'H-30', ...H30, fy: 420 }],
      [2, { id: 2, name: 'F-24', e: 200000, nu: 0.3, rho: 78.5, fy: 235 }],
    ]) as never;
    const out = concreteStrengthWarnings(materials, elements);
    expect(out).toHaveLength(1);
    expect(out[0]!.code).toBe('MODEL_CONCRETE_FY_SUSPECT');
    expect(out[0]!.severity).toBe('warning');
    expect(out[0]!.message).toBe('diag.model.concreteFyReadAsSteel');
    expect(out[0]!.elementIds).toEqual([1, 2]);
  });

  it('says nothing about a material no member uses', () => {
    const materials = new Map([
      [1, { id: 1, name: 'H-30', ...H30, fy: 30 }],
      [2, { id: 2, name: 'F-24', e: 200000, nu: 0.3, rho: 78.5, fy: 235 }],
      [9, { id: 9, name: 'H-30 mal', ...H30, fy: 420 }],
    ]) as never;
    expect(concreteStrengthWarnings(materials, elements)).toEqual([]);
  });
});

/** The QA-8 frame — all concrete — with its material's fy set as given. */
function solveQa8(material: Record<string, unknown>) {
  modelStore.clear();
  resultsStore.clear();
  verificationStore.clear();
  historyStore.clear();
  designRunStore.resetMarks();
  modelStore.restore({
    nodes: qa8.nodes.map((n: any) => [n.id, n]) as never,
    materials: qa8.materials.map((m: any) => [m.id, { ...m, ...material }]) as never,
    sections: qa8.sections.map((s: any) => [s.id, s]) as never,
    elements: qa8.elements.map((e: any) => [e.id, e]) as never,
    supports: qa8.supports.map((s: any) => [s.id, s]) as never,
    loads: qa8.loads as never,
    loadCases: qa8.loadCases as never,
    combinations: qa8.combinations as never,
    nextId: { node: 100, material: 10, section: 10, element: 100, support: 10, load: 100 },
  } as never);
  const combo = solveCombinations3D(modelStore.model as never, modelStore.model.loadCases, modelStore.model.combinations, true, false);
  if (typeof combo === 'string' || !combo) throw new Error(`solve: ${combo}`);
  const res = validateAndSolve3D(modelStore.model as never, true, false);
  if (typeof res === 'string' || !res) throw new Error(`solve3D: ${res}`);
  resultsStore.setResults3D(res as never);
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
}

describe('the design command says why', () => {
  it('still succeeds on the fixture as shipped', () => {
    solveQa8({});
    expect(designRunStore.computeDemands().ok).toBe(true);
    expect(verificationStore.contexts.size).toBe(qa8.elements.length);
  });

  it('refuses the demand step instead of succeeding with no member, and names the material', () => {
    solveQa8({ fy: 420 });
    const r = designRunStore.computeDemands();
    expect(verificationStore.contexts.size).toBe(0);
    expect(r.ok).toBe(false);
    expect(r.reasonKey).toBe('design.error.concreteFyReadAsSteel');
    expect(r.params).toEqual({ material: 'H30', fy: 420, n: qa8.elements.length });
    expect(designRunStore.lastError?.key).toBe('design.error.concreteFyReadAsSteel');
  });

  it('gives the code check the same reason, not "all members are steel"', () => {
    // The catalogue case reaches the code check: the declared grade keeps the members in the
    // concrete pipeline, and the verifier's magnitude rule then checks none of them.
    solveQa8({ fy: 420, gradeId: 'cirsoc-h30' });
    expect(designRunStore.computeDemands().ok).toBe(true);
    const r = designRunStore.runCodeCheck();
    expect(r.ok).toBe(false);
    expect(r.reasonKey).toBe('design.error.concreteFyReadAsSteel');
  });
});
