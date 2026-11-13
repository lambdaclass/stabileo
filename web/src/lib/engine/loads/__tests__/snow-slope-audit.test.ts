import { describe, expect, it } from 'vitest';
import { buildLoadPlan, type LoadPlanInput } from '../load-plan';
import { gravityLayout } from '../plan-gravity';
import { auditMultiSpan, auditRoof } from './snow-slope-audit-fixture';
import { planInput } from '../../../codes/__tests__/family-plan-helpers';
import type { LoadFamilyChoice } from '../../../codes/families/stacks';

const psf = 4.4482216152605e-3 / (0.3048 * 0.3048);

function run(family: LoadFamilyChoice, kind: 'mono' | 'gable', slope: number, model = auditRoof(kind, slope)) {
  const codeInputs: LoadPlanInput['codeInputs'] = {
    'asce7-22-snow': { pg: 20 * psf, ce: 1, ct: 1, slippery: true, riskCategory: 'II' },
    'en1991-1-3': { sk: 1, roof: kind === 'mono' ? 'monopitch' : 'duopitch', exposure: 'normal', ct: 1 },
    'ts498-1997-snow': { zone: 'II', altitudeM: 900 },
  };
  const plan = buildLoadPlan(planInput(family, {
    model, tributaryWidth: 1, gravity: { mode: 'panels' }, codeInputs,
    snow: { enabled: true, pg: 1, source: 'site', terrain: 'C', exposure: 'partial', thermal: 'normal', category: 'II', roofKind: kind, slippery: true, partial: false },
  }));
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  const index = plan.cases.findIndex(c => c.type === 'S');
  expect(index).toBeGreaterThanOrEqual(0);
  const pieces = layout.pieces.filter(p => p.roof && p.wI > 1e-6);
  expect(pieces.length).toBeGreaterThan(0);
  const pressures = pieces.map(pc => {
    const d = plan.distributed.find(d => d.caseIndex === index && d.elementId === pc.elementId && (d.a ?? 0) === (pc.a ?? 0));
    expect(d).toBeDefined();
    return -d!.q / pc.wI;
  });
  return { plan, pressures, model, layout };
}

describe.each(['mono', 'gable'] as const)('snow slope clause audit: %s', kind => {
  it.each([0, 5, 10, 14.99, 15.01, 20, 26.57, 29.99])('CIRSOC 104 Chapters 3, 4 and Figure 2 at %s degrees', slope => {
    const cs = slope <= 5 ? 1 : (70 - slope) / (70 - 5);
    const lowSlope = kind === 'mono' ? slope < 15 : slope <= 21 / 3 + 0.5;
    const pf = lowSlope ? Math.max(0.7 * 1 * 1 * 1 * 1, 1 * Math.min(1, 1)) : 0.7 * 1 * 1 * 1 * 1;
    const rain = slope < 2.4 ? Math.max(0.25 - Math.min(pf - 0.7, 0.25), 0) : 0;
    const required = cs * pf + rain;
    for (const p of run('cirsoc', kind, slope).pressures) expect(p).toBeCloseTo(required, 6);
  });
  it.each([0, 5, 10, 14.99, 15.01, 20, 26.57, 29.99])('ASCE 7-22 eqs 7.3-1, 7.4-1 and Figure 7.4-1 at %s degrees', slope => {
    const cs = slope <= 5 ? 1 : (70 - slope) / (70 - 5);
    const pf = 0.7 * 1 * 1 * (20 * psf);
    const pm = slope < 15 ? Math.min(20 * psf, 30 * psf) : 0;
    const required = Math.max(cs * pf, pm);
    const { plan, pressures } = run('us', kind, slope);
    for (const p of pressures) expect(p).toBeCloseTo(required, 6);
    expect(plan.unsupportedKeys.map(x => x.key)).toContain('loads.asce7.snow.unsupported.notCovered');
    expect(plan.cases.filter(c => c.type === 'S')).toHaveLength(1);
  });
  it.each([0, 10, 20, 29.99])('EN 1991-1-3 eq 5.1, Table 5.2 and Figures 5.2/5.3 at %s degrees', slope => {
    const required = 0.8 * 1 * 1 * 1;
    const { plan, pressures } = run('eurocode', kind, slope);
    for (const p of pressures) expect(p).toBeCloseTo(required, 6);
    expect(plan.unsupportedKeys.map(x => x.key)).toContain('loads.ec.snow.notCovered');
    if (kind === 'gable' && slope > 1) expect(plan.cases.filter(c => c.type === 'S')).toHaveLength(3);
  });
  it.each([0, 10, 20, 29.99])('TS 498 clauses 7/8 and Tables 3/4 at %s degrees', slope => {
    const pk0 = 0.95;
    const m = 1;
    for (const p of run('turkey', kind, slope).pressures) expect(p).toBeCloseTo(pk0 * m, 6);
  });
});

it('CIRSOC 104 section 6.1 unbalanced loads keep the actual gable slope', () => {
  const { plan, layout, model } = run('cirsoc', 'gable', 20);
  const ps = (0.7 * 1 * 1 * 1 * 1) * ((70 - 20) / (70 - 5));
  const lee = 1.5 * ps / 1;
  const indices = plan.cases.map((c, i) => c.nameKey === 'snow.case.unbalanced' ? i : -1).filter(i => i >= 0);
  expect(indices).toHaveLength(2);
  for (const i of indices) {
    const pressures = layout.pieces.filter(pc => pc.roof && pc.wI > 1e-6).map(pc => {
      const e = model.elements.get(pc.elementId)!;
      const y = (model.nodes.get(e.nodeI)!.y + model.nodes.get(e.nodeJ)!.y) / 2;
      const expected = Math.abs(y - 3) < 0.01 ? lee / 2 : (i === indices[0] ? y > 3 : y < 3) ? lee : 0;
      const d = plan.distributed.find(d => d.caseIndex === i && d.elementId === pc.elementId && (d.a ?? 0) === (pc.a ?? 0));
      expect(d ? -d.q / pc.wI : 0).toBeCloseTo(expected, 6);
      return expected;
    });
    expect(Math.max(...pressures)).toBeCloseTo(lee, 6);
  }
});

it('ASCE 7-22 section 7.6.1 requires more than the balanced load on a simply supported short gable, and the omission is warned', () => {
  const { plan, pressures } = run('us', 'gable', 20);
  const requiredLeeward = 20 * psf;
  const balanced = 0.7 * 1 * 1 * (20 * psf) * ((70 - 20) / (70 - 5));
  expect(requiredLeeward).toBeGreaterThan(balanced);
  for (const p of pressures) expect(p).toBeCloseTo(balanced, 6);
  expect(plan.cases.filter(c => c.type === 'S')).toHaveLength(1);
  expect(plan.unsupportedKeys.map(x => x.key)).toContain('loads.asce7.snow.unsupported.notCovered');
});

it('EN 1991-1-3 Table 5.2 mu2 at a 20 degree multi-span valley exceeds mu1; the adapter warns that section 5.3.4 is omitted', () => {
  const { plan, pressures } = run('eurocode', 'gable', 20, auditMultiSpan(20));
  const mu2 = 0.8 + 0.8 * 20 / 30;
  const valley = mu2 * 1 * 1 * 1;
  expect(valley).toBeCloseTo(1.3333333333333333, 12);
  for (const p of pressures) expect(p).toBeLessThan(valley);
  expect(plan.unsupportedKeys.map(x => x.key)).toContain('loads.ec.snow.notCovered');
});
