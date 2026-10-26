/**
 * Spectral load cases, from the review of PRO 25:
 *
 *  · the directions add by the 100/30 rule (or SRSS), each worked out from the modes on its own;
 *    one oblique excitation per mode read a corner column's N 3.09 where the rule gives 4.10;
 *  · a combination taking a spectral case keeps the rest of the combination as solved (P-Delta,
 *    shells), and one with no second-order equilibrium gets no result; a nonlinear model refuses
 *    such combinations by name;
 *  · reactions only at the real supports, the components they restrain, a spring's as −k·u;
 *  · a vertical case asks for modes until Z has its mass, and says so when it cannot;
 *  · an Sd table, and a table from T = 0, read alike by the case and the engine;
 *  · the mode shapes imposed on the modes' own structure: linear (a tension-only brace is a brace)
 *    and on the centerline (member offsets as the modes have them);
 *  · a user table refuses negative ordinates and a period twice; a case on the code's spectrum
 *    whose scale the regulation no longer gives is said; "All loads" does not add a spectral case;
 *    the statics check does not flag spectral cases or the combinations taking them.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { modelStore } from '../../store/model.svelte';
import { historyStore } from '../../store/history.svelte';
import { uiStore } from '../../store/ui.svelte';
import { regulationsStore } from '../../store/regulations.svelte';
import '../../store';
import { initSolver } from '../wasm-solver';
import { dynamicInput } from '../../store/dynamic-input';
import * as spectralCase from '../spectral-case';
import { userSa, userSpectrumPointsInG, G, type UserSpectrum } from '../spectral-case';
import * as spectralStore from '../../store/spectral-cases';
import { publishCombinations3D } from '../../store/active-results';
import { staticsRows } from '../../store/statics-rows';
import { singleSolveFactors } from '../case-effects';
import { t } from '../../i18n';
import type { AnalysisResults3D } from '../types-3d';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); modelStore.setResultScopes(null);
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro';
});
afterEach(() => { uiStore.analysisMode = '3d'; });

/** A frame, 5 m × 4 m bays, 3 m storeys, fixed feet unless `feet` says otherwise. */
function frame(storeys = 2, feet?: (n: number, i: number) => void) {
  const at = (x: number, y: number, z: number) => modelStore.addNode(x, y, z);
  const grid: number[][] = [];
  for (let s = 0; s <= storeys; s++) grid.push([at(0, 0, 3 * s), at(5, 0, 3 * s), at(5, 4, 3 * s), at(0, 4, 3 * s)]);
  for (let s = 0; s < storeys; s++) {
    for (let i = 0; i < 4; i++) modelStore.addElement(grid[s]![i]!, grid[s + 1]![i]!);
    for (let i = 0; i < 4; i++) modelStore.addElement(grid[s + 1]![i]!, grid[s + 1]![(i + 1) % 4]!);
  }
  grid[0]!.forEach((n, i) => (feet ? feet(n, i) : modelStore.addSupport(n, 'fixed3d' as never)));
  return grid;
}

/** A flat user spectrum, 0.4 g. */
function flat() {
  modelStore.setDynamics({ spectra: [{ id: 1, name: 'flat', ordinate: 'Sa', unit: 'g', interpolation: 'linear', points: [[0, 0.4], [5, 0.4]] }] });
}

function spectral(name: string, factors: { x: number; y: number; z: number }, extra: Record<string, unknown> = {}) {
  const id = modelStore.addLoadCase(name, 'E');
  modelStore.updateLoadCaseFields(id, { spectral: { source: { kind: 'user', spectrumId: 1 }, factors, rule: 'cqc', xi: 0.05, scale: 1, ...extra } as never });
  return id;
}

/** The cases' results, whichever shape the store hands them in. */
function results(): Map<number, AnalysisResults3D> {
  const r = spectralStore.spectralCaseResults() as unknown;
  if (typeof r === 'string') throw new Error(r);
  return r instanceof Map ? r : (r as { results: Map<number, AnalysisResults3D> }).results;
}
const warnings = (): string[] => {
  const r = spectralStore.spectralCaseResults() as unknown;
  return r && typeof r === 'object' && 'warnings' in r ? (r as { warnings: string[] }).warnings : [];
};

const ef = (r: AnalysisResults3D, e: number) => r.elementForces.find((x) => x.elementId === e)!;
const disp = (r: AnalysisResults3D, n: number) => r.displacements.find((d) => d.nodeId === n)!;

describe('directions', () => {
  it('each direction on its own, then |Ex| + 0.3·|Ey|: a corner column’s N', () => {
    frame(); flat();
    const ex = spectral('Ex', { x: 1, y: 0, z: 0 }), ey = spectral('Ey', { x: 0, y: 1, z: 0 });
    const e = spectral('E', { x: 1, y: 0.3, z: 0 }), minus = spectral('E−', { x: 1, y: -0.3, z: 0 });
    const s = spectral('Es', { x: 1, y: 0.3, z: 0 }, { directions: 'srss' });
    const r = results();
    const n = (id: number) => ef(r.get(id)!, 1).nStart;
    // Engine values (snapshots), with the support-coupled mass in the participation since
    // #434 (they were 2.828 / 4.236 / 4.099 with the free block only). The rule is what is
    // asserted: |Ex| + 0.3·|Ey|.
    expect(Math.abs(n(ex))).toBeCloseTo(2.869, 3);
    expect(Math.abs(n(ey))).toBeCloseTo(4.332, 3);
    expect(Math.abs(n(e))).toBeCloseTo(Math.abs(n(ex)) + 0.3 * Math.abs(n(ey)), 9);
    expect(Math.abs(n(e))).toBeCloseTo(4.168, 3);
    // The sense across does not matter; the sign is the main direction's.
    expect(n(minus)).toBeCloseTo(n(e), 9);
    expect(Math.sign(n(e))).toBe(Math.sign(n(ex)));
    expect(Math.abs(n(s))).toBeCloseTo(Math.hypot(n(ex), 0.3 * n(ey)), 9);
  });

  it('the rule on its own: percentages, SRSS, the main direction’s sign', () => {
    expect(spectralCase.directionCombine('percentage', [1, 0.3], [-2, 4])).toBeCloseTo(-3.2, 12);
    expect(spectralCase.directionCombine('percentage', [0.3, 1], [-2, 4])).toBeCloseTo(4.6, 12);
    expect(spectralCase.directionCombine('srss', [1, 0.3], [3, 4])).toBeCloseTo(Math.hypot(3, 1.2), 12);
  });
});

describe('combinations taking a spectral case', () => {
  /** A 4 m cantilever column, 180 kN down with a nudge in D; a spectral case along Y. */
  function column() {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 4);
    modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d' as never);
    const D = modelStore.addLoadCase('D', 'D');
    modelStore.addNodalLoad3D(b, 0, 0.12, -180, 0, 0, 0, D);
    flat();
    const E = spectral('E', { x: 0, y: 1, z: 0 });
    return { a, b, D, E };
  }
  const solve = (spec: Map<number, AnalysisResults3D>) => {
    const r = modelStore.solveCombinations3D(false, false, true, spec);
    if (!r || typeof r === 'string') throw new Error(String(r));
    return r;
  };

  it('P-Delta: the rest second order, the spectral part added; none past buckling', () => {
    const { b, D, E } = column();
    const rest = modelStore.addCombination('0.2 D', [{ caseId: D, factor: 0.2 }]);
    const with_ = modelStore.addCombination('0.2 D + E', [{ caseId: D, factor: 0.2 }, { caseId: E, factor: 1 }]);
    const past = modelStore.addCombination('3 D + E', [{ caseId: D, factor: 3 }, { caseId: E, factor: 1 }]);
    modelStore.setAnalysis({ perCombination: 'pdelta' });
    const spec = results();
    const r = solve(spec);
    const second = disp(r.perCombo.get(rest)!, b).uy;
    const e = disp(spec.get(E)!, b).uy;
    // Amplified: the P-Delta sway is more than the linear one.
    expect(Math.abs(second)).toBeGreaterThan(1.01 * Math.abs(0.2 * disp(r.perCase.get(D)!, b).uy));
    expect(disp(r.perCombo.get(with_)!, b).uy).toBeCloseTo(second + e, 12);
    expect(r.perCombo.get(with_)!.secondOrder).toBeDefined();
    expect(r.perCombo.has(past)).toBe(false);
    expect(r.unstable).toContain(past);
  });

  it('a nonlinear model refuses them, by name', () => {
    const grid = frame(1); flat();
    const D = modelStore.addLoadCase('D', 'D');
    modelStore.addNodalLoad3D(grid[1]![0]!, 0, 0, -10, 0, 0, 0, D);
    const E = spectral('E', { x: 1, y: 0, z: 0 });
    modelStore.updateElement(1, { behaviour: 'compressionOnly' } as never);
    modelStore.addCombination('D + E', [{ caseId: D, factor: 1 }, { caseId: E, factor: 1 }]);
    const r = modelStore.solveCombinations3D(false, false, true, results());
    expect(r).toBe(t('svc.spectralNonlinear').replace('{names}', 'D + E'));
  });

  it('shells keep their stresses: the spectral part alone, and added to a solved rest', () => {
    const grid = frame(1); flat();
    const mat = [...modelStore.materials.keys()][0]!;
    // A wall in the first bay along X: the sway shears it.
    const slab = modelStore.addQuad([grid[0]![0]!, grid[0]![1]!, grid[1]![1]!, grid[1]![0]!], mat, 0.15);
    const D = modelStore.addLoadCase('D', 'D');
    for (const n of grid[1]!) modelStore.addNodalLoad3D(n, 0, 0, -20, 0, 0, 0, D);
    const E = spectral('E', { x: 1, y: 0, z: 0 });
    const alone = modelStore.addCombination('1.2 E', [{ caseId: E, factor: 1.2 }]);
    const both = modelStore.addCombination('D + E', [{ caseId: D, factor: 1 }, { caseId: E, factor: 1 }]);
    const only = modelStore.addCombination('D', [{ caseId: D, factor: 1 }]);
    const spec = results();
    const r = solve(spec);
    const q = (x: AnalysisResults3D | undefined) => x?.quadStresses?.find((s) => s.elementId === slab);
    const e = q(spec.get(E))!;
    expect(e).toBeDefined();
    expect(e.vonMises).toBeGreaterThanOrEqual(0);
    // The component the earthquake moves most.
    const keys = ['sigmaXx', 'sigmaYy', 'tauXy', 'mx', 'my', 'mxy'] as const;
    const k = keys.reduce((a, b) => (Math.abs(e[b]) > Math.abs(e[a]) ? b : a));
    expect(Math.abs(e[k])).toBeGreaterThan(1e-3);
    expect(q(r.perCombo.get(alone))?.[k]).toBeCloseTo(1.2 * e[k], 9);
    expect(q(r.perCombo.get(both))?.[k]).toBeCloseTo(q(r.perCombo.get(only))![k] + e[k], 9);
    expect(q(r.perCombo.get(both))!.vonMises).toBeGreaterThan(0);
  });
});

describe('reactions', () => {
  it('only the real supports, the components they hold, a spring’s −k·u', () => {
    const k = { kx: 5e4, ky: 5e4, kz: 5e4, krx: 1e3, kry: 1e3, krz: 1e3 };
    const grid = frame(2, (n, i) => {
      if (i === 1) modelStore.addSupport(n, 'pinned3d' as never);
      else if (i === 2) modelStore.addSupport(n, 'spring3d' as never, k);
      else modelStore.addSupport(n, 'fixed3d' as never);
    });
    flat();
    const ex = spectral('Ex', { x: 1, y: 0.3, z: 0 });
    const r = results().get(ex)!;
    expect(r.reactions.map((x) => x.nodeId).sort((a, b) => a - b)).toEqual([...grid[0]!].sort((a, b) => a - b));
    const pinned = r.reactions.find((x) => x.nodeId === grid[0]![1])!;
    expect([pinned.mx, pinned.my, pinned.mz]).toEqual([0, 0, 0]);
    expect(Math.abs(pinned.fx)).toBeGreaterThan(0);
    const spring = r.reactions.find((x) => x.nodeId === grid[0]![2])!;
    const u = disp(r, grid[0]![2]!);
    expect(Math.abs(u.ux)).toBeGreaterThan(0);
    expect(Math.abs(spring.fx)).toBeCloseTo(k.kx * Math.abs(u.ux), 9);
    expect(Math.abs(spring.fz)).toBeCloseTo(k.kz * Math.abs(u.uz), 9);
    expect(Math.abs(spring.my)).toBeCloseTo(k.kry * Math.abs(u.ry), 9);
  });
});

describe('vertical excitation', () => {
  it('a Z case asks for modes until Z has its mass, and reads the weight times Sa', () => {
    const grid = frame(10); flat();
    const ez = spectral('Ez', { x: 0, y: 0, z: 1 });
    const r = results().get(ez)!;
    const w = warnings();
    // The foot of a corner column: under a flat 0.4 g, about 0.4 of its share of the weight.
    const D = modelStore.addLoadCase('Dw', 'D');
    modelStore.setAnalysis({ selfWeight: [{ caseId: D, direction: 'Z', factor: -1 }] } as never);
    const sw = modelStore.solve3D(false, false, true);
    if (!sw || typeof sw === 'string') throw new Error(String(sw));
    const nz = Math.abs(ef(r, 1).nStart), nw = Math.abs(ef(sw, 1).nStart);
    expect(nw).toBeGreaterThan(0);
    if (w.length === 0) expect(nz / nw).toBeGreaterThan(0.3);
    else expect(w.join(' ')).toMatch(/Z/);
    void grid;
  });

  it('when Z cannot have its mass, the case says how much moved', () => {
    // Every node's vertical held but the top's: the modes run out before 90 % moves in Z.
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 4);
    modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed3d' as never);
    flat();
    spectral('Ez', { x: 0, y: 0, z: 1 });
    const r = spectralStore.spectralCaseResults() as unknown as { warnings?: string[] };
    expect(typeof r).toBe('object');
    expect(r.warnings?.some((x) => x.includes('Z'))).toBe(true);
  });
});

describe('user spectra', () => {
  const sd: UserSpectrum = { id: 1, name: 'sd', ordinate: 'Sd', unit: 'm', interpolation: 'linear', points: [[0.5, 0.02], [2, 0.02]] };
  /** The engine's reading of a table (`spectral.rs` `interpolate_spectrum`): linear, the ends held. */
  const engineAt = (pts: Array<{ period: number; sa: number }>, t: number) => {
    if (t <= pts[0]!.period) return pts[0]!.sa;
    if (t >= pts[pts.length - 1]!.period) return pts[pts.length - 1]!.sa;
    const i = pts.findIndex((p, k) => t >= p.period && t <= pts[k + 1]!.period);
    const a = pts[i]!, b = pts[i + 1]!;
    return a.sa + (b.sa - a.sa) * (t - a.period) / (b.period - a.period);
  };

  it('an Sd table holds Sa below its first period, as the engine’s table does', () => {
    const atFirst = 0.02 * (2 * Math.PI / 0.5) ** 2;
    expect(userSa(sd, 0.05)).toBeCloseTo(atFirst, 9);
    expect(userSa(sd, 0.05) / G).toBeLessThan(1);
    const table = userSpectrumPointsInG(sd);
    for (const t of [0.05, 0.3, 0.7, 1.3, 2, 3.5]) expect(engineAt(table, t)).toBeCloseTo(userSa(sd, t) / G, 3);
  });

  it('the default spectrum starts at T = 0 for the engine too: 0.64 g at 0.2 s', () => {
    const def: UserSpectrum = { id: 1, name: 'd', ordinate: 'Sa', unit: 'g', interpolation: 'linear', points: [[0, 0.4], [0.5, 1], [1, 0.5], [3, 0.17]] };
    expect(userSa(def, 0.2) / G).toBeCloseTo(0.64, 12);
    expect(engineAt(userSpectrumPointsInG(def), 0.2)).toBeCloseTo(0.64, 12);
  });

  it('a table with a negative ordinate or a period twice is refused, and says which', () => {
    const parse = (spectralCase as unknown as { parseSpectrumTable?: (s: string) => unknown }).parseSpectrumTable;
    expect(parse).toBeDefined();
    expect(parse!('0; 0.4\n0.5; -1')).toEqual({ error: 'negative' });
    expect(parse!('0; 0.4\n0.5; 1\n0.5; 0.8')).toEqual({ error: 'duplicate' });
    expect(parse!('0,5; 1\n0; 0,4')).toEqual({ points: [[0, 0.4], [0.5, 1]] });
    expect(parse!('0.5; 1')).toEqual({ error: 'rows' });
    const panel = readFileSync(join(process.cwd(), 'src/components/pro/dynamics/ProUserSpectra.svelte'), 'utf8');
    expect(panel).toMatch(/parseSpectrumTable/);
    expect(panel).toMatch(/userSpectrum\.negative/);
    expect(panel).toMatch(/userSpectrum\.duplicate/);
  });

  it('a spectrum deleted leaves its number unused: a new one is not taken by a case on the old', () => {
    frame(1);
    const spectrum = (sa: number) => (id: number): UserSpectrum => ({ id, name: `S${id}`, ordinate: 'Sa', unit: 'g', interpolation: 'linear', points: [[0, sa], [5, sa]] });
    modelStore.addUserSpectrum(spectrum(0.4));
    const s2 = modelStore.addUserSpectrum(spectrum(0.8));
    const ex = modelStore.addLoadCase('Ex', 'E');
    modelStore.updateLoadCaseFields(ex, { spectral: { source: { kind: 'user', spectrumId: s2 }, factors: { x: 1, y: 0, z: 0 }, rule: 'cqc', xi: 0.05, scale: 1 } as never });
    // Refused while the case is on it, and says which case.
    expect(modelStore.removeUserSpectrum(s2)).toBe(false);
    expect(modelStore.casesOnSpectrum(s2).map((c) => c.name)).toEqual(['Ex']);
    // Off the case, it goes; the next spectrum takes a new number, also after a save and a load.
    modelStore.updateLoadCaseFields(ex, { spectral: { source: { kind: 'code' }, factors: { x: 1, y: 0, z: 0 }, rule: 'cqc', xi: 0.05, scale: 1 } as never });
    expect(modelStore.removeUserSpectrum(s2)).toBe(true);
    const saved = JSON.parse(JSON.stringify(modelStore.snapshot()));
    modelStore.clear();
    modelStore.restore(saved);
    expect(modelStore.addUserSpectrum(spectrum(0.4))).not.toBe(s2);
    // A file without the counter, whose case names a spectrum it lost: that number is not given.
    delete saved.nextId.spectrum;
    saved.loadCases.find((c: { id: number }) => c.id === ex).spectral.source = { kind: 'user', spectrumId: s2 };
    modelStore.restore(saved);
    expect(modelStore.addUserSpectrum(spectrum(0.4))).not.toBe(s2);
    expect(typeof spectralStore.spectralCaseResults()).toBe('string');
  });
});

describe('the structure the mode shapes are imposed on', () => {
  it('linear: a tension-only brace reads as the modal analysis has it', () => {
    const grid = frame(1); flat();
    const b1 = modelStore.addElement(grid[0]![0]!, grid[1]![1]!, 'truss');
    const b2 = modelStore.addElement(grid[0]![1]!, grid[1]![0]!, 'truss');
    const e = spectral('E', { x: 1, y: 0, z: 0 });
    const linear = results().get(e)!;
    for (const b of [b1, b2]) modelStore.updateElement(b, { behaviour: 'tensionOnly' } as never);
    const oneWay = results().get(e)!;
    expect(Math.abs(ef(linear, b1).nStart)).toBeGreaterThan(0);
    for (const b of [b1, b2]) expect(ef(oneWay, b).nStart).toBeCloseTo(ef(linear, b).nStart, 9);
  });

  it('member offsets: the spectral case is refused by name, not solved on the centerline', () => {
    /*
     * Changed with the design stack (`store/dynamic-input.ts`): the modes, the mass source and the
     * spectral cases are built on the node lines, without the helper nodes and rigid arms that carry
     * a declared insertion. This read the centred answer as the model's (and pinned that it equals
     * the engine's spectral analysis of the same centred input); the dynamic input now refuses a
     * model with member or shell offsets by name, as it refuses sliding and 3D joints, while the
     * static solve and the combinations expand the offsets. The stricter reading is kept.
     */
    uiStore.analysisMode = '3d';
    const grid = frame(2); flat();
    modelStore.setElementsOffset([1, 2, 3, 4], { frame: 'global', i: { x: 0.2, y: 0, z: 0 }, j: { x: 0.2, y: 0, z: 0 } });
    spectral('E', { x: 1, y: 0, z: 0 }, { rule: 'srss' });
    expect(() => dynamicInput()).toThrow(t('advanced.offsetsUnsupported'));
    void grid;
  });
});

describe('around the case', () => {
  it('a case on the code’s spectrum whose scale the regulation no longer gives is said', () => {
    const stale = (spectralStore as unknown as { staleCodeScale?: (d: unknown) => number | null }).staleCodeScale;
    expect(stale).toBeDefined();
    const binding = regulationsStore.binding('seismic');
    const now = (spectralStore as unknown as { codeSpectrumScale: () => number }).codeSpectrumScale();
    expect(stale!({ source: { kind: 'code' }, scale: now })).toBeNull();
    expect(stale!({ source: { kind: 'code' }, scale: now + 0.1 })).toBeCloseTo(now, 12);
    expect(stale!({ source: { kind: 'user', spectrumId: 1 }, scale: 7 })).toBeNull();
    const details = readFileSync(join(process.cwd(), 'src/components/pro/loads/ProCaseDetails.svelte'), 'utf8');
    expect(details).toMatch(/spectralCase\.scaleStale/);
    void binding;
  });

  it('"All loads" does not add a spectral case', () => {
    const cases = [{ id: 1, type: 'D', name: 'D' }, { id: 2, type: 'E', name: 'E', spectral: { source: { kind: 'code' }, factors: { x: 1, y: 0, z: 0 }, rule: 'cqc', xi: 0.05, scale: 1 } }];
    const f = singleSolveFactors(cases as never, { legacySelfWeight: false })!;
    expect(f.get(1)).toBe(1);
    expect(f.get(2) ?? 0).toBe(0);
  });

  it('the statics check does not flag a spectral case or the combinations taking it, and names them', () => {
    const grid = frame(1); flat();
    const D = modelStore.addLoadCase('D', 'D');
    modelStore.addNodalLoad3D(grid[1]![0]!, 0, 0, -10, 0, 0, 0, D);
    const E = spectral('E', { x: 1, y: 0, z: 0 });
    const k = modelStore.addCombination('D + E', [{ caseId: D, factor: 1 }, { caseId: E, factor: 1 }]);
    const r = modelStore.solveCombinations3D(uiStore.includeSelfWeight, false, true, results());
    if (!r || typeof r === 'string') throw new Error(String(r));
    publishCombinations3D(r);
    const rows = staticsRows()!;
    expect(rows.cases.some((x) => x.caseId === E)).toBe(false);
    expect(rows.combos.some((x) => x.comboId === k)).toBe(false);
    expect(rows.cases.find((x) => x.caseId === D)!.worstRelative).toBeLessThan(1e-6);
    expect((rows as unknown as { spectral?: string[] }).spectral).toEqual(['E', 'D + E']);
  });

  it('a pushover target never reached is said', () => {
    const view = readFileSync(join(process.cwd(), 'src/components/pro/nonlinear/PushoverView.svelte'), 'utf8');
    expect(view).toMatch(/cut\.reached/);
    expect(view).toMatch(/pro\.po\.targetUnreached/);
  });
});
