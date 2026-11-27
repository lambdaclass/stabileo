import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { historyStore, modelStore, uiStore } from '..';
import { regulationsStore } from '../regulations.svelte';
import { createPlate, editPlateHole, plateEntry } from '../physical-plates';
import { generateSavedLoads, loadPlanModel } from '../saved-loads';
import { applyLoadPlan } from '../apply-load-plan';
import { buildLoadPlan, roofWeightFor, type LoadPlanInput } from '../../engine/loads/load-plan';
import { initSolver } from '../../engine/wasm-solver';
import { EngineMessageError } from '../../codes/message';
import { tp } from '../../i18n';

const opts = { clearExisting: false, bothSenses: true, nameOf: tp };
const gravity = { mode: 'panels', slab: 'twoWay', loadEveryPanel: true } as const;
beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear();
  historyStore.clear();
  uiStore.analysisMode = 'pro';
  for (const role of ['basis', 'loads', 'wind', 'snow', 'seismic'] as const) regulationsStore.configureRole(role, {}, true);
});

function slab(shape: 'straight' | 'hole' | 'arc') {
  const corners = [[0, 0], [6, 0], [6, 6], [0, 6]] as const;
  const top = corners.map(([x, y]) => {
    const a = modelStore.addNode(x, y, 0), b = modelStore.addNode(x, y, 3);
    modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d');
    return b;
  });
  for (let i = 0; i < top.length; i++) modelStore.addElement(top[i]!, top[(i + 1) % top.length]!, 'frame');
  const opening = () => [[2, 2], [4, 2], [4, 4], [2, 4]].map(([x, y]) => modelStore.addNode(x!, y!, 3));
  const outline = [...top];
  if (shape === 'arc') outline.splice(1, 0, modelStore.addNode(3, -1, 3));
  const made = createPlate({ outline, holes: shape === 'hole' ? [opening()] : [], arcMids: shape === 'arc' ? [1] : [], materialId: 1, thickness: 0.15 });
  if ('problem' in made) throw Error(made.problem);
  return { id: made.id, top, opening };
}

function plan() {
  const input: LoadPlanInput = {
    regulations: regulationsStore.roles, model: loadPlanModel(), gravity,
    dead: [{ labelKey: 'floor', q: 2 }], occupancyKey: 'vivienda_dormitorio', tributaryWidth: 3,
    reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: false,
  };
  return buildLoadPlan(input);
}

function state() {
  return JSON.stringify([modelStore.loads, modelStore.loadCases, modelStore.combinations, [...modelStore.model.groups], modelStore.model.designData]);
}

describe.skip('known wrong result: #1928 physical shells in the load generator', () => {
  it('plans and applies the released analytical model or the offered whole-plate definition', () => {
    const { id } = slab('straight');
    const real = modelStore.model.quads;
    expect(Array.from(loadPlanModel().quads!.keys())).toEqual(__PUBLIC_FEATURES__.proPlatesUnified ? [-id] : [...real.keys()]);
    const p = plan();
    expect(p.blockedKeys).toEqual([]);
    expect(p.outcome).toBe('READY');
    expect(p.surface.some(s => s.quadId === -id)).toBe(__PUBLIC_FEATURES__.proPlatesUnified);
    expect(applyLoadPlan(p, opts)).toBeUndefined();
    const defs = [...modelStore.model.groups.values()].filter(g => g.kind === 'floorLoad');
    expect(defs.some(g => (g.data as { target?: { groupId: number } }).target?.groupId === id)).toBe(__PUBLIC_FEATURES__.proPlatesUnified);
    expect(modelStore.loads.length + defs.length).toBeGreaterThan(0);
  });

  it.each(['hole', 'arc'] as const)('handles an unmeshed %s at preview, roof weight and saved generation', shape => {
    const { id } = slab(shape);
    const before = state();
    const p = plan();
    if (__PUBLIC_FEATURES__.proPlatesUnified) {
      const refusal = { key: 'loadPlan.blocked.meshPhysicalPlate', params: { id } };
      expect(p.blockedKeys).toContainEqual(refusal);
      expect(p.outcome).toBe('BLOCKED');
      expect(() => roofWeightFor(loadPlanModel(), gravity, 3, 2)).toThrow(EngineMessageError);
      expect(generateSavedLoads()).toContainEqual(refusal);
      expect(applyLoadPlan(p, opts)).toEqual(refusal);
      expect(state()).toBe(before);
    } else {
      expect(p.blockedKeys).toEqual([]);
      expect(p.outcome).toBe('READY');
      expect(p.surface.every(s => s.quadId > 0)).toBe(true);
      const analytical = { ...loadPlanModel(), quads: modelStore.model.quads };
      expect(roofWeightFor(loadPlanModel(), gravity, 3, 2)).toBe(roofWeightFor(analytical, gravity, 3, 2));
    }
  });

  it.each(['curved', 'offset', 'zero offset', 'concave'] as const)('checks the actual unmeshed %s surface before computing weights or writing loads', shape => {
    const { id, top } = slab('straight');
    const group = plateEntry(id)!;
    if (shape === 'concave') {
      const notch = modelStore.addNode(2, 2, 3);
      modelStore.setGroupMembers(id, { nodes: [top[0]!, top[1]!, notch, top[2]!, top[3]!] });
      modelStore.setGroupData(id, { ...group.group.data, surface: { ...group.surface, loops: [5] } });
    } else {
      const metadata = shape === 'curved' ? { curved: true } : { offset: { frame: 'global', x: 0, y: 0, z: shape === 'offset' ? 1 : 0 } };
      modelStore.setGroupData(id, { ...group.group.data, surface: { ...group.surface, ...metadata } });
    }
    const p = plan();
    if (__PUBLIC_FEATURES__.proPlatesUnified && shape !== 'zero offset') {
      expect(p.blockedKeys).toContainEqual({ key: 'loadPlan.blocked.meshPhysicalPlate', params: { id } });
      expect(p.outcome).toBe('BLOCKED');
    } else {
      expect(p.blockedKeys).toEqual([]);
      expect(p.outcome).toBe('READY');
      expect(p.surface.some(load => load.quadId === -id)).toBe(__PUBLIC_FEATURES__.proPlatesUnified);
    }
  });

  it.each(['thermal', 'varying pressure', 'missing plate'] as const)('refuses virtual %s before changing the model', kind => {
    const { id } = slab('straight');
    const p = plan();
    expect(p.outcome).toBe('READY');
    const before = state();
    const caseType = 'D' as const;
    const target = -id;
    if (kind === 'thermal') p.thermal = [{ quadId: target, dtUniform: 2, dtGradient: 0 }];
    if (kind === 'varying pressure') p.surface = [{ quadId: target, caseType, q: 0, frame: 'global', dir: [0, 0, -1], vary: { dir: [1, 0, 0], c1: 0, q1: 0, c2: 6, q2: 2 } }];
    if (kind === 'missing plate') p.surface = [{ quadId: target - 1, caseType, q: 2 }];
    const expected = kind === 'thermal' ? { key: 'loadPlan.blocked.unmeshedPlateThermal' }
      : kind === 'varying pressure' ? { key: 'loadPlan.blocked.unmeshedPlatePressure' } : { key: 'loadPlan.blocked.meshPhysicalPlate', params: { id: id + 1 } };
    expect(applyLoadPlan(p, opts)).toEqual(expected);
    expect(state()).toBe(before);
  });

  it('refuses a stale virtual target before applying any load or case', () => {
    const { id, opening } = slab('straight');
    const p = plan();
    expect(p.outcome).toBe('READY');
    expect(editPlateHole(id, { append: opening() })).toBeNull();
    const before = state();
    const stale = { ...p, surface: [{ caseType: 'D' as const, quadId: -id, q: 2 }] };
    expect(applyLoadPlan(stale, opts)).toEqual({ key: 'loadPlan.blocked.meshPhysicalPlate', params: { id } });
    expect(state()).toBe(before);
  });

  it('refuses an old preview after the thickness of a still-unmeshed plate changes', () => {
    const { id } = slab('straight');
    const p = plan();
    expect(p.outcome).toBe('READY');
    const g = plateEntry(id)!;
    modelStore.setGroupData(id, { ...g.group.data, surface: { ...g.surface, thickness: g.surface.thickness * 2 } });
    const before = state();
    if (__PUBLIC_FEATURES__.proPlatesUnified) {
      expect(applyLoadPlan(p, opts)).toEqual({ key: 'autoLoad.previewStale' });
      expect(state()).toBe(before);
    } else {
      expect(p.surface.every(load => load.quadId > 0)).toBe(true);
    }
  });

  it('keeps the exact analytical shell when the physical plate already has a mesh', () => {
    const { id, top } = slab('straight');
    const q = modelStore.addQuad(top as [number, number, number, number], 1, 0.15);
    modelStore.setGroupMembers(id, { ...plateEntry(id)!.group.members, quads: [q] });
    expect(Array.from(loadPlanModel().quads!.entries())).toEqual([...modelStore.model.quads]);
    const p = plan();
    expect(p.blockedKeys).toEqual([]);
    expect(p.surface.some(s => s.quadId === q)).toBe(true);
  });
});
