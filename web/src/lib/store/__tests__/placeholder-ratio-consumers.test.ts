/**
 * What the reader of a member sees when its only issue is an anchorage, or the torsion row of the
 * code check: the desk, the memoria, the workbook and the IFC state. A number nobody computed
 * (1.5 for every short anchorage, 1.00 for every torsion row) must not reach any of them, and a
 * member whose only issue is an anchorage that fails or cannot be evaluated never reads «ok» or
 * «satisfies».
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '../index';
import { designRunStore } from '../design-run.svelte';
import { verificationStore } from '../verification.svelte';
import { deskMembers } from '../design-desk';
import { memoriaInput } from '../memoria-inputs';
import { designSheets } from '../design-exchange';
import { projectIfcInput } from '../ifc-export';
import * as wasmSolver from '../../engine/wasm-solver';
import { stateSuiteLateral } from './suite-lateral';

const tr = (k: string) => k;

beforeAll(async () => {
  await new Promise((r) => setTimeout(r, 0));
  expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
});

/**
 * A 20×50 beam between 50×50 columns, 25 kN/m: the anchorage-hooks fixture. On 30×30 columns the
 * top bars' hooks do not fit (`anchorage-hooks.test.ts`), and the members here must have the bottom
 * anchorage as their only issue.
 */
function beamOnColumns(q = 25) {
  modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
  // The reading of the beams' role in the lateral system this suite was written under (`suite-lateral.ts`).
  stateSuiteLateral();
  const mat = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
  const col = modelStore.addSection({ name: '50×50', a: 0.25, iy: 0.5 ** 4 / 12, iz: 0.5 ** 4 / 12, j: 0.1406 * 0.5 ** 4, b: 0.5, h: 0.5, shape: 'rect' } as never);
  const sec = modelStore.addSection({ name: '20×50', a: 0.1, iy: 0.00208, iz: 0.000333, j: 0.00093, b: 0.2, h: 0.5, shape: 'rect' } as never);
  const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(0, 0, 3), modelStore.addNode(6, 0, 3), modelStore.addNode(6, 0, 0)];
  modelStore.addSupport(n[0]!, 'fixed3d' as never); modelStore.addSupport(n[3]!, 'fixed3d' as never);
  for (const [a, b] of [[0, 1], [3, 2]] as const) { const c = modelStore.addElement(n[a]!, n[b]!, 'frame'); modelStore.updateElementMaterial(c, mat); modelStore.updateElementSection(c, col); }
  const beam = modelStore.addElement(n[1]!, n[2]!, 'frame');
  modelStore.updateElementMaterial(beam, mat); modelStore.updateElementSection(beam, sec);
  modelStore.addDistributedLoad3D(beam, 0, 0, -q, -q, undefined, undefined, 1);
  const combo = modelStore.solveCombinations3D(false, false, true);
  if (!combo || typeof combo === 'string') throw new Error(String(combo));
  resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
  expect(designRunStore.computeDemands().ok).toBe(true);
  return beam;
}

/** Generous bars everywhere; the bottom group's reach into the start support is the variable. */
const bars = (extensionStart: number) => ({
  regions: {
    bottomSpanLayers: [{ count: 3, diameter: 16, row: 0 }], bottomSpan: { count: 3, diameter: 16 },
    bottomGroups: [{ layers: [{ count: 3, diameter: 16, row: 0 }], label: 'all', continueStart: true, continueEnd: true, extensionStart, anchorageStart: 'hook', anchorageEnd: 'hook' }],
    topStartLayers: [{ count: 3, diameter: 16, row: 0 }], topStart: { count: 3, diameter: 16 },
    topEndLayers: [{ count: 3, diameter: 16, row: 0 }], topEnd: { count: 3, diameter: 16 },
    stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.1 }, stirrupsSpan: { diameter: 8, legs: 2, spacing: 0.15 },
  },
});

function readers(id: number) {
  const desk = deskMembers().find((m) => m.id === id)!;
  const mem = memoriaInput(tr, 'es').elements.find((e) => e.id === `e${id}`)!;
  const [elements, checks] = designSheets(tr, 'es');
  const wbElement = elements!.rows.find((r) => String(r[0]) === mem.name)!;
  // The anchorage rows that hold the member: the support ends' own rows (`end-support-anchorage.ts`)
  // anchor on these columns and read ok.
  const wbAnchorage = checks!.rows.filter((r) => String(r[0]) === mem.name && ['check.rc.anchorage', 'check.rc.unsupportedCheck'].includes(String(r[2])) && String(r[10]) !== 'ok');
  const ifc = projectIfcInput(tr, 'es', 'p').members.find((m) => m.id === String(id))!;
  return { desk, mem, wbElement, wbAnchorage, ifc };
}

describe('a member whose only issue is its anchorage', () => {
  it('an anchorage short even hooked: fails in the desk, the memoria, the workbook and the IFC, with ℓdh/ℓ,disp as its ratio', () => {
    const beam = beamOnColumns(8);
    modelStore.reinforcementTransaction((api) => api.setReinforcement(beam, structuredClone(bars(0.1)) as never));
    const pv = verificationStore.providedFor(beam)!;
    // Every other check passes: the anchorage is the member's only issue.
    expect(pv.checks.filter((c) => c.category !== 'Anchorage' && c.status !== 'ok')).toEqual([]);
    const [anch] = pv.checks.filter((c) => c.category === 'Anchorage');
    expect(anch!.status).toBe('fail');
    expect(anch!.capacity).toBe(0.1);
    expect(anch!.ratio).toBeCloseTo(anch!.demand! / 0.1, 2);
    expect(anch!.ratio).not.toBe(1.5);
    const r = readers(beam);
    expect(r.desk.status).toBe('fail');
    expect(r.mem.rows.filter((x) => x.status !== 'ok').map((x) => [x.titleKey, x.status])).toEqual([['check.rc.anchorage', 'fail']]);
    expect(r.wbElement[6]).toBe('memo.state.fail');
    expect(r.wbElement[5]).toBe(anch!.ratio);
    expect(r.wbAnchorage.map((x) => [x[9], x[10]])).toEqual([[anch!.ratio, 'fail']]);
    expect(r.ifc.props).toMatchObject({ DesignState: 'fails', Utilization: anch!.ratio });
  });

  it('no length into the support: not evaluated, no ratio printed, and never «satisfies»', () => {
    const beam = beamOnColumns(8);
    modelStore.reinforcementTransaction((api) => api.setReinforcement(beam, structuredClone(bars(0)) as never));
    const pv = verificationStore.providedFor(beam)!;
    expect(pv.checks.filter((c) => c.category !== 'Anchorage' && c.status !== 'ok')).toEqual([]);
    const r = readers(beam);
    expect(r.desk.status).not.toBe('ok');
    expect(r.desk.ratio).toBeNull();
    expect(r.mem.rows.filter((x) => x.status !== 'ok').map((x) => [x.titleKey, x.clause, x.status, x.ratio])).toEqual([['check.rc.unsupportedCheck', '25.4.2', 'unsupported', null]]);
    expect(r.wbElement[6]).toBe('memo.state.open');
    expect(r.wbAnchorage.map((x) => [x[9], x[10]])).toEqual([['', 'unsupported']]);
    expect(r.ifc.props?.DesignState).toBe('not fully verified');
  });
});

describe('the torsion row of the code check', () => {
  it('states φTn of the section, so a member it does not govern does not read 1.00', () => {
    modelStore.clear(); historyStore.clear(); resultsStore.clear(); verificationStore.clear(); uiStore.analysisMode = 'pro';
    const mat = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
    const sec = modelStore.addSection({ name: '30×60', a: 0.18, iy: 0.0054, iz: 0.00135, j: 0.0037, b: 0.3, h: 0.6, shape: 'rect' } as never);
    const a = modelStore.addNode(0, 0, 3), b = modelStore.addNode(6, 0, 3);
    modelStore.addSupport(a, 'fixed3d' as never); modelStore.addSupport(b, 'pinned3d' as never);
    const e1 = modelStore.addElement(a, b, 'frame');
    modelStore.updateElementMaterial(e1, mat); modelStore.updateElementSection(e1, sec);
    modelStore.addDistributedLoad3D(e1, 0, 0, -10, -10, undefined, undefined, 1);
    modelStore.addNodalLoad3D(b, 0, 0, 0, 6, 0, 0, 1);
    const combo = modelStore.solveCombinations3D(false, false, true);
    if (!combo || typeof combo === 'string') throw new Error(String(combo));
    resultsStore.setCombinationResults3D(combo.perCase, combo.perCombo, combo.envelope);
    expect(designRunStore.runCodeCheck().ok).toBe(true);
    const dr = verificationStore.designMap.get(e1)!;
    const t = dr.checks.find((c) => c.name === 'Torsion')!;
    expect(t.demand).toBeCloseTo(8.4, 6);
    expect(t.capacity).not.toBeCloseTo(t.demand, 6);
    expect(t.ratio).toBeCloseTo(t.demand / t.capacity, 9);
    expect(t.ratio).toBeLessThan(0.95);
    expect(dr.governingCheck).toBe('Flexure');
    // The member has no bars: the desk's ratio is the code check's, and it is not the 1.00 torsion put there.
    expect(verificationStore.getDisplayStatus(e1)).toBe('unavailable');
    expect(verificationStore.getDisplayRatio(e1)).toBeCloseTo(dr.checks.find((c) => c.name === 'Flexure')!.ratio, 9);
    expect(verificationStore.getDisplayRatio(e1)).not.toBe(1);
  });
});

describe('a hook asked for and not on the bars', () => {
  it('reads fail in the desk, the memoria, the workbook and the IFC (was near the limit, «satisfies»)', () => {
    const beam = beamOnColumns(8);
    const straight = {
      regions: {
        bottomSpanLayers: [{ count: 3, diameter: 20, row: 0 }], bottomSpan: { count: 3, diameter: 20 },
        topStartLayers: [{ count: 3, diameter: 16, row: 0 }], topStart: { count: 3, diameter: 16 },
        topEndLayers: [{ count: 3, diameter: 16, row: 0 }], topEnd: { count: 3, diameter: 16 },
        stirrupsSupport: { diameter: 8, legs: 2, spacing: 0.1 }, stirrupsSpan: { diameter: 8, legs: 2, spacing: 0.15 },
      },
    };
    modelStore.reinforcementTransaction((api) => api.setReinforcement(beam, structuredClone(straight) as never));
    const pv = verificationStore.providedFor(beam)!;
    const hooks = pv.checks.filter((c) => c.anchorHook);
    console.log('HOOKS', hooks.map((c) => `${c.status}:${c.ratio}:${c.demand}/${c.capacity}`), pv.checks.filter((c) => !c.anchorHook && c.status !== 'ok').map((c) => c.category));
    expect(hooks.length).toBeGreaterThan(0);
    expect(pv.checks.filter((c) => !c.anchorHook && c.status !== 'ok')).toEqual([]);
    const r = readers(beam);
    console.log('HOOK-READERS', r.desk.status, JSON.stringify(r.wbElement), r.ifc.props?.DesignState);
    expect(r.desk.status).toBe('fail');
    expect(r.mem.rows.filter((x) => x.status !== 'ok').map((x) => [x.titleKey, x.status])).toEqual(hooks.map(() => ['check.rc.anchorage', 'fail']));
    expect(r.wbElement[6]).toBe('memo.state.fail');
    expect(r.ifc.props?.DesignState).toBe('fails');
  });
});
