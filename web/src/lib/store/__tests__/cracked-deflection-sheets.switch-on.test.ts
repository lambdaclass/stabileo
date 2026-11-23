/**
 * A beam designed in the reinforcement sheets deflects on the cracked section of the bars the
 * sheets adopted: the bottom bars at midspan for Icr, the top bars there for ρ′ and λΔ. Before any
 * bars are adopted it keeps the gross section and λΔ = 2.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { historyStore, modelStore, resultsStore, uiStore } from '../index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../active-results';
import { recognizePhysicalElements } from '../physical';
import { adoptAll, buildSheetRows, setAdopted } from '../rc-sheets.svelte';
import { deflectionChecks } from '../serviceability';
import { sheetBeamBars } from '../rc-sheets-reinforcement';
import { designData } from '../design-data';
import { faceLayout, groupsArea } from '../../rc-sheets/bars';
import { crackedInertia, longTermMultiplier } from '../../codes/cirsoc201/effective-inertia';

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear(); historyStore.clear(); resultsStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = false;
});
afterEach(() => { uiStore.analysisMode = '3d'; });

/** A two-span 30×60 H-30 beam on three 40×40 columns, 30 kN/m D and 10 kN/m L, checked against L/250. */
function frame(): number[] {
  const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
  const col = modelStore.addSection({ name: '40×40', a: 0.16, iy: 0.4 ** 4 / 12, iz: 0.4 ** 4 / 12, j: 0.1406 * 0.4 ** 4, b: 0.4, h: 0.4, shape: 'rect' } as never);
  const bm = modelStore.addSection({ name: '30×60', a: 0.18, iy: 0.3 * 0.6 ** 3 / 12, iz: 0.6 * 0.3 ** 3 / 12, j: 0.0037, b: 0.3, h: 0.6, shape: 'rect' } as never);
  const base = [0, 6, 12].map((x) => modelStore.addNode(x, 0, 0));
  const top = [0, 6, 12].map((x) => modelStore.addNode(x, 0, 3));
  const cols = base.map((b, i) => modelStore.addElement(b, top[i]!, 'frame'));
  const beams = [modelStore.addElement(top[0]!, top[1]!, 'frame'), modelStore.addElement(top[1]!, top[2]!, 'frame')];
  for (const c of cols) { modelStore.updateElementSection(c, col); modelStore.updateElementMaterial(c, conc); }
  for (const b of beams) { modelStore.updateElementSection(b, bm); modelStore.updateElementMaterial(b, conc); }
  for (const b of base) modelStore.addSupport(b, 'fixed3d');
  const D = modelStore.model.loadCases.find((c) => c.type === 'D')!.id;
  const L = modelStore.model.loadCases.find((c) => c.type === 'L')!.id;
  for (const b of beams) { modelStore.addDistributedLoad3D(b, 0, 0, -30, -30, undefined, undefined, D); modelStore.addDistributedLoad3D(b, 0, 0, -10, -10, undefined, undefined, L); }
  modelStore.addCombination('1.2D + 1.6L', [{ caseId: D, factor: 1.2 }, { caseId: L, factor: 1.6 }]);
  modelStore.setDeflectionLimits({ rules: [{ id: 1, scope: { kind: 'memberKind', value: 'beam' }, n: 250, direction: 'resultant' }] });
  recognizePhysicalElements();
  const b = modelStore.solveCombinations3D(false, false, true);
  if (!b || typeof b === 'string') throw new Error(String(b));
  publishCombinations3D(b);
  return beams;
}

/** What the check must read for a span: its own Icr and λΔ from the bars at midspan. */
function expected(bottom: Parameters<typeof groupsArea>[0], top: Parameters<typeof groupsArea>[0], stirrupDia: number) {
  const cover = designData().covers.beam;
  const As = groupsArea(bottom) * 1e-4, AsPrime = groupsArea(top) * 1e-4;
  const d = 0.6 - faceLayout(bottom, 0.3, cover, stirrupDia).centroidFromFace;
  const dPrime = faceLayout(top, 0.3, cover, stirrupDia).centroidFromFace;
  return { Icr: crackedInertia({ b: 0.3, h: 0.6, d, dPrime, As, AsPrime, n: 200000 / 27000 }).Icr, lambda: longTermMultiplier(AsPrime / (0.3 * d)) };
}

describe('the cracked deflection reads the bars the reinforcement sheets adopted', () => {
  it('nothing adopted: the gross section and λΔ = 2', () => {
    const beams = frame();
    const row = deflectionChecks(beams).rows.get(beams[0]!)!;
    expect(row.family).toBe('concrete');
    expect(row.cracked).toBeUndefined();
    expect(row.check.deltaTotal).toBeCloseTo(row.measured * 3, 9);
  });

  it('the spans adopted: Icr from the bottom bars at midspan, λΔ from the top bars there', () => {
    const beams = frame();
    const rows = buildSheetRows();
    expect(rows.beam).toHaveLength(2);
    adoptAll(rows.beam);
    const after = buildSheetRows();
    for (const [k, id] of beams.entries()) {
      const r = after.beam.find((x) => x.key.endsWith(`:${k}`))!;
      const at = r.adopted.at!.span!;
      const want = expected(at.bottom, at.top, r.adopted.stirrups.dia);
      const row = deflectionChecks([id]).rows.get(id)!;
      expect(row.cracked?.bars).toBe('sheets');
      expect(row.cracked!.Icr).toBeCloseTo(want.Icr, 10);
      expect(row.cracked!.lambda).toBeCloseTo(want.lambda, 10);
      // The continuous top bars are compression steel at midspan: λΔ below the gross section's 2.
      expect(row.cracked!.lambda).toBeLessThan(2);
      expect(row.check.deltaTotal).toBeCloseTo(row.measured * row.cracked!.scale * (1 + row.cracked!.lambda), 9);
    }
  });

  it('only the line adopted: each span reads the line\'s run bars, its extra bottom bars and the supports\' top bars', () => {
    const beams = frame();
    const rows = buildSheetRows();
    const line = rows.line[0]!;
    setAdopted(line.key, line.proposed, false);
    const read = sheetBeamBars();
    for (const [k, id] of beams.entries()) {
      const bars = read(id)!;
      expect(bars.from).toBe('line');
      expect(bars.key).toBe(`beam:${line.group}:${k}`);
      expect(groupsArea(bars.span.bottom)).toBeCloseTo(groupsArea([line.proposed.bottom, line.proposed.spanBottom[k]!]), 9);
      expect(groupsArea(bars.span.top)).toBeCloseTo(groupsArea([line.proposed.top]), 9);
      expect(groupsArea(bars.start.top)).toBeCloseTo(groupsArea([line.proposed.top, line.proposed.supportTop[k]!]), 9);
      expect(groupsArea(bars.end.top)).toBeCloseTo(groupsArea([line.proposed.top, line.proposed.supportTop[k + 1]!]), 9);
      const want = expected(bars.span.bottom, bars.span.top, bars.stirrupDia);
      const row = deflectionChecks([id]).rows.get(id)!;
      expect(row.cracked?.bars).toBe('sheets');
      expect(row.cracked!.Icr).toBeCloseTo(want.Icr, 10);
    }
  });
});
