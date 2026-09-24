/**
 * Unbraced lengths, tension apart from compression, and the lightest passing profile — each
 * against the verification's own computation.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { memberLengths } from '../unbraced-length';
import { familyByWeight, lightestPassing, verdictFor } from '../profile-optimise';
import { checkSteelMember, steelGoverningRatio, type SteelMemberDemand } from '../../verification-service';
import { profileToSectionFull, PROFILE_FAMILIES } from '../../../data/steel-profiles';
import { modelStore } from '../../../store/model.svelte';
import { resultsStore } from '../../../store/results.svelte';
import { historyStore } from '../../../store/history.svelte';
import { uiStore } from '../../../store/ui.svelte';
import '../../../store/index';
import { initSolver } from '../../wasm-solver';
import { steelOptimise } from '../../../store/steel-optimise.svelte';

const steel = { fy: 250, fu: 400, e: 200000 };
const noDemand: SteelMemberDemand = { Nc: 0, Nt: 0, MuStrong: 0, MuWeak: 0, Vu: 0, diagram: [] };

describe('unbraced length', () => {
  const nodes = new Map([[1, { x: 0, y: 0, z: 3 }], [2, { x: 3, y: 0, z: 3 }], [3, { x: 6, y: 0, z: 3 }], [4, { x: 9, y: 0, z: 3 }], [5, { x: 3, y: 4, z: 3 }]]);
  const el = (id: number, i: number, j: number, extra = {}) => [id, { id, nodeI: i, nodeJ: j, type: 'frame', ...extra }] as const;

  it('a beam split where nothing arrives is one length', () => {
    const r = memberLengths({ nodes, elements: new Map([el(1, 1, 2), el(2, 2, 3), el(3, 3, 4)]), supports: new Map() });
    for (const id of [1, 2, 3]) expect(r.get(id)).toMatchObject({ L: 9, Lb: 9, source: 'chain', chain: [1, 2, 3] });
  });

  it('stops where a member frames in, a support holds, or the line turns — never shorter than the element', () => {
    const r = memberLengths({
      nodes, elements: new Map([el(1, 1, 2), el(2, 2, 3), el(3, 3, 4), el(4, 2, 5)]),
      supports: new Map([[1, { nodeId: 3 }]]),
    });
    expect(r.get(1)).toMatchObject({ L: 3, source: 'element' });
    expect(r.get(2)).toMatchObject({ L: 3, source: 'element' });
    expect(r.get(4)).toMatchObject({ L: 4, source: 'element' });
  });

  it('a stated Lb replaces the lateral-torsional length only', () => {
    const r = memberLengths({ nodes, elements: new Map([el(1, 1, 2, { unbracedLength: 1.5 }), el(2, 2, 3)]), supports: new Map() });
    expect(r.get(1)).toMatchObject({ L: 6, Lb: 1.5, source: 'declared' });
    expect(r.get(2)).toMatchObject({ L: 6, Lb: 6, source: 'chain' });
  });
});

describe('tension is not checked as compression', () => {
  it('a slender brace that only pulls passes in tension, and would fail if it were pushed', () => {
    // The smallest IPE, 6 m long: slender enough that its buckling capacity is a fraction of its
    // tensile one.
    const sec = profileToSectionFull(PROFILE_FAMILIES.IPE[0]!);
    const pull = checkSteelMember(1, { ...noDemand, Nt: 20 }, sec, steel, { L: 6, Lb: 6 })!;
    const push = checkSteelMember(1, { ...noDemand, Nc: 20 }, sec, steel, { L: 6, Lb: 6 })!;
    expect(pull.tension).toBeDefined();
    expect(pull.compression).toBeUndefined();
    expect(steelGoverningRatio(pull)).toBeLessThan(1);
    expect(steelGoverningRatio(push)).toBeGreaterThan(steelGoverningRatio(pull));
  });

  it('a member that sees both is checked for both and reports the worse', () => {
    const sec = profileToSectionFull(PROFILE_FAMILIES.IPE[3]!);
    const both = checkSteelMember(1, { ...noDemand, Nc: 50, Nt: 80 }, sec, steel, { L: 4, Lb: 4 })!;
    const c = checkSteelMember(1, { ...noDemand, Nc: 50 }, sec, steel, { L: 4, Lb: 4 })!;
    const tn = checkSteelMember(1, { ...noDemand, Nt: 80 }, sec, steel, { L: 4, Lb: 4 })!;
    expect(steelGoverningRatio(both)).toBe(Math.max(steelGoverningRatio(c), steelGoverningRatio(tn)));
  });
});

describe('lightest passing profile', () => {
  const beam = (M: number, Lb: number) => [{ elementId: 1, demand: { ...noDemand, MuStrong: M, Vu: M / 2 }, lengths: { L: Lb, Lb } }];

  it('picks a profile that passes, and the next lighter one does not', () => {
    const r = lightestPassing('IPE', beam(60, 3), steel);
    expect(r.chosen?.passes).toBe(true);
    const list = familyByWeight('IPE');
    const k = list.findIndex((p) => p.name === r.chosen!.profile.name);
    expect(k).toBeGreaterThan(0);
    expect(verdictFor(list[k - 1]!, beam(60, 3), steel)!.passes).toBe(false);
  });

  it('a longer unbraced length needs a heavier profile', () => {
    const short = lightestPassing('IPE', beam(60, 1.5), steel).chosen!.profile;
    const long = lightestPassing('IPE', beam(60, 8), steel).chosen!.profile;
    expect(long.weight).toBeGreaterThan(short.weight);
  });

  it('says so when nothing in the family passes, and how close the best came', () => {
    const r = lightestPassing('IPE', beam(5e4, 3), steel);
    expect(r.chosen).toBeNull();
    expect(r.best!.ratio).toBeGreaterThan(1);
    expect(r.tried).toBe(familyByWeight('IPE').length);
  });
});

describe('propose, apply, re-verify', () => {
  beforeAll(async () => { await initSolver(); });
  beforeEach(() => { uiStore.analysisMode = 'pro'; });
  afterEach(() => { uiStore.analysisMode = '3d'; steelOptimise.clearApplied(); });

  function portal() {
    modelStore.clear();
    historyStore.clear();
    const heavy = PROFILE_FAMILIES.IPE[PROFILE_FAMILIES.IPE.length - 1]!;
    const full = profileToSectionFull(heavy);
    const sid = modelStore.addSection({ name: heavy.name, profileFamily: heavy.family, ...full } as never);
    const mid = modelStore.addMaterial({ name: 'S235', e: 200000, nu: 0.3, rho: 78.5, fy: 250, fu: 400 } as never);
    const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(0, 0, 4), modelStore.addNode(6, 0, 4), modelStore.addNode(6, 0, 0)];
    const cols = [modelStore.addElement(n[0]!, n[1]!, 'frame'), modelStore.addElement(n[3]!, n[2]!, 'frame')];
    const beamId = modelStore.addElement(n[1]!, n[2]!, 'frame');
    for (const id of [...cols, beamId]) { modelStore.updateElementSection(id, sid); modelStore.updateElementMaterial(id, mid); }
    modelStore.addSupport(n[0]!, 'fixed3d');
    modelStore.addSupport(n[3]!, 'fixed3d');
    modelStore.addDistributedLoad3D(beamId, 0, 0, -15, -15);
    return { sid, beamId, cols };
  }
  function solve() {
    const r = modelStore.solve3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    resultsStore.setResults3D(r);
  }

  it('proposes per member, writes the picks as one undoable edit, and re-verifies in one visible pass', () => {
    const { beamId } = portal();
    solve();
    steelOptimise.run('member');
    expect(steelOptimise.rows).toHaveLength(3);
    const row = steelOptimise.rows.find((r) => r.elementIds[0] === beamId)!;
    expect(row.result.chosen!.profile.weight).toBeLessThan(PROFILE_FAMILIES.IPE[PROFILE_FAMILIES.IPE.length - 1]!.weight);

    const undoBefore = historyStore.undoCount;
    steelOptimise.apply(steelOptimise.rows.map((r) => r.key));
    expect(historyStore.undoCount).toBe(undoBefore + 1);
    expect(modelStore.sections.get(modelStore.elements.get(beamId)!.sectionId)!.name).toBe(row.result.chosen!.profile.name);
    // Applying is an edit: the forces it was chosen against are gone, and the state says so.
    expect(resultsStore.results3D).toBeNull();
    expect(steelOptimise.awaitingReverify).toBe(true);

    solve();
    steelOptimise.recheck();
    expect(steelOptimise.applied.every((a) => a.status !== 'unchecked')).toBe(true);
    // Lighter columns and beam redistribute the moment; whatever the pass says, it says per row.
    for (const a of steelOptimise.applied) expect(['holds', 'lighter', 'failsNow']).toContain(a.status);
  });

  it('by section: every member sharing it follows', () => {
    const { sid } = portal();
    solve();
    steelOptimise.run('section');
    expect(steelOptimise.rows).toHaveLength(1);
    const pick = steelOptimise.rows[0]!.result.chosen!.profile.name;
    steelOptimise.apply([steelOptimise.rows[0]!.key]);
    expect(modelStore.sections.get(sid)!.name).toBe(pick);
    for (const e of modelStore.elements.values()) expect(e.sectionId).toBe(sid);
  });
});

describe('a stated Lb is part of the model', () => {
  it('travels in the model code', async () => {
    const { modelToCode, codeToModel } = await import('../../../model/code/format');
    modelStore.clear();
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(5, 0, 0);
    const e = modelStore.addElement(a, b, 'frame');
    modelStore.updateElement(e, { unbracedLength: 1.25 });
    const back = codeToModel(modelToCode(modelStore.snapshot())).snapshot!;
    const el = (back.elements as Array<[number, { unbracedLength?: number }]>).find(([id]) => id === e)![1];
    expect(el.unbracedLength).toBe(1.25);
  });
});
