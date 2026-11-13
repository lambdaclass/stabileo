import { expect, it } from 'vitest';
import { auditRoof } from './snow-slope-audit-fixture';
import { gravityLayout } from '../plan-gravity';
import { buildLoadPlan } from '../load-plan';
import { planInput } from '../../../codes/__tests__/family-plan-helpers';
import { snowLoadCases } from '../snow-loads';
import { stepRoof } from './snow-step-fixture';
import { driftAndSlidingLoads } from '../snow-drift-loads';

it.skip('known wrong result: #2082: CIRSOC 104 section 7.1 retains drift at a low step beside a pitched roof', () => {
  const model = auditRoof('gable', 20);
  for (const n of model.nodes.values()) {
    n.y /= 3;
    if ((n.z ?? 0) >= 3) n.z = 3 + ((n.z ?? 0) - 3) / 3;
  }
  let nid = 100, eid = 100;
  const upper = [[-6, 0], [0, 0], [0, 2], [-6, 2]].map(([x, y]) => {
    const id = nid++;
    model.nodes.set(id, { id, x: x!, y: y!, z: 3.45 });
    return id;
  });
  for (let i = 0; i < 4; i++) {
    const id = eid++;
    model.elements.set(id, { id, nodeI: upper[i]!, nodeJ: upper[(i + 1) % 4]!, sectionId: 1, materialId: 1 });
  }
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  const snow = { pg: 1, terrain: 'C' as const, exposure: 'partial' as const, thermal: 'normal' as const, category: 'II' as const, roofKind: 'gable' as const, slippery: true, partial: false };
  const plan = buildLoadPlan(planInput('cirsoc', { model, gravity: { mode: 'panels' }, tributaryWidth: 1, snow: { ...snow, enabled: true, source: 'site' } }));
  expect(plan.outcome).toBe('READY');
  expect(plan.blockedKeys).toEqual([]);
  const out = snowLoadCases({ model, snow, tributaryWidth: 1, layout })!;
  const gamma = 0.426 * 1 + 2.2;
  const requiredBalanced = 1 * ((70 - 20) / 65);
  const hb = requiredBalanced / gamma;
  const hc = 0.45 - hb;
  const flatHb = 1 / gamma;
  expect(hc / hb).toBeGreaterThan(0.2);
  expect((0.45 - flatHb) / flatHb).toBeLessThan(0.2);
  const hd = 0.381;
  expect(hd).toBeGreaterThan(hc);
  const requiredWidth = Math.min(4 * hd * hd / hc, 8 * hc);
  expect(requiredWidth).toBeGreaterThan(0);
  const requiredPeak = requiredBalanced + Math.min(hd, hc) * gamma;
  expect(requiredPeak).toBeCloseTo(1.1817, 6);
  const pieces = layout.pieces.filter(p => p.panel === 0 && p.wI > 0);
  const pressures = out.cases.map(c => pieces.map(p => {
    const d = c.distributed.find(d => d.elementId === p.elementId && d.a === p.a && d.b === p.b);
    return d ? -d.q / p.wI : 0;
  }));
  console.info(JSON.stringify({ planOutcome: plan.outcome, warnings: plan.unsupportedKeys, requiredBalanced, hb, hc, requiredPeak, generatedBalanced: [Math.min(...pressures[0]!), Math.max(...pressures[0]!)], maximumAcrossCases: Math.max(...pressures.flat()), derivation: out.derivation }));
  expect(out.derivation.map(d => d.key)).toContain('snow.derivation.drift');
  expect(pressure(out.cases[0]!.distributed, 1, 0)).toBeCloseTo(1.1817, 6);
});


const snow = { pg: 1, terrain: 'C' as const, exposure: 'partial' as const, thermal: 'normal' as const, category: 'II' as const, roofKind: 'gable' as const, slippery: true, partial: false };

function pressure(loads: Array<{ elementId: number; q: number; qJ?: number; a?: number; b?: number }>, id: number, x: number) {
  return -loads.filter(d => d.elementId === id && (d.a ?? 0) <= x && (d.b === undefined || d.b > x)).reduce((v, d) => {
    const t = d.b === undefined ? 0 : (x - (d.a ?? 0)) / (d.b - (d.a ?? 0));
    return v + d.q + ((d.qJ ?? d.q) - d.q) * t;
  }, 0);
}

function required(ps: number, h: number) {
  const gamma = 0.426 * 1 + 2.2, hb = ps / gamma, hc = Math.max(0, h - hb), hd = 0.381;
  return ps + (hc / hb < 0.2 ? 0 : gamma * Math.min(hd, hc));
}

it.skip.each([0, 0.37])('known wrong result: #2082: local step height along a pitched lower roof, rotation %s', angle => {
  const model = stepRoof(20, 0, 0.45, angle);
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  const out = snowLoadCases({ model, snow, layout, tributaryWidth: 1 })!;
  const loads = out.cases[0]!.distributed;
  const ps = (70 - 20) / 65;
  expect(pressure(loads, 1, 0)).toBeCloseTo(required(ps, 0.45), 6);
  const L = 1 / Math.cos(20 * Math.PI / 180);
  expect(pressure(loads, 1, L / 2)).toBeCloseTo(required(ps, 0.45 - 0.5 * Math.tan(20 * Math.PI / 180)), 6);
});

it.skip.each([1.199, 1.201])('known wrong result: #2082: local hc/hb on either side of 0.2, height/hb %s', ratio => {
  const ps = (70 - 20) / 65, hb = ps / (0.426 + 2.2);
  const model = stepRoof(20, 0, ratio * hb);
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  const out = snowLoadCases({ model, snow, layout, tributaryWidth: 1 })!;
  expect(pressure(out.cases[0]!.distributed, 1, 0)).toBeCloseTo(required(ps, ratio * hb), 6);
  expect(out.derivation.some(d => d.key === 'snow.derivation.drift')).toBe(ratio > 1.2);
  expect(out.derivation.find(d => d.key === 'snow.derivation.drift' || d.key === 'snow.derivation.noDrift')!.params!.hb).toBeCloseTo(Math.round(hb * 1000) / 1000, 6);
});

it.skip.each([0.45, 1.5])('known wrong result: #2082: capped and uncapped hd at a pitched lower roof, height %s', height => {
  const model = stepRoof(20, 0, height);
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  const direct = snowLoadCases({ model, snow, layout, tributaryWidth: 1 })!;
  const plan = buildLoadPlan(planInput('cirsoc', { model, gravity: { mode: 'panels' }, tributaryWidth: 1, snow: { ...snow, enabled: true, source: 'site' } }));
  const index = plan.cases.findIndex(c => c.type === 'S');
  const want = required((70 - 20) / 65, height);
  expect(pressure(direct.cases[0]!.distributed, 1, 0)).toBeCloseTo(want, 6);
  expect(pressure(plan.distributed.filter(d => d.caseIndex === index), 1, 0)).toBeCloseTo(want, 6);
});

it.skip('known wrong result: #2082: a flat lower roof reads the pitched upper surface locally', () => {
  const model = stepRoof(0, 20, 0.45);
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  const out = snowLoadCases({ model, snow, layout, tributaryWidth: 1 })!;
  const piece = layout.pieces.find(p => p.panel === 0 && p.wI > 0)!;
  const extras = out.cases[0]!.distributed.filter(d => d.elementId === piece.elementId && d.a !== undefined);
  expect(extras.some(d => Math.abs(d.qJ ?? d.q) > Math.abs(d.q))).toBe(true);
});

it.each(['us', 'eurocode', 'uk', 'turkey'] as const)('%s explicitly warns about omitted step drift and sliding', family => {
  for (const [lo, hi] of [[20, 0], [0, 20], [20, 20]]) {
    const model = stepRoof(lo, hi, 0.45, 0.37);
    const plan = buildLoadPlan(planInput(family, { model, gravity: { mode: 'panels' }, tributaryWidth: 1,
      codeInputs: {
        'asce7-22-snow': { pg: 1, ce: 1, ct: 1, riskCategory: 'II' },
        'en1991-1-3': { sk: 1, roof: 'duopitch', exposure: 'normal', ct: 1 },
        'en1991-1-3-uk': { zone: 2, altitude: 100, roof: 'duopitch', exposure: 'normal', ct: 1 },
        'ts498-1997-snow': { zone: 'II', altitudeM: 900 },
      }, snow: { ...snow, enabled: true, source: 'site' },
    }));
    const warning = family === 'us' ? 'loads.asce7.snow.unsupported.notCovered' : family === 'turkey' ? 'loads.tr.snow.note.uniformOnly' : 'loads.ec.snow.notCovered';
    expect(plan.cases.some(c => c.type === 'S')).toBe(true);
    expect(plan.unsupportedKeys.map(m => m.key)).toContain(warning);
  }
});

it.each([0, 20])('no-step control retains balanced snow at %s degrees', slope => {
  const model = auditRoof('gable', slope);
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  const out = snowLoadCases({ model, snow, layout, tributaryWidth: 1 })!;
  expect(out.derivation.some(d => d.key === 'snow.derivation.drift')).toBe(false);
  expect(out.cases[0]!.distributed.length).toBeGreaterThan(0);
});

it.skip('known wrong result: #2082: sliding snow reaches the actual pitched lower surface', () => {
  const model = stepRoof(20, 0, 0.6);
  let nid = 300, eid = 300;
  for (const y of [0, 2]) {
    model.nodes.set(nid, { id: nid, x: 0, y, z: 3.6 });
    model.nodes.set(nid + 1, { id: nid + 1, x: -6, y, z: 4.2 });
    model.elements.set(eid, { id: eid, nodeI: nid, nodeJ: nid + 1, sectionId: 1, materialId: 1 });
    nid += 2; eid++;
  }
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  const inputs = { pg: 1, balanced: (70 - 20) / 65, pf: 1, tributaryWidth: 1 };
  const sliding = driftAndSlidingLoads(model, layout, { ...inputs, slippery: true });
  const retained = driftAndSlidingLoads(model, layout, { ...inputs, slippery: false });
  expect(sliding.derivation.some(d => d.key === 'snow.derivation.sliding')).toBe(true);
  expect(pressure(sliding.distributed, 1, 0) - pressure(retained.distributed, 1, 0)).toBeCloseTo(0.4 * 1 * 6 / 4.5, 6);
});

it.skip('known wrong result: #2082: independent steps on either side of the same pitched roof', () => {
  const model = stepRoof(20, 0, 0.45);
  const other = stepRoof(20, 0, 0.8);
  for (const n of other.nodes.values()) if (n.id > 100) model.nodes.set(n.id + 300, { ...n, id: n.id + 300, x: 6 - n.x });
  for (const e of other.elements.values()) if (e.id > 100) model.elements.set(e.id + 300, { ...e, id: e.id + 300, nodeI: e.nodeI + 300, nodeJ: e.nodeJ + 300 });
  const layout = gravityLayout(model, { mode: 'panels', tributaryWidth: 1 });
  const out = snowLoadCases({ model, snow, layout, tributaryWidth: 1 })!;
  const right = [...model.elements.values()].find(e => {
    const a = model.nodes.get(e.nodeI)!, b = model.nodes.get(e.nodeJ)!;
    return a.x === 6 && b.x === 6 && a.y === 0 && b.y === 1;
  })!;
  expect(pressure(out.cases[0]!.distributed, 1, 0)).toBeCloseTo(required((70 - 20) / 65, 0.45), 6);
  expect(pressure(out.cases[0]!.distributed, right.id, 0)).toBeCloseTo(required((70 - 20) / 65, 0.8), 6);
});
