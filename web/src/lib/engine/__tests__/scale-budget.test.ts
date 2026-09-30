/**
 * The budget at project scale, measured on a model of about 5 000 members: a 13 × 13 bay frame,
 * ten storeys (1 690 columns, 3 120 beams), three load cases and four combinations.
 *
 * What is timed is what a user waits for after the solve: the result tables across the
 * combinations (every view, stations along members), the report's HTML with every section, and
 * the scene's batched members, picking and nodes. Measured on the development machine
 * (2026-09-27): tables 91 ms, report 105 ms, scene 16 ms. The budgets are some fifteen times
 * that, so a slower CI runner and ordinary noise pass and a regression of an order of magnitude
 * does not. The solve itself is the engine's and is not budgeted here.
 */
import { describe, it, expect, beforeAll } from 'vitest';

// The scene's text sprites draw to a canvas; stubbed headless as the other scene tests do.
const canvasStub = { width: 0, height: 0, getContext: () => ({ fillStyle: '', font: '', textAlign: 'center', textBaseline: 'middle', fillText: () => {}, measureText: () => ({ width: 10 }) }) };
if (typeof document === 'undefined') Object.defineProperty(globalThis, 'document', { value: { createElement: () => canvasStub }, configurable: true });

import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store/index';
import { initSolver } from '../wasm-solver';
import { publishCombinations3D, activePerCombo3D } from '../../store/active-results';
import { allRows, summaryRows, envelopeRows, rowsOf, type Source } from '../result-tables';
import { generateReportHtml, type ReportData, type ReportConfig } from '../pro-report';
import { ElementsBatched } from '../../three/elements-batched';
import { ElementsPicking } from '../../three/elements-picking';
import { NodesInstanced } from '../../three/nodes-instanced';
import en from '../../i18n/locales/en';

const BAYS = 13, STOREYS = 10, SPAN = 6, H = 3;
/** This run's times, ms. */
const MEASURED = { tables: 0, report: 0, scene: 0 };
const BUDGET = { tables: 1500, report: 2000, scene: 500 };

let sources: Source[] = [];

beforeAll(async () => {
  await initSolver();
  uiStore.analysisMode = 'pro';
  modelStore.clear();
  const id = new Map<string, number>();
  for (let k = 0; k <= STOREYS; k++) for (let j = 0; j <= BAYS; j++) for (let i = 0; i <= BAYS; i++) {
    id.set(`${i},${j},${k}`, modelStore.addNode(i * SPAN, j * SPAN, k * H));
  }
  const n = (i: number, j: number, k: number) => id.get(`${i},${j},${k}`)!;
  for (let j = 0; j <= BAYS; j++) for (let i = 0; i <= BAYS; i++) modelStore.addSupport(n(i, j, 0), 'fixed3d');
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  const D = modelStore.addLoadCase('D', 'D'), L = modelStore.addLoadCase('L', 'L'), W = modelStore.addLoadCase('W', 'W');
  modelStore.batch(() => {
    for (let k = 1; k <= STOREYS; k++) {
      for (let j = 0; j <= BAYS; j++) for (let i = 0; i <= BAYS; i++) modelStore.addElement(n(i, j, k - 1), n(i, j, k), 'frame');
      for (let j = 0; j <= BAYS; j++) for (let i = 0; i < BAYS; i++) {
        const e = modelStore.addElement(n(i, j, k), n(i + 1, j, k), 'frame');
        modelStore.addDistributedLoad3D(e, 0, 0, -15, -15, undefined, undefined, D);
        modelStore.addDistributedLoad3D(e, 0, 0, -6, -6, undefined, undefined, L);
      }
      for (let j = 0; j < BAYS; j++) for (let i = 0; i <= BAYS; i++) modelStore.addElement(n(i, j, k), n(i, j + 1, k), 'frame');
      modelStore.addNodalLoad3D(n(0, 0, k), 20, 0, 0, 0, 0, 0, W);
    }
  });
  modelStore.addCombination('1.4D', [{ caseId: D, factor: 1.4 }]);
  modelStore.addCombination('1.2D+1.6L', [{ caseId: D, factor: 1.2 }, { caseId: L, factor: 1.6 }]);
  modelStore.addCombination('1.2D+L+W', [{ caseId: D, factor: 1.2 }, { caseId: L, factor: 1 }, { caseId: W, factor: 1 }]);
  modelStore.addCombination('0.9D+W', [{ caseId: D, factor: 0.9 }, { caseId: W, factor: 1 }]);
  const r = modelStore.solveCombinations3D(false, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  publishCombinations3D(r);
  sources = [...activePerCombo3D()].map(([cid, results]) => ({ id: cid, name: String(cid), results }));
}, 300_000);

describe('at about 5 000 members', () => {
  it('is the model it says', () => {
    expect(modelStore.elements.size).toBe(STOREYS * ((BAYS + 1) ** 2 + 2 * BAYS * (BAYS + 1)));
    expect(sources).toHaveLength(4);
  });

  it('the result tables, every view across the combinations', () => {
    const t0 = performance.now();
    for (const kind of ['reactions', 'forces', 'displacements'] as const) {
      allRows(kind, sources, { resultant: true }, 'entity');
      summaryRows(kind, sources, { resultant: true });
      envelopeRows(kind, sources, { resultant: true });
    }
    rowsOf('forces', sources[0]!.results, { stations: 5 });
    MEASURED.tables = performance.now() - t0;
    expect(MEASURED.tables).toBeLessThan(BUDGET.tables);
  });

  it('the report, every section', () => {
    const cfg = { companyName: '', companyLogo: null, sections: { modelData: true, results: true, verification: false, advancedAnalysis: false, storyDrift: false, diagnostics: false, quantities: false, loads: true, envelope: true, statics: true, deflections: true, figures: false } } as ReportConfig;
    const data = {
      projectName: 'Scale', date: '2026-09-27',
      nodes: [...modelStore.nodes.values()], elements: [...modelStore.elements.values()],
      materials: [...modelStore.materials.values()], sections: [...modelStore.sections.values()], supports: [...modelStore.supports.values()],
      loadCount: modelStore.loads.length, results: sources[0]!.results, verifications: [], resultSets: sources, config: cfg,
      t: (k: string) => (en as Record<string, string>)[k] ?? k,
    } as unknown as ReportData;
    const t0 = performance.now();
    const html = generateReportHtml(data);
    MEASURED.report = performance.now() - t0;
    expect(html.length).toBeGreaterThan(1e6);
    expect(MEASURED.report).toBeLessThan(BUDGET.report);
  });

  it('the scene: batched members, picking and nodes', () => {
    const t0 = performance.now();
    const eb = new ElementsBatched(), ep = new ElementsPicking(), ni = new NodesInstanced();
    for (const [nid, nd] of modelStore.nodes) ni.upsert(nid, nd.x, nd.y, nd.z ?? 0);
    for (const [eid, e] of modelStore.elements) {
      const a = modelStore.nodes.get(e.nodeI)!, b = modelStore.nodes.get(e.nodeJ)!;
      eb.upsert(eid, a.x, a.y, a.z ?? 0, b.x, b.y, b.z ?? 0);
      ep.upsert(eid, { x: a.x, y: a.y, z: a.z ?? 0 }, { x: b.x, y: b.y, z: b.z ?? 0 });
      eb.setBaseColor(eid, 0x888888);
    }
    eb.flush();
    MEASURED.scene = performance.now() - t0;
    expect(eb.count).toBe(modelStore.elements.size);
    expect(MEASURED.scene).toBeLessThan(BUDGET.scene);
  });
});
