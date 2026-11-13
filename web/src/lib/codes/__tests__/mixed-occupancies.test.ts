/**
 * Floors of one occupancy under a roof of another, each code by its own rule:
 *   EN 1990 / EN 1998-1: ψ by category (Table A1.1), the roof a part of the imposed action with
 *     cases of its own, both parts leading and accompanying together (EN 1991-1-1 §3.3.1(2)P);
 *     ψE = φ·ψ2 by each part's category (§4.2.4).
 *   TBDY 2018: n by occupancy (Tablo 4.3).
 *   ASCE 7-22: 25 % of the live load in storage areas only (§12.7.2).
 */
import { describe, expect, it } from 'vitest';
import { buildLoadPlan, type LoadPlanInput } from '../../engine/loads/load-plan';
import { expandCombinations } from '../../engine/loads/combination-cases';
import { planInput, SEISMIC_ON } from './family-plan-helpers';
import type { LoadFamilyChoice } from '../families/stacks';

const roof = (occupancyKey: string): LoadPlanInput['roof'] => ({ use: 'occupancy', occupancyKey, dead: 2, slopeDeg: 0 });
const top = (p: ReturnType<typeof buildLoadPlan>) => p.levels.reduce((a, b) => (b.elevation > a.elevation ? b : a));
const run = (family: LoadFamilyChoice, floor: string, roofKey: string, codeInputs: LoadPlanInput['codeInputs'], over: Partial<LoadPlanInput> = {}) =>
  buildLoadPlan(planInput(family, { occupancyKey: floor, roof: roof(roofKey), codeInputs, seismic: SEISMIC_ON(true), combinationSet: 'both', ...over }));

describe('Eurocode: offices under an assembly roof', () => {
  const p = run('eurocode', 'ec-B', 'ec-C1', { 'en1998-1': { agR: 0.1, groundType: 'C', q: 3 } });
  it('plans the roof\'s live load as a part of its own, category C', () => {
    expect(p.outcome).toBe('READY');
    const l = p.cases.filter((c) => c.type === 'L');
    expect(l.map((c) => c.group)).toEqual([undefined, 'C']);
    const roofIndex = p.cases.findIndex((c) => c.group === 'C');
    expect(p.distributed.some((d) => d.caseIndex === roofIndex)).toBe(true);
    expect(p.derivation.map((m) => m.key)).toContain('loadPlan.derivation.roofLivePart');
  });
  it('combines each part at its own ψ: offices ψ2 = 0,3, the roof ψ2 = 0,6', () => {
    const seismic = p.combinations.filter((c) => c.terms.some((t) => t.symbol === 'E'));
    const withL = seismic.find((c) => c.terms.some((t) => t.symbol === 'L'))!;
    expect(withL.terms.find((t) => t.symbol === 'L' && !t.group)?.factor).toBeCloseTo(0.3, 9);
    expect(withL.terms.find((t) => t.symbol === 'L' && t.group === 'C')?.factor).toBeCloseTo(0.6, 9);
    const qp = p.combinations.find((c) => c.id.startsWith('6.16b') && c.terms.some((t) => t.symbol === 'L'))!;
    expect(qp.terms.find((t) => !t.group && t.symbol === 'L')?.factor).toBeCloseTo(0.3, 9);
    expect(qp.terms.find((t) => t.group === 'C')?.factor).toBeCloseTo(0.6, 9);
  });
  it('the two parts lead together, never one leading and the other accompanying', () => {
    for (const c of p.combinations.filter((x) => x.purpose === 'strength' && x.terms.some((t) => t.symbol === 'L'))) {
      const f = c.terms.filter((t) => t.symbol === 'L').map((t) => t.factor);
      expect(f).toHaveLength(2);
      if (f.some((x) => x === 1.5)) expect(f).toEqual([1.5, 1.5]);
    }
  });
  it('expands each part onto its own cases', () => {
    const cases = p.cases.map((c, i) => ({ id: i + 1, type: c.type, name: String(i), ...(c.group ? { group: c.group } : {}) }));
    const lead = p.combinations.find((c) => c.id.startsWith('6.10b-L'))!;
    const [x] = expandCombinations([lead], cases);
    const fl = p.cases.findIndex((c) => c.type === 'L' && !c.group) + 1, rf = p.cases.findIndex((c) => c.group === 'C') + 1;
    expect(x!.factors.find((f) => f.caseId === fl)?.factor).toBe(1.5);
    expect(x!.factors.find((f) => f.caseId === rf)?.factor).toBe(1.5);
    // A rule that names no group (CIRSOC's, a project's) takes every live case at its factor.
    const plain = expandCombinations([{ id: 'r', label: 'r', terms: [{ symbol: 'D', factor: 1.2 }, { symbol: 'L', factor: 1.6 }], refs: [], notes: [] } as never], cases);
    expect(plain[0]!.factors.filter((f) => f.caseId === fl || f.caseId === rf).map((f) => f.factor)).toEqual([1.6, 1.6]);
  });
  it('the seismic mass takes the roof\'s ψE = 1·0,6 on its own live load', () => {
    const t = top(p);
    expect(t.liveRoofKN).toBeGreaterThan(0);
    expect(t.liveParticipatingKN).toBeCloseTo(0.3 * (t.liveTotalKN - t.liveRoofKN!) + 0.6 * t.liveRoofKN!, 6);
    const mid = p.levels[1]!;
    expect(mid.liveParticipatingKN).toBeCloseTo(0.8 * 0.3 * mid.liveTotalKN, 6);
  });
  it('one category throughout: one live action, no part', () => {
    const q = run('eurocode', 'ec-C3', 'ec-C1', { 'en1998-1': { agR: 0.1, groundType: 'C', q: 3 } });
    expect(q.cases.filter((c) => c.type === 'L').every((c) => !c.group)).toBe(true);
    expect(q.combinations.flatMap((c) => c.terms).some((t) => t.group)).toBe(false);
  });
});

describe('TBDY 2018: n by occupancy', () => {
  it('a store (n = 0,6) under an occasional-use roof (n = 0,3)', () => {
    const p = run('turkey', 'tr_store', 'tr_roof_occasional', { tbdy2018: { ss: 1.0, s1: 0.3, soil: 'ZC', bks: 3, system: 'A11' } });
    expect(p.outcome).toBe('READY');
    const t = top(p);
    expect(t.liveRoofKN).toBeGreaterThan(0);
    expect(t.liveParticipatingKN).toBeCloseTo(0.6 * (t.liveTotalKN - t.liveRoofKN!) + 0.3 * t.liveRoofKN!, 6);
    expect(p.levels[1]!.liveParticipatingKN).toBeCloseTo(0.6 * p.levels[1]!.liveTotalKN, 6);
    expect(p.cases.some((c) => c.group)).toBe(false);
  });
});

describe('ASCE 7-22: 25 % in storage areas only', () => {
  it('a light warehouse under a roof used for assembly', () => {
    const p = run('us', 'warehouseLight', 'roofAssembly', { 'asce7-22-seismic': { sds: 1.0, sd1: 0.6, s1: 0.5, tl: 8, systemKey: 'steelSMF', periodKey: 'steelMRF' } });
    expect(p.outcome).toBe('READY');
    const t = top(p);
    expect(t.liveParticipatingKN).toBeCloseTo(0.25 * (t.liveTotalKN - (t.liveRoofKN ?? 0)), 6);
    expect(p.levels[1]!.liveParticipatingKN).toBeCloseTo(0.25 * p.levels[1]!.liveTotalKN, 6);
    expect(p.cases.some((c) => c.group)).toBe(false);
  });
});
