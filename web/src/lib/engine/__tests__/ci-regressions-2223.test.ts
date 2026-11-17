import { beforeAll, afterEach, expect, it } from 'vitest';
import { initSolver } from '../wasm-solver';
import { ALL_DICTS } from '../../i18n/locales/all';
import { ensureLocale, setLocale, tp } from '../../i18n';
import { validateMemberLoadInterval, MEMBER_GEOMETRY_LIMIT } from '../member-span-loads';
import { modelFeatures, ANALYSIS_KINDS } from '../../provenance/model-features';
import { conditionHolds } from '../../provenance/applicability';
import totals from '../../provenance/result-changes/compensated-applied-force-totals.json';
import model from '../../../../../engine/tests/fixtures/narrow-span-2222.json';

let wasm: any;
const wrong = process.env.RUN_KNOWN_WRONG === '2223' ? it : it.skip;
beforeAll(async () => { await initSolver(); wasm = await import('../../wasm/dedaliano_engine.js'); });
afterEach(() => setLocale('en'));

for (const dim of [2, 3]) wrong(`known wrong result: #2223 — ${dim}D decimal endpoints keep force through every solver`, () => {
  for (const b of [0.2 - 2 ** -55, 0.2, 0.2 + 2 ** -55]) for (const axial of [false, true]) {
    const input: any = structuredClone(model);
    for (const node of Object.values(input.nodes) as any[]) { node.x = 0.4 + (node.id - 1) * (0.6 - 0.4); node.z = 0; if (dim === 3) node.y = 0; }
    input.nodes['2'].x = 0.6;
    for (const section of Object.values(input.sections) as any[]) Object.assign(section, { iy: 1, j: 1 });
    if (dim === 3) for (const support of Object.values(input.supports) as any[]) Object.assign(support, { rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true });
    const base = structuredClone(input); base.loads = [];
    const session = new wasm[`LoadSession${dim}D`](base);
    input.loads = [{ type: dim === 2 && axial ? 'axialDistributed' : 'distributed', data: dim === 2
      ? { elementId: 1, qI: -2, qJ: -4, a: 0, b }
      : { elementId: 1, qXI: axial ? -2 : 0, qXJ: axial ? -4 : 0, qYI: 0, qYJ: 0, qZI: axial ? 0 : -2, qZJ: axial ? 0 : -4, a: 0, b } }];
    try {
      for (const mode of ['linear', 'session', 'pdelta', 'corotational', 'fiber']) {
        const run = () => mode === 'linear' ? wasm[`solve_${dim}d`](input)
          : mode === 'session' ? session.solve(input.loads)
          : mode === 'pdelta' ? JSON.parse(wasm[`solve_pdelta_${dim}d`](JSON.stringify(input), 20, 1e-9)).results
          : mode === 'corotational' ? JSON.parse(wasm[`solve_corotational_${dim}d`](JSON.stringify(input), 40, 1e-12, 1)).results
          : JSON.parse(wasm[`solve_fiber_nonlinear_${dim}d`](JSON.stringify({ solver: input, fiberSections: {}, nIntegrationPoints: 5, maxIter: 40, tolerance: 1e-9, nIncrements: 1 }))).results;
        if (b > 0.2) expect(run, mode).toThrow(/invalid distributed load interval/);
        else {
          const result = run();
          const key = axial ? dim === 2 ? 'rx' : 'fx' : dim === 2 ? 'rz' : 'fz';
          expect(result.reactions.reduce((s: number, r: any) => s + r[key], 0), mode).toBeCloseTo(3 * b, 10);
        }
      }
    } finally { session.free(); }
  }
});

wrong('known wrong result: #2223 — force summaries require applied actions in a saved model', () => {
  const empty = { elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1 }]] } as const;
  const features = (loads: any[]) => modelFeatures({ ...empty, elements: [...empty.elements] as any, loads }, { analysesRun: ['modal'], analysesRecorded: ANALYSIS_KINDS });
  expect(conditionHolds(totals.when, features([]))).toBe(false);
  for (const loads of [
    [{ type: 'nodal', data: { nodeId: 1, fz: 1 } }],
    [{ type: 'nodal3d', data: { nodeId: 1, fx: 1 } }],
    [{ type: 'distributed', data: { elementId: 1, qI: -2, qJ: -4 } }],
  ]) expect(conditionHolds(totals.when, features(loads))).toBe(true);
});

for (const [locale, dict] of Object.entries(ALL_DICTS)) wrong(`known wrong result: #2223 — ${locale} retains interval details in localized refusals`, async () => {
  for (const key of ['engine.memberLoad.invalidInterval', 'engine.memberLoad.geometryLimit']) {
    expect(dict[key], key).toBeTypeOf('string');
    for (const parameter of ['id', 'a', 'b', 'length']) expect(dict[key], key).toContain(`{${parameter}}`);
  }
  expect(dict['engine.memberLoad.geometryLimit']).toContain('{limit}');
  if (!['en', 'es', 'pt', 'de', 'fr', 'tr', 'hu'].includes(locale)) return;
  await ensureLocale(locale);
  setLocale(locale);
  for (const [a, b, key] of [[-1, 3, 'invalidInterval'], [1, 1, 'geometryLimit']] as const) {
    expect(() => validateMemberLoadInterval(17, a, b, 3)).toThrow(tp(`engine.memberLoad.${key}`, { id: 17, a, b, length: 3, limit: MEMBER_GEOMETRY_LIMIT }));
  }
  expect(() => validateMemberLoadInterval(17, 0, 3, 3)).not.toThrow();
});
