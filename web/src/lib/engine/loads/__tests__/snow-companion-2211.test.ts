import { expect, it } from 'vitest';
import { generateCombinations } from '../../../codes/cirsoc101/combinations';
import { buildLoadPlan } from '../load-plan';
import { expandCombinations } from '../combination-cases';
import { mesh } from './snow-surface-round2-fixture';
import { regulations, snow } from './snow-roof-plane-fixture';

it('#2211 native companion rules materialize flat-roof snow on a 20 degree roof', () => {
  const model = mesh([[[0, 0, 3], [10, 0, 3 + 10 * Math.tan(20 * Math.PI / 180)]]]);
  const specs = generateCombinations({ present: { L: true, Lr: false, S: true, R: false, W: false, E: false, F: false, H: false }, notActing: false });
  const plan = buildLoadPlan({ model, regulations: regulations(), dead: [], occupancyKey: 'vivienda', tributaryWidth: 1,
    reductionElementKind: 'interiorBeam', floorsSupported: 1, applyLiveReduction: false, generateCombinations: true,
    projectCombinations: specs, snow: { ...snow, enabled: true, source: 'site', roofKind: 'mono' } });
  expect(plan.outcome).toBe('READY');
  const cases = plan.cases.map((c, i) => ({ ...c, id: i + 1, name: c.nameKey }));
  const combo = expandCombinations(plan.combinations, cases).find(c => c.specId === '2-S')!;
  expect(combo).toBeDefined();
  const force = combo.factors.reduce((sum, f) => sum + plan.distributed.filter(d => d.caseType === 'S' && d.caseIndex === f.caseId - 1).reduce((v, d) => {
    const e = model.elements.get(d.elementId)!, a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    const L = Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
    return v - f.factor * (d.q + (d.qJ ?? d.q)) / 2 * ((d.b ?? L) - (d.a ?? 0)) * Math.hypot(b.x - a.x, b.y - a.y) / L;
  }, 0), 0);
  expect(force).toBeCloseTo(3.5, 11);
});

import { transform } from './snow-surface-round2-fixture';
import { memberResponse, remeshSnowRoof } from './snow-remesh-invariance';
import { snowLoadCases } from '../snow-loads';
import { gravityLayout } from '../plan-gravity';
import { resolveMassFactors } from '../../dynamics/mass-source';

const companionAtLimit = process.env.RUN_KNOWN_WRONG === '2211' ? it : it.skip;

for (const angle of [0, 0.37]) for (const mirror of [-1, 1]) for (const reverse of [false, true]) {
  companionAtLimit(`known wrong result: #2211 flat companions retain each carrier response across rotation, reversal and subdivision ${angle} ${mirror} ${reverse}`, () => {
    for (const slope of [0, 4.999, 5.001, 14.999, 15, 20, 30]) for (const count of [1, 3]) {
      const rise = 10 * Math.tan(slope * Math.PI / 180);
      const base = mesh([[[0, 0, 3], [10, 0, 3 + rise]]]);
      const { model, segments } = remeshSnowRoof(base, new Map([[1, count]]));
      if (reverse) for (const e of model.elements.values()) [e.nodeI, e.nodeJ] = [e.nodeJ, e.nodeI];
      transform(model, angle, 0, mirror);
      for (const mode of ['projected', 'width'] as const) {
        const out = snowLoadCases({ model, snow: { ...snow, roofKind: 'mono', roofSlopeDeg: slope }, tributaryWidth: 1,
          ...(mode === 'width' ? { layout: gravityLayout(model, { mode: 'width', tributaryWidth: 1 }) } : {}) })!;
        expect(out.result.refused).toBeUndefined();
        const length = Math.hypot(10, rise), cos = 10 / length, sin = rise / length;
        const pf = slope < 15 ? 1 : 0.7;
        const ps = pf * (slope <= 5 ? 1 : (70 - slope) / 65);
        for (const [c, p] of [[out.flatRoof!, pf], [out.cases[0]!, ps]] as const) {
          expect(c.nodal).toEqual([]);
          const intervals = c.distributed.map(d => {
            const s = segments.find(s => s.id === d.elementId)!;
            const l = (s.to - s.from) * length;
            expect(d.frame).toBe('projected');
            expect(d.q).toBeCloseTo(-p, 11);
            expect(d.qJ ?? d.q).toBeCloseTo(-p, 11);
            return { a: s.from * length + (reverse ? l - (d.b ?? l) : d.a ?? 0),
              b: s.from * length + (reverse ? l - (d.a ?? 0) : d.b ?? l), q: d.q, qJ: d.qJ ?? d.q };
          });
          for (const t of [0.1, 0.4, 0.8]) {
            const response = memberResponse(intervals, length, t * length), tail = length * (1 - t);
            expect(response[0]! * cos * cos).toBeCloseTo(-p * cos * cos * tail, 10);
            expect(response[1]! * cos * cos).toBeCloseTo(-p * cos * cos * tail ** 2 / 2, 10);
            expect(response[0]! * cos * sin).toBeCloseTo(-p * cos * sin * tail, 10);
            expect(response[2]! * cos * sin).toBeCloseTo(-p * cos * sin * length ** 2 / 2, 10);
            expect(response[3]! * cos * cos).toBeCloseTo(-p * cos * cos * length ** 4 / 8, 10);
          }
        }
      }
    }
  });
}

it('#2211 a flat-roof term selects only pf while principal snow and seismic mass retain physical snow', () => {
  const specs = generateCombinations({ present: { L: true, Lr: false, S: true, R: false, W: true, E: true, F: false, H: false }, seismicCompanions: { f2: 0.7 }, notActing: false });
  const cases = [{ id: 1, name: 'D', type: 'D' }, { id: 2, name: 'L', type: 'L' },
    { id: 3, name: 'balanced', type: 'S', alternatives: 'roof' }, { id: 4, name: 'drift', type: 'S', alternatives: 'roof' },
    { id: 5, name: 'pf', type: 'S', alternatives: 'roof', snowBasis: 'flatRoof' as const },
    { id: 6, name: 'W', type: 'W' }, { id: 7, name: 'E', type: 'E' }];
  const combos = expandCombinations(specs, cases);
  for (const c of combos) {
    const flat = specs.find(s => s.id === c.specId)!.terms.some(t => t.snowBasis === 'flatRoof');
    const selected = c.factors.filter(f => [3, 4, 5].includes(f.caseId));
    if (selected.length) expect(selected.map(f => f.caseId).every(id => flat ? id === 5 : id !== 5)).toBe(true);
  }
  for (const id of ['2-S', '4-S', '5', '5-seismic', '3-S-L']) expect(combos.some(c => c.specId === id)).toBe(true);
  const rows = resolveMassFactors(cases, { kind: 'preset', presetId: 'cirsoc103-2018', params: { snowRetaining: true } });
  expect(rows.find(r => r.caseId === 5)!.factor).toBe(0);
  expect(rows.find(r => r.caseId === 3)!.factor).toBe(0.7);
  expect(() => expandCombinations(specs, cases.filter(c => c.id !== 5))).toThrow();
  expect(expandCombinations(specs.filter(s => !s.terms.some(t => t.snowBasis)), cases.filter(c => c.id !== 5)).length).toBeGreaterThan(0);
});

it('#2211 legacy exception notes and independent snow actions cannot fall back to ordinary roof snow', () => {
  const specs = generateCombinations({ present: { L: true, Lr: false, S: true, R: false, W: false, E: false, F: false, H: false }, notActing: false });
  const legacy = specs.map(s => ({ ...s, terms: s.terms.map(({ snowBasis, ...term }) => term) }));
  const cases = [{ id: 1, name: 'D', type: 'D' }, { id: 2, name: 'L', type: 'L' },
    { id: 3, name: 'roof snow', type: 'S', alternatives: 'roof' },
    { id: 4, name: 'pf', type: 'S', alternatives: 'roof', snowBasis: 'flatRoof' as const }];
  const combo = expandCombinations(legacy, cases).find(c => c.specId === '2-S')!;
  expect(combo.factors.find(f => f.caseId === 4)!.factor).toBe(0.5);
  expect(combo.factors.some(f => f.caseId === 3)).toBe(false);
  const independent = [...cases, { id: 5, name: 'another roof', type: 'S', alternatives: 'second-roof' }];
  expect(() => expandCombinations(specs, independent)).toThrow();
  const covered = [...independent, { id: 6, name: 'second pf', type: 'S', alternatives: 'second-roof', snowBasis: 'flatRoof' as const }];
  const withBoth = expandCombinations(specs, covered).find(c => c.specId === '2-S')!;
  expect(withBoth.factors.filter(f => [4, 6].includes(f.caseId))).toEqual([{ caseId: 4, factor: 0.5 }, { caseId: 6, factor: 0.5 }]);
});

it('#2211 flat companion snow retains the rain supplement on both sides of its boundary', () => {
  for (const slope of [0, 2.399, 2.4, 2.401]) {
    const model = mesh([[[0, 0, 3], [10, 0, 3 + 10 * Math.tan(slope * Math.PI / 180)]]]);
    const out = snowLoadCases({ model, snow: { ...snow, pg: 0.5, exposure: 'sheltered', roofKind: 'mono', roofSlopeDeg: slope }, tributaryWidth: 1 })!;
    expect(out.result.refused).toBeUndefined();
    const expected = slope < 2.4 ? 0.635 : 0.5;
    for (const c of [out.cases[0]!, out.flatRoof!]) {
      expect(c.nodal).toEqual([]);
      expect(c.distributed).toHaveLength(1);
      expect(c.distributed[0]!.q).toBeCloseTo(-expected, 11);
    }
  }
});
