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
    // Every candidate was either checked or set aside by the plastic bound.
    expect(r.tried + r.pruned).toBe(familyByWeight('IPE').length);
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

  it('limits an application by section to the members actually checked', () => {
    const { sid, beamId, cols } = portal();
    solve();
    steelOptimise.run('section', [beamId]);
    const row = steelOptimise.rows[0]!;
    steelOptimise.apply([row.key]);
    expect(modelStore.sections.get(modelStore.elements.get(beamId)!.sectionId)!.name).toBe(row.result.chosen!.profile.name);
    for (const id of cols) expect(modelStore.elements.get(id)!.sectionId).toBe(sid);
    expect(modelStore.sections.get(sid)!.name).toBe(row.currentName);
  });

  it('refuses an old proposal after the model is edited', () => {
    const { beamId, sid } = portal();
    solve();
    steelOptimise.run('member');
    const keys = steelOptimise.rows.map(r => r.key);
    modelStore.updateElement(beamId, { rollAngle: 90 });
    steelOptimise.apply(keys);
    expect(modelStore.elements.get(beamId)!.sectionId).toBe(sid);
    expect(steelOptimise.error).not.toBeNull();
  });

  it('refuses an old proposal after the design result scope changes', () => {
    const { beamId, sid } = portal();
    solve();
    steelOptimise.run('member');
    const keys = steelOptimise.rows.map(r => r.key);
    modelStore.setResultScopes({ active: [] });
    steelOptimise.apply(keys);
    expect(modelStore.elements.get(beamId)!.sectionId).toBe(sid);
    expect(steelOptimise.error).not.toBeNull();
  });

  it.each(['profile', 'material'] as const)('does not re-verify a group against its old %s', (changed) => {
    const { beamId } = portal();
    solve();
    steelOptimise.run('section');
    steelOptimise.apply(steelOptimise.rows.map(r => r.key));
    if (changed === 'profile') {
      const p = PROFILE_FAMILIES.IPE[0]!;
      const sid = modelStore.addSection({ ...profileToSectionFull(p), name: p.name } as never);
      modelStore.updateElementSection(beamId, sid);
    } else {
      const mid = modelStore.addMaterial({ name: 'Weaker steel', e: 200000, nu: .3, rho: 78.5, fy: 100, fu: 150 } as never);
      modelStore.updateElementMaterial(beamId, mid);
    }
    solve();
    steelOptimise.recheck();
    expect(steelOptimise.applied[0]!.status).toBe('unchecked');
    expect(steelOptimise.converged).toBe(false);
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

import { candidates, deflectionRatio, I_FAMILIES } from '../profile-optimise';

describe('the search, widened and bounded', () => {
  const beam = (M: number, Lb: number) => [{ elementId: 1, demand: { ...noDemand, MuStrong: M, Vu: M / 2 }, lengths: { L: Lb, Lb } }];

  it('across families it is never heavier than within one, and stays within the depth limits', () => {
    const own = lightestPassing('IPE', beam(60, 3), steel).chosen!;
    const wide = lightestPassing('IPE', beam(60, 3), steel, { families: I_FAMILIES }).chosen!;
    expect(wide.profile.weight).toBeLessThanOrEqual(own.profile.weight);
    const shallow = lightestPassing('IPE', beam(60, 3), steel, { families: I_FAMILIES, hMaxMm: 250 }).chosen!;
    expect(shallow.profile.h).toBeLessThanOrEqual(250);
    expect(candidates({ families: ['HEB'], hMinMm: 300, bMaxMm: 300 }, 'IPE').every((p) => p.family === 'HEB' && p.h >= 300 && p.b <= 300)).toBe(true);
  });

  it('a target ratio of 70 % picks a profile at or under it, heavier than at 100 %', () => {
    const full = lightestPassing('IPE', beam(60, 3), steel).chosen!;
    const r70 = lightestPassing('IPE', beam(60, 3), steel, { target: 0.7 }).chosen!;
    expect(r70.ratio).toBeLessThanOrEqual(0.7);
    expect(r70.profile.weight).toBeGreaterThan(full.profile.weight);
  });

  it('the deflection estimate is the current deflection over the inertia ratio, and it can govern', () => {
    const [ipe200, ipe300] = ['IPE 200', 'IPE 300'].map((n) => familyByWeight('IPE').find((p) => p.name === n)!);
    // A simply supported beam deflecting 30 mm on an IPE 200 against a 20 mm limit.
    const d = [{ elementId: 1, v: 0, w: 0.03, direction: 'resultant' as const, limit: 0.02, iy: ipe200!.iy * 1e-8, iz: ipe200!.iz * 1e-8 }];
    expect(deflectionRatio(ipe200!, d)).toBeCloseTo(1.5, 9);
    expect(deflectionRatio(ipe300!, d)).toBeCloseTo((0.03 * (ipe200!.iy / ipe300!.iy)) / 0.02, 9);
    const byStrength = lightestPassing('IPE', beam(10, 1), steel).chosen!;
    const byDeflection = lightestPassing('IPE', beam(10, 1), steel, { deflection: d }).chosen!;
    expect(byDeflection.deflectionRatio!).toBeLessThanOrEqual(1);
    expect(byDeflection.profile.iy).toBeGreaterThanOrEqual(ipe200!.iy * 1.5);
    expect(byDeflection.profile.weight).toBeGreaterThan(byStrength.profile.weight);
  });
});

describe('by named group', () => {
  beforeAll(async () => { await initSolver(); });
  beforeEach(() => { uiStore.analysisMode = 'pro'; });
  afterEach(() => { uiStore.analysisMode = '3d'; steelOptimise.clearApplied(); });

  it.each([false, true])('keeps each member orientation and applies a common profile when the heaviest already has it: %s', (sameAsHeaviest) => {
    modelStore.clear();
    const heavy = PROFILE_FAMILIES.IPE[PROFILE_FAMILIES.IPE.length - 1]!;
    const light = PROFILE_FAMILIES.IPE.find(p => p.name === 'IPE 300')!;
    const mid = modelStore.addMaterial({ name: 'S235', e: 200000, nu: .3, rho: 78.5, fy: 250, fu: 400 } as never);
    const members = [0, 1].map(i => {
      const p = sameAsHeaviest && i === 1 ? light : heavy;
      const sid = modelStore.addSection({ ...profileToSectionFull(p), name: p.name, rotation: i * 90 } as never);
      const a = modelStore.addNode(0, i * 5, 0), b = modelStore.addNode(2, i * 5, 0);
      const id = modelStore.addElement(a, b, 'frame');
      modelStore.updateElementSection(id, sid);
      modelStore.updateElementMaterial(id, mid);
      modelStore.addSupport(a, 'fixed3d');
      modelStore.addNodalLoad3D(b, 0, 0, -1, 0, 0, 0);
      return id;
    });
    modelStore.addElement(1, 3, 'frame'); // Connect the two fixed bases.
    modelStore.addGroup('Both', 'selection', { elements: members });
    const r = modelStore.solve3D(false, false, true);
    if (!r || typeof r === 'string') throw Error(String(r));
    resultsStore.setResults3D(r);
    steelOptimise.run('group', undefined, sameAsHeaviest ? { hMinMm: heavy.h, hMaxMm: heavy.h } : {});
    const row = steelOptimise.rows[0]!;
    expect(row.result.chosen).not.toBeNull();
    steelOptimise.apply([row.key]);
    members.forEach((id, i) => {
      const s = modelStore.sections.get(modelStore.elements.get(id)!.sectionId)!;
      expect(s.rotation ?? 0).toBe(i * 90);
      expect(s.name).toBe(row.result.chosen!.profile.name);
    });
  });

  it('one profile for all the group\'s members, named by the group', () => {
    modelStore.clear();
    const heavy = PROFILE_FAMILIES.IPE[PROFILE_FAMILIES.IPE.length - 1]!;
    const sid = modelStore.addSection({ name: heavy.name, profileFamily: heavy.family, ...profileToSectionFull(heavy) } as never);
    const mid = modelStore.addMaterial({ name: 'S235', e: 200000, nu: 0.3, rho: 78.5, fy: 250, fu: 400 } as never);
    const n = [0, 1, 2].map((i) => modelStore.addNode(0, i * 5, 3));
    const sup = [0, 1, 2].map((i) => modelStore.addNode(0, i * 5, 0));
    const beams = [modelStore.addElement(n[0]!, n[1]!, 'frame'), modelStore.addElement(n[1]!, n[2]!, 'frame')];
    const cols = sup.map((s, i) => modelStore.addElement(s, n[i]!, 'frame'));
    for (const id of [...beams, ...cols]) { modelStore.updateElementSection(id, sid); modelStore.updateElementMaterial(id, mid); }
    for (const s of sup) modelStore.addSupport(s, 'fixed3d');
    modelStore.addDistributedLoad3D(beams[0]!, 0, 0, -10, -10);
    modelStore.addDistributedLoad3D(beams[1]!, 0, 0, -20, -20);
    modelStore.addGroup('Vigas', 'selection', { elements: beams });
    const r = modelStore.solve3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    resultsStore.setResults3D(r);
    steelOptimise.run('group');
    expect(steelOptimise.rows).toHaveLength(1);
    const row = steelOptimise.rows[0]!;
    expect(row.groupName).toBe('Vigas');
    expect(new Set(row.elementIds)).toEqual(new Set(beams));
    steelOptimise.apply([row.key]);
    const secs = new Set(beams.map((id) => modelStore.elements.get(id)!.sectionId));
    expect(secs.size).toBe(1);
    expect(modelStore.sections.get([...secs][0]!)!.name).toBe(row.result.chosen!.profile.name);
  });
});

import { mayPass } from '../profile-optimise';

describe('pruning by the plastic bound', () => {
  const beam = (M: number, Lb: number) => [{ elementId: 1, demand: { ...noDemand, MuStrong: M, Vu: M / 2 }, lengths: { L: Lb, Lb } }];
  it('never removes a profile the full check passes, and does remove the ones far too small', () => {
    for (const M of [20, 60, 150]) {
      for (const p of familyByWeight('IPE')) {
        const v = verdictFor(p, beam(M, 2), steel);
        if (v?.passes) expect(mayPass(p, beam(M, 2), steel), `${p.name} at ${M}`).toBe(true);
      }
    }
    expect(mayPass(familyByWeight('IPE')[0]!, beam(150, 2), steel)).toBe(false);
  });
});
