import { beforeAll, afterEach, expect, it, vi } from 'vitest';
import { GRAVITY_SELF_WEIGHT } from '../analysis-settings';
import { initSolver } from '../wasm-solver';
import { ALL_DICTS } from '../../i18n/locales/all';
import { ensureLocale, setLocale, tp, t, OFFERED_LOCALES } from '../../i18n';
import { validateMemberLoadInterval, MEMBER_GEOMETRY_LIMIT } from '../member-span-loads';
import { modelFeatures, ANALYSIS_KINDS } from '../../provenance/model-features';
import { conditionHolds } from '../../provenance/applicability';
import totals from '../../provenance/result-changes/compensated-applied-force-totals.json';
import model from '../../../../../engine/tests/fixtures/narrow-span-2222.json';

let wasm: any;
beforeAll(async () => { await initSolver(); wasm = await import('../../wasm/dedaliano_engine.js'); });
afterEach(() => setLocale('en'));

for (const dim of [2, 3]) it(`known wrong result: #2223 — ${dim}D decimal endpoints keep force through every solver`, () => {
  for (const angle of [0, 0.37, -0.37]) for (const b of [0.2 - 2 ** -55, 0.2, 0.2 + 2 ** -55]) for (const axial of [false, true]) {
    const input: any = structuredClone(model);
    for (const node of Object.values(input.nodes) as any[]) {
      const station = node.id === 2 ? 0.6 : 0.4 + (node.id - 1) * (0.6 - 0.4);
      node.x = station * Math.cos(angle); node.z = station * Math.sin(angle);
      if (dim === 3) { node.y = node.z; node.z = 0; }
    }
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
          const axes = dim === 2 ? ['rx', 'rz'] : ['fx', 'fy', 'fz'];
          const sums = axes.map(key => result.reactions.reduce((s: number, r: any) => s + r[key], 0));
          expect(Math.hypot(...sums), mode).toBeCloseTo(3 * b, 10);
        }
      }
    } finally { session.free(); }
  }
});

it('known wrong result: #2223 — unloaded modal-only models omit the force-summary notice', () => {
  const empty = { elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1 }]] } as const;
  const features = (loads: any[]) => modelFeatures({ ...empty, elements: [...empty.elements] as any, loads }, { analysesRun: ['modal'], analysesRecorded: ANALYSIS_KINDS });
  expect(conditionHolds(totals.when, features([]))).toBe(false);
  for (const loads of [
    [{ type: 'nodal', data: { nodeId: 1, fz: 1 } }],
    [{ type: 'nodal3d', data: { nodeId: 1, fx: 1 } }],
    [{ type: 'distributed', data: { elementId: 1, qI: -2, qJ: -4 } }],
  ]) expect(conditionHolds(totals.when, features(loads))).toBe(true);
});

for (const [locale, dict] of Object.entries(ALL_DICTS)) it(`known wrong result: #2223 — ${locale} retains interval details in localized refusals`, async () => {
  for (const key of ['engine.memberLoad.invalidInterval', 'engine.memberLoad.geometryLimit']) {
    expect(dict[key], key).toBeTypeOf('string');
    for (const parameter of ['id', 'a', 'b', 'length']) expect(dict[key], key).toContain(`{${parameter}}`);
  }
  expect(dict['engine.memberLoad.geometryLimit']).toContain('{limit}');
  if (!(OFFERED_LOCALES as readonly string[]).includes(locale)) return;
  await ensureLocale(locale);
  setLocale(locale);
  expect(t('engine.memberLoad.invalidInterval')).toBe(dict['engine.memberLoad.invalidInterval']);
  expect(t('engine.memberLoad.geometryLimit')).toBe(dict['engine.memberLoad.geometryLimit']);
  for (const [a, b, key] of [[-1, 3, 'invalidInterval'], [1, 1, 'geometryLimit']] as const) {
    expect(() => validateMemberLoadInterval(17, a, b, 3)).toThrow(tp(`engine.memberLoad.${key}`, { id: 17, a, b, length: 3, limit: MEMBER_GEOMETRY_LIMIT }));
  }
  expect(() => validateMemberLoadInterval(17, 0, 3, 3)).not.toThrow();
});

for (const dim of [2, 3]) it(`${dim}D WASM preserves non-finite refusal records through combinations`, () => {
  const result: any = { displacements: [], reactions: [], elementForces: [], structuredDiagnostics: [
    { code: 'non_finite_result', severity: 'error', message: 'The result was withheld: non-finite force' },
  ] };
  if (dim === 3) Object.assign(result, { plateStresses: [], quadStresses: [], quadNodalStresses: [] });
  expect(() => wasm[`combine_results_${dim}d`]({ factors: [{ caseId: 1, factor: 1 }], cases: [{ caseId: 1, results: result }] })).toThrow(/non_finite_result/);
  expect(() => wasm[`compute_envelope_${dim}d`]([result])).toThrow(/non_finite_result/);
});

it('self-weight summaries remain applicable with an explicit gravity rule', () => {
  const snapshot: any = { elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1 }]], loads: [] };
  for (const gravity of [{ analysis: { selfWeight: [{ caseId: 1, gz: -1 }] } }, { includeSelfWeight: true }]) {
    expect(conditionHolds(totals.when, modelFeatures({ ...snapshot, ...gravity }))).toBe(true);
  }
});

it('opening a self-weight-only frame retains its force-summary notice', async () => {
  const { modelStore, uiStore } = await import('../../store');
  const { recheckStore } = await import('../../store/recheck.svelte');
  const { onProjectOpened } = await import('../../store/file');
  const wasSelfWeight = uiStore.includeSelfWeight;
  recheckStore.reset();
  modelStore.clear();
  modelStore.addElement(modelStore.addNode(0, 0), modelStore.addNode(1, 0), 'frame');
  try {
    for (const mode of ['2d', '3d', 'pro']) for (const enabled of [false, true]) for (const rule of [undefined, [], [{ caseId: 1, ...GRAVITY_SELF_WEIGHT }]]) {
      modelStore.withoutUndo(() => modelStore.setAnalysis({ selfWeight: rule }));
      recheckStore.reset();
      const snapshot = { ...modelStore.snapshot(), solvedWith: { ...recheckStore.capture()!, resultsVersion: 4, analyses: ['modal'], recorded: [...ANALYSIS_KINDS] } } as any;
      uiStore.includeSelfWeight = enabled;
      onProjectOpened(snapshot, mode);
      await vi.waitFor(() => expect(recheckStore.pending).toBe(false));
      const expected = !!rule?.length || (enabled && (mode !== 'pro' || rule === undefined));
      expect(recheckStore.assessment!.changes.some(c => c.id === totals.id), `${mode}, toggle=${enabled}, rule=${JSON.stringify(rule)}`).toBe(expected);
    }
  } finally {
    uiStore.includeSelfWeight = wasSelfWeight;
    modelStore.clear();
    recheckStore.reset();
  }
});

it('force-producing and unknown histories retain notices after loads are edited away', () => {
  const snapshot: any = { elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1 }]], loads: [] };
  for (const analysesRun of [null, ['linear'], ['pdelta'], ['nonlinear'], ['timeHistory']]) {
    expect(conditionHolds(totals.when, modelFeatures(snapshot, { analysesRun, analysesRecorded: ANALYSIS_KINDS }))).toBe(true);
  }
});
