/**
 * The model's end connections reach the CIRSOC 301 tension check, travel with the member
 * (reverse, split, merge), persist through snapshot/restore and undo, and old models load with
 * rupture still NOT EVALUATED.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { checkSteelMember, resolveTensionEnds, type SteelMemberDemand } from '../../verification-service';
import { verdictFor } from '../profile-optimise';
import { memberEndsFor, type EndConnection } from '../tension-connection';
import { profileToSectionFull, PROFILE_FAMILIES } from '../../../data/steel-profiles';
import { modelStore } from '../../../store/model.svelte';
import { historyStore } from '../../../store/history.svelte';
import '../../../store/index';
import * as wasmSolver from '../../wasm-solver';
import { splitAtNodes } from '../../../model/edit/cut-members';
import { mergeCollinear } from '../../../model/edit/merge-collinear';
import { flipMembers } from '../../../model/edit/flip-members';

const steel = { fy: 235, fu: 360, e: 200000 };
const noDemand: SteelMemberDemand = { Nc: 0, Nt: 0, MuStrong: 0, MuWeak: 0, Vu: 0, diagram: [] };
// IPE 200 bolted through both flanges, 2 lines per flange of 3 × M16 at 50 mm.
const flanges: EndConnection = { kind: 'bolted', connected: 'flanges', diameterMm: 16, holeKind: 'standard', boltsPerLine: 3, lines: 2, pitchMm: 50 };
const IPE200 = { shape: 'I', h: 0.2, b: 0.1, tw: 0.0056, tf: 0.0085, a: 28.5e-4, iy: 1943e-8, iz: 142e-8, j: 6.98e-8 };

describe('CIRSOC 301 D.2(b) from the model connection', () => {
  const ends = (j?: EndConnection) => [{ elementId: 1, end: 'i' as const, connection: flanges }, { elementId: 1, end: 'j' as const, connection: j }];

  it('both ends described: rupture is evaluated on Ae = An·U', () => {
    const v = checkSteelMember(1, { ...noDemand, Nt: 300 }, IPE200, steel, { L: 3, Lb: 3, tensionEnds: ends(flanges) })!;
    expect(v.tension?.notEvaluated).toBeUndefined();
    // Ae = 2170·0,76945 = 1669,7 mm²; φPn = 0,75·360·1669,7/1000 = 450,8 kN < 0,9·235·2850/1000 = 602,8
    expect(v.tension!.phiPn).toBeCloseTo(0.75 * 360 * 1669.7 / 1000, 0);
    expect(v.tension!.ratio).toBeCloseTo(300 / v.tension!.phiPn, 9);
    const text = v.tension!.steps.join('\n');
    expect(text).toMatch(/D\.3\.2/);
    expect(text).toMatch(/B\.4\.2\.2/);
    expect(text).toMatch(/extremo J/);
  });

  it('an end left undescribed keeps the check NOT EVALUATED, naming the end', () => {
    const v = checkSteelMember(1, { ...noDemand, Nt: 300 }, IPE200, steel, { L: 3, Lb: 3, tensionEnds: ends(undefined) })!;
    expect(v.tension?.notEvaluated).toMatch(/falta la union extrema.*extremo J/);
    expect(v.overallStatus).toBe('fail');
  });

  it('a refused combination is NOT EVALUATED with its reason', () => {
    const tube = { shape: 'RHS', h: 0.1, b: 0.1, t: 0.005, tw: 0.005, tf: 0.005, a: 0.0019, iy: 2.8e-6, iz: 2.8e-6 };
    const r = resolveTensionEnds(tube, ends(flanges));
    expect(r.refused).toMatch(/CIRSOC 302/);
  });

  it('the optimiser resolves the connection against each candidate profile', () => {
    const members = [{ elementId: 1, demand: { ...noDemand, Nt: 120 }, lengths: { L: 3, Lb: 3, tensionEnds: ends(flanges) } }];
    const small = verdictFor(PROFILE_FAMILIES.IPE[2]!, members, steel);
    const big = verdictFor(PROFILE_FAMILIES.IPE[8]!, members, steel);
    expect(Number.isFinite(small!.ratio)).toBe(true);
    expect(big!.ratio).toBeLessThan(small!.ratio);
    // And a candidate's own An: the check with the candidate's section equals a direct one.
    const direct = checkSteelMember(1, members[0]!.demand, profileToSectionFull(PROFILE_FAMILIES.IPE[2]!), steel, members[0]!.lengths)!;
    expect(direct.tension!.ratio).toBeCloseTo(small!.ratio, 9);
  });
});

describe('the connection on the member', () => {
  beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 0));
    expect(wasmSolver.isSolverReady(), 'real WASM solver required').toBe(true);
  });
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  function brace() {
    modelStore.restore({
      nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 6, y: 0, z: 0 }]],
      materials: [[1, { id: 1, name: 'S', e: 200000, nu: 0.3, rho: 78.5, fy: 235, fu: 360 }]],
      sections: [[1, { id: 1, name: 'IPE 200', ...IPE200 }]],
      elements: [[1, { id: 1, type: 'truss', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, releaseI: { my: false, mz: false, t: false }, releaseJ: { my: false, mz: false, t: false } }]],
      supports: [], loads: [], loadCases: [{ id: 1, type: 'D', name: 'D' }], combinations: [],
      nextId: { node: 10, material: 10, section: 10, element: 10, support: 10, load: 1 },
    } as never);
    historyStore.clear();
  }

  it('an old model has none, and its ends come back undescribed', () => {
    brace();
    expect(modelStore.elements.get(1)!.tensionConnection).toBeUndefined();
    expect(memberEndsFor(1, modelStore.model as never).every((e) => !e.connection)).toBe(true);
  });

  it('is persisted by snapshot/restore and undone as one step', () => {
    brace();
    modelStore.batch(() => modelStore.updateElement(1, { tensionConnection: { i: flanges, j: flanges } }));
    const snap = JSON.parse(JSON.stringify(modelStore.snapshot()));
    modelStore.clear();
    modelStore.restore(snap);
    expect(modelStore.elements.get(1)!.tensionConnection).toEqual({ i: flanges, j: flanges });
    brace();
    modelStore.batch(() => modelStore.updateElement(1, { tensionConnection: { i: flanges } }));
    expect(modelStore.elements.get(1)!.tensionConnection?.i).toEqual(flanges);
    historyStore.undo();
    expect(modelStore.elements.get(1)!.tensionConnection).toBeUndefined();
  });

  it('a reversal swaps the ends', () => {
    brace();
    const weld: EndConnection = { kind: 'welded', connected: 'all', weld: 'transverse' };
    modelStore.updateElement(1, { tensionConnection: { i: flanges, j: weld } });
    modelStore.reverseElement(1);
    expect(modelStore.elements.get(1)!.tensionConnection).toEqual({ i: weld, j: flanges });
    flipMembers([1]);
    expect(modelStore.elements.get(1)!.tensionConnection).toEqual({ i: flanges, j: weld });
  });

  it('a split keeps each end on its segment, the cut is continuous, and a merge gives them back', () => {
    brace();
    const weld: EndConnection = { kind: 'welded', connected: 'all', weld: 'transverse' };
    modelStore.updateElement(1, { tensionConnection: { i: flanges, j: weld } });
    modelStore.addNode(3, 0, 0);
    const r = splitAtNodes([1]);
    const [s1, s2] = r.cut[0]!.segments;
    const e1 = modelStore.elements.get(s1!)!, e2 = modelStore.elements.get(s2!)!;
    const first = e1.nodeI === 1 ? e1 : e2, last = first === e1 ? e2 : e1;
    expect(first.tensionConnection).toEqual({ i: flanges });
    expect(last.tensionConnection).toEqual({ j: weld });
    // The chain asks only for the two outer ends, both described.
    const ends = memberEndsFor(first.id, modelStore.model as never, [first.id, last.id]);
    expect(ends.map((e) => !!e.connection)).toEqual([true, true]);
    const m = mergeCollinear([first.id, last.id]);
    expect(m.merged.length).toBe(1);
    expect(modelStore.elements.get(m.merged[0]!.elementId)!.tensionConnection).toEqual({ i: flanges, j: weld });
  });

  it('a merge refuses to swallow a splice described at the joint', () => {
    brace();
    modelStore.addNode(3, 0, 0);
    const r = splitAtNodes([1]);
    const [s1, s2] = r.cut[0]!.segments;
    const first = modelStore.elements.get(s1!)!.nodeI === 1 ? s1! : s2!;
    modelStore.updateElement(first, { tensionConnection: { j: flanges } });
    expect(mergeCollinear([s1!, s2!]).refused.endConditions).toBe(1);
  });
});
