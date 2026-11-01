/**
 * The certificates beyond the base linear solve, as the results UI reads them
 * (docs/verification/CERTIFY.md): load cases, combinations and the envelope; the certificate
 * bundle; the design checks; and the modal, P-Delta, spectral, harmonic, time-history and plastic
 * certificates computed in the background from the job their solve noted (`certify-tags.ts`).
 * Against the real engine.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import {
  initSolver, solveModal, solvePDelta, solveSpectral, solveModal3D, solveHarmonic3D, solveTimeHistory3D, hasCertify, callCertify,
} from '../wasm-solver';
import { solveCombinations2D, buildSolverInput3D, type ModelData } from '../solver-service';
import { certifyJobOf, tagCertifyJob } from '../certify-tags';
import { runCertifyJob } from '../certify-jobs';
import { modeEnclosureOf, frequencyInterval, modalCutoffHz, plasticReading } from '../certificate-read';
import { memberContexts, runOtherCode, certifyOtherCode } from '../design/other-codes';
import { AISC360 } from '../design/other-codes/steel-codes';
import { massDensities, spectralModesFrom, timeHistoryFields, G } from '../dynamics/requests';
import { formatEnclosure, formatDirected } from '../../utils/certificate-format';
import type { ModalCertificate, PDeltaCertificate, SpectralCertificate, HarmonicCertificate, DynamicsCertificate } from '../certificate-types';

beforeAll(async () => { await initSolver(); });

const E = 200_000_000;

/** Cantilever 2D, fixed at node 1: dead load down and wind sideways at the tip, two combinations. */
function cantilever2D(): ModelData {
  return {
    nodes: new Map([[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 5, y: 0 }]]),
    elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]]),
    materials: new Map([[1, { id: 1, e: E, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
    loads: [
      { type: 'nodal', data: { id: 1, nodeId: 2, fx: 0, fz: -10, my: 0, caseId: 1 } },
      { type: 'nodal', data: { id: 2, nodeId: 2, fx: 4, fz: 0, my: 0, caseId: 2 } },
    ],
  } as never;
}
const cases = [{ id: 1, type: 'D', name: 'Dead' }, { id: 2, type: 'W', name: 'Wind' }] as never;
const combos = [
  { id: 10, name: 'C1', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }] },
  { id: 11, name: 'C2', factors: [{ caseId: 1, factor: 0.9 }, { caseId: 2, factor: -1.6 }] },
] as never;

describe('certified combinations and envelope', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('certifies each case, combination and the envelope of a published bundle, and shows the one on screen', async () => {
    const { resultsStore } = await import('../../store');
    const { certificateStore } = await import('../../store/certificate.svelte');
    const r = solveCombinations2D(cantilever2D(), cases, combos);
    if (!r || typeof r === 'string') throw new Error(String(r));
    resultsStore.clear();
    resultsStore.setCombinationResults(r.perCase, r.perCombo, r.envelope);
    expect(certificateStore.multiState.status).toBe('pending');
    await vi.runAllTimersAsync();
    expect(certificateStore.multiState.status).toBe('done');

    resultsStore.activeComboId = 10;
    resultsStore.activeView = 'combo';
    const combo = certificateStore.shown(false);
    expect(combo.status).toBe('done');
    if (combo.status !== 'done') return;
    expect(combo.scope).toBe('combo');
    expect(combo.certificate.status).toBe('certified');
    if (combo.certificate.status === 'certified') {
      expect(combo.certificate.relBound).toBeNull();
      expect(combo.certificate.absBound).toBeLessThan(1e-6);
    }
    expect(certificateStore.forceBound(false, 1)).not.toBeNull();

    resultsStore.activeView = 'envelope';
    const env = certificateStore.shown(false);
    expect(env.status === 'done' && env.scope).toBe('envelope');
    expect(env.status === 'done' && env.certificate.status).toBe('certified');

    resultsStore.activeCaseId = 2;
    const wind = certificateStore.shown(false);
    expect(wind.status === 'done' && wind.scope).toBe('case');
    expect(wind.status === 'done' && wind.certificate.status).toBe('certified');

    resultsStore.clear();
    expect(certificateStore.multiState.status).toBe('idle');
  });

  it('leaves a bundle that is not the engine solve it came from alone', async () => {
    const { resultsStore } = await import('../../store');
    const { certificateStore } = await import('../../store/certificate.svelte');
    const r = solveCombinations2D(cantilever2D(), cases, combos);
    if (!r || typeof r === 'string') throw new Error(String(r));
    const copied = new Map([...r.perCombo].map(([k, v]) => [k, { ...v }]));
    resultsStore.setCombinationResults(new Map(), copied, r.envelope);
    expect(certificateStore.multiState.status).toBe('idle');
  });

  it('exports the base solve as a certificate bundle the Lean checker reads', async () => {
    const { resultsStore } = await import('../../store');
    const { certificateStore } = await import('../../store/certificate.svelte');
    const { validateAndSolve2D } = await import('../solver-service');
    const m = cantilever2D() as unknown as Record<string, unknown>;
    const results = validateAndSolve2D({ ...m, loads: (m.loads as unknown[]).slice(0, 1) } as never);
    if (typeof results !== 'object' || !results) throw new Error(String(results));
    resultsStore.clear();
    resultsStore.setResults(results);
    expect(certificateStore.canExportBundle(false)).toBe(false); // not certified yet
    await vi.runAllTimersAsync();
    expect(certificateStore.canExportBundle(false)).toBe(true);
    const text = await certificateStore.exportBundle(false);
    expect(typeof text).toBe('string');
    const bundle = JSON.parse(text!);
    expect(bundle.format).toBe('stabileo.linear-certificate.v2');
    expect(bundle.provenance.inputSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(bundle.provenance.kinds).toEqual(['linear-static']);
    expect(bundle.n).toBe(3);
    resultsStore.clear();
  });
});

describe('certified shell resultants', () => {
  it('bounds the resultants of each quad of a certified 3D base solve', async () => {
    vi.useFakeTimers();
    try {
      const { modelStore, resultsStore } = await import('../../store');
      const { certificateStore } = await import('../../store/certificate.svelte');
      const { validateAndSolve3D } = await import('../solver-service');
      modelStore.clear();
      const ids = [[0, 0], [2, 0], [2, 2], [0, 2]].map(([x, y]) => modelStore.addNode(x, y, 0));
      const mat = modelStore.addMaterial({ name: 'C30', e: 30_000, nu: 0.2, rho: 25 } as never);
      const q = modelStore.addQuad(ids as [number, number, number, number], mat, 0.2);
      for (const n of ids.slice(0, 2)) modelStore.addSupport(n, 'fixed3d');
      for (const n of ids.slice(2)) modelStore.addNodalLoad3D(n, 0, 0, -5, 0, 0, 0);
      const r = validateAndSolve3D(modelStore.model as never);
      if (!r || typeof r === 'string') throw new Error(String(r));
      resultsStore.setResults3D(r);
      await vi.runAllTimersAsync();
      const b = certificateStore.shellBound('quad', q);
      expect(b).not.toBeNull();
      expect(b!.mx).toBeGreaterThanOrEqual(0);
      expect(b!.mx).toBeLessThan(1e-3);
      resultsStore.clear3D();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('certified design checks', () => {
  const IPE300 = { name: 'IPE 300', a: 53.8e-4, iy: 8356e-8, iz: 603.8e-8, h: 0.3, b: 0.15, tw: 0.0071, tf: 0.0107, j: 20.1e-8, shape: 'I' as const };

  it('encloses each AISC 360 utilization the plain check reports, from the certified combinations', async () => {
    vi.useFakeTimers();
    try {
      const { modelStore, uiStore, resultsStore } = await import('../../store');
      const { certificateStore } = await import('../../store/certificate.svelte');
      uiStore.analysisMode = 'pro';
      modelStore.clear();
      const mat = modelStore.addMaterial({ name: 'S235', e: 200_000, nu: 0.3, rho: 78.5, fy: 235, fu: 360 } as never);
      const sec = modelStore.addSection(IPE300 as never);
      const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
      const el = modelStore.addElement(a, b, 'frame');
      modelStore.updateElementMaterial(el, mat);
      modelStore.updateElementSection(el, sec);
      modelStore.addSupport(a, 'custom3d', undefined, { dofRestraints: { tx: true, ty: true, tz: true, rx: true, ry: false, rz: false } });
      modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { tx: false, ty: true, tz: true, rx: false, ry: false, rz: false } });
      for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
      for (const c of [...modelStore.model.loadCases]) modelStore.removeLoadCase(c.id);
      const dead = modelStore.addLoadCase('D', 'D');
      modelStore.addDistributedLoad3D(el, 0, 0, -20, -20, undefined, undefined, dead);
      modelStore.addCombination('1.4D', [{ caseId: dead, factor: 1.4 }]);
      const r = modelStore.solveCombinations3D(false, false, true);
      if (!r || typeof r === 'string') throw new Error(String(r));
      resultsStore.setCombinationResults3D(r.perCase, r.perCombo, r.envelope);
      await vi.runAllTimersAsync();
      expect(certificateStore.multiState.status).toBe('done');

      const ctxs = memberContexts(modelStore.model as never, r.perCombo, modelStore.combinations);
      const plain = runOtherCode(AISC360, ctxs).rows.find((x) => x.elementId === el);
      expect(plain?.status).toBe('checked');
      if (plain?.status !== 'checked') return;

      const certs = await certifyOtherCode(AISC360, ctxs, (c, id) => certificateStore.comboStationBound3D(c, id), (n, args) => Promise.resolve(callCertify(n, args)));
      const c = certs.get(el);
      expect(c?.status).toBe(plain.reading.ratio < 1 ? 'ok' : 'fail');
      if (!c || c.status === 'uncertified') return;
      expect(c.lower).toBeLessThanOrEqual(plain.reading.ratio * (1 + 1e-12));
      expect(c.upper).toBeGreaterThanOrEqual(plain.reading.ratio * (1 - 1e-12));
      expect(c.upper - c.lower).toBeLessThan(1e-6);

      // Without a certified combination there is nothing to enclose the demands with.
      const none = await certifyOtherCode(AISC360, ctxs, () => null, (n, args) => Promise.resolve(callCertify(n, args)));
      expect(none.get(el)).toMatchObject({ status: 'uncertified', reason: 'otherCodes.cert.comboUncertified' });
      resultsStore.clear3D();
    } finally {
      vi.useRealTimers();
      const { uiStore } = await import('../../store');
      uiStore.analysisMode = '3d';
    }
  });
});

/** A 2D frame column, fixed at its base, with a mass at its top. */
function column2D(H = 0) {
  return {
    nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 0, z: 4 }]]),
    materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.0069, iz: 9.8e-5 }]]),
    elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, type: 'frame', hingeStart: false, hingeEnd: false }]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: H, fz: -200, my: 0 } }],
  } as never;
}

describe('analyses certified from the job their solve noted', () => {
  it('modal: every frequency enclosed, matched by value, none missed below the cutoff', async () => {
    const r = solveModal(column2D(), new Map([[1, 7850]]), 3);
    const job = certifyJobOf(r);
    expect(job?.name).toBe('certify_modal_2d');
    const { certificate } = await runCertifyJob(job!) as { certificate: ModalCertificate };
    expect(certificate.status).toBe('certified');
    for (const m of r.modes) {
      const e = modeEnclosureOf(certificate, m.frequency);
      expect(e, `mode at ${m.frequency} Hz`).not.toBeNull();
      const iv = frequencyInterval(e!);
      expect(iv.lo).toBeLessThanOrEqual(m.frequency);
      expect(iv.hi ?? Infinity).toBeGreaterThanOrEqual(m.frequency);
    }
    expect(modeEnclosureOf(certificate, r.modes[0].frequency * 1.01)).toBeNull();
    const cut = modalCutoffHz(certificate);
    if (cut !== null) expect(cut).toBeGreaterThan(r.modes[0].frequency);
  });

  it('P-Delta: the displacements bounded, the second-order state stable', async () => {
    const r = solvePDelta(column2D(5));
    const job = certifyJobOf(r);
    expect(job?.name).toBe('certify_pdelta_2d');
    const { certificate } = await runCertifyJob(job!) as { certificate: PDeltaCertificate };
    expect(certificate.status).toBe('certified');
    if (certificate.status === 'certified') {
      expect(certificate.absBound).toBeLessThan(1e-6);
      expect(certificate.stabilityMargin).not.toBeNull();
    }
  });

  it('spectral: the base shear enclosed and the reported one inside it', async () => {
    const modal = solveModal(column2D(), new Map([[1, 7850]]), 2);
    const r = solveSpectral({
      solver: column2D(), modes: modal.modes, densities: new Map([[1, 7850]]),
      spectrum: { name: 's', points: [{ period: 0, sa: 2 }, { period: 10, sa: 2 }] }, direction: 'X', rule: 'SRSS',
    });
    const job = certifyJobOf(r);
    expect(job?.name).toBe('certify_spectral_2d');
    const { certificate } = await runCertifyJob(job!) as { certificate: SpectralCertificate };
    if (certificate.status !== 'certified') throw new Error(certificate.reason);
    expect(certificate.baseShear.lo).toBeLessThanOrEqual(r.baseShear * (1 + 1e-9));
    expect(certificate.baseShear.hi).toBeGreaterThanOrEqual(r.baseShear * (1 - 1e-9));
  });

  it('harmonic and time history (3D): method reported, peak enclosed, scheme stable', async () => {
    const { modelStore } = await import('../../store/model.svelte');
    modelStore.clear();
    modelStore.restore({
      nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 3 }], [3, { id: 3, x: 4, y: 0, z: 3 }], [4, { id: 4, x: 4, y: 0, z: 0 }]],
      materials: [[1, { id: 1, name: 's', e: 200_000, nu: 0.3, rho: 78.5 }]],
      sections: [[1, { id: 1, name: 'c', a: 0.01, iz: 1e-4, iy: 1e-4, j: 2e-4 }]],
      elements: [
        [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }],
        [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1 }],
        [3, { id: 3, type: 'frame', nodeI: 4, nodeJ: 3, materialId: 1, sectionId: 1 }],
      ],
      supports: [[1, { id: 1, nodeId: 1, type: 'fixed3d' }], [2, { id: 2, nodeId: 4, type: 'fixed3d' }]],
      loads: [], loadCases: [{ id: 1, type: 'D', name: 'D' }], combinations: [],
      nextId: { node: 20, material: 10, section: 10, element: 20, support: 10, load: 10 },
    } as never);
    const input = buildSolverInput3D(modelStore.model as never, false, false, { expandMemberOffsets: false })!;
    const densities = Object.fromEntries([...massDensities(modelStore.materials)].map(([k, v]) => [String(k), v]));

    const h = solveHarmonic3D({ solver: input, densities, frequencies: [0.5, 1, 2], dampingRatio: 0.05, responseNodeId: 2, responseDof: 'x' });
    expect(typeof h.method).toBe('string');
    expect(certifyJobOf(h)?.name).toBe('certify_harmonic_3d');
    const hc = (await runCertifyJob(certifyJobOf(h)!) as { certificate: HarmonicCertificate }).certificate;
    if (hc.status !== 'certified') throw new Error(hc.reason);
    expect(hc.peakAmplitude.lo).toBeLessThanOrEqual(h.peakAmplitude + hc.maxReportedError);

    const steps = 40;
    const th = solveTimeHistory3D({
      solver: input,
      ...timeHistoryFields({
        densities: massDensities(modelStore.materials), dt: 0.01, nSteps: steps, direction: 'X',
        groundAccel: Array.from({ length: steps }, (_, i) => G * Math.sin(i / 3)), dampingXi: 0.05, method: 'newmark',
      }),
    });
    expect(certifyJobOf(th)?.name).toBe('certify_time_history_3d');
    const tc = (await runCertifyJob(certifyJobOf(th)!) as { certificate: DynamicsCertificate }).certificate;
    expect(tc.stabilityCertified).toBe(true);
    expect(tc.residual).not.toBeNull();

    // 3D modal through the guards: the job is the payload actually solved.
    const m3 = solveModal3D(input, massDensities(modelStore.materials), 2);
    expect(certifyJobOf(m3)?.name).toBe('certify_modal_3d');
    expect(spectralModesFrom(m3).length).toBeGreaterThan(0);
  });

  it('plastic: refuses before displaying a result or scheduling native certification', async () => {
    const { modelStore, uiStore } = await import('../../store');
    const { runPlasticCollapse } = await import('../../actions/plastic');
    uiStore.analysisMode = '2d';
    modelStore.clear();
    const mat = modelStore.addMaterial({ name: 'S235', e: 200_000, nu: 0.3, rho: 78.5, fy: 235 } as never);
    const sec = modelStore.addSection({ name: 'IPE 300', a: 53.8e-4, iz: 8356e-8, iy: 603.8e-8, h: 0.3, b: 0.15, tw: 0.0071, tf: 0.0107, shape: 'I' } as never);
    const n1 = modelStore.addNode(0, 0), n2 = modelStore.addNode(3, 0), n3 = modelStore.addNode(6, 0);
    for (const [i, j] of [[n1, n2], [n2, n3]]) {
      const e = modelStore.addElement(i, j, 'frame');
      modelStore.updateElementMaterial(e, mat);
      modelStore.updateElementSection(e, sec);
    }
    modelStore.addSupport(n1, 'fixed');
    modelStore.addSupport(n3, 'fixed');
    modelStore.addNodalLoad(n2, 0, -100);
    expect(() => runPlasticCollapse()).toThrow(/#758/);
  });

  it('the background certificate of a result: after it is shown, only for the one still shown', async () => {
    vi.useFakeTimers();
    try {
      const { createBackgroundCertificate } = await import('../../store/analysis-certificate.svelte');
      const cert = createBackgroundCertificate<{ certificate: ModalCertificate }>();
      const first = solveModal(column2D(), new Map([[1, 7850]]), 2);
      const second = solveModal(column2D(), new Map([[1, 7850]]), 3);
      cert.track(first);
      expect(cert.state.status).toBe('pending');
      cert.track(second); // superseded before it ran
      await vi.runAllTimersAsync();
      expect(cert.state.status).toBe('done');
      if (cert.state.status === 'done') expect(cert.state.job).toBe(certifyJobOf(second));
      cert.track(second); // the same result: nothing to do
      expect(cert.state.status).toBe('done');
      cert.track({ ...second }); // a copy carries no job
      expect(cert.state.status).toBe('idle');
      cert.track(null);
      expect(cert.state.status).toBe('idle');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads a λ outside the enclosure as outside, and round-off as inside', () => {
    const c = { certified: true, lambdaLower: 2, lambdaUpper: 2.000001, lowerSource: null, mechanism: [], solverCollapseFactor: null, solverWithinBounds: null, solverDeviation: null, reason: null };
    expect(plasticReading(c, 2.0000005).within).toBe(true);
    expect(plasticReading(c, 2 * (1 - 1e-14)).within).toBe(true);
    const out = plasticReading(c, 2.2);
    expect(out.within).toBe(false);
    expect(out.deviation).toBeCloseTo(0.2 / 2.2, 6);
  });

  it('a spread copy has no job, a frozen result is not tagged, and the exports exist', () => {
    const r = tagCertifyJob({ a: 1 }, { name: 'certify_modal_2d', args: [] });
    expect(certifyJobOf({ ...r })).toBeNull();
    expect(JSON.stringify(r)).toBe('{"a":1}');
    expect(certifyJobOf(tagCertifyJob(Object.freeze({ b: 1 }), { name: 'x', args: [] }))).toBeNull();
    for (const n of ['certify_multi_case_2d', 'certify_modal_3d', 'certify_plastic_2d', 'certify_steel_members', 'export_linear_bundle_3d']) {
      expect(hasCertify(n), n).toBe(true);
    }
  });
});

describe('certified enclosures as printed', () => {
  it('rounds each end outward', () => {
    expect(formatEnclosure(1.2345671, 1.2345679)).toBe('[1.23456, 1.23457]');
    expect(formatDirected(null, 'up')).toBe('∞');
    expect(formatDirected(2.5, 'down', 4)).toBe('2.5');
  });
});
