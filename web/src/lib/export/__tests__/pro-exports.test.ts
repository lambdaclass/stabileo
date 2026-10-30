/**
 * PRO's exports against a solved model with a slab: the workbook keeps the sheets and the sets
 * chosen, the DXF carries each content on its layer in the unit and projection asked for, the
 * figures draw the shells (as faces and as a result in colour, from a fixed view and from a set
 * other than the screen's), and the report places its figures where their tables go.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { unzipSync } from 'fflate';

/** What the CSV export hands the browser, kept to be read back. */
const downloads = vi.hoisted(() => [] as Array<{ blob: Blob; name: string }>);
vi.mock('../../store/file', async (orig) => ({
  ...(await orig<typeof import('../../store/file')>()),
  downloadBlob: (blob: Blob, name: string) => { downloads.push({ blob, name }); },
}));
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import { resultsStore } from '../../store/results.svelte';
import '../../store/index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../../store/active-results';
import { currentWorkbookSheets, downloadProjectCsv } from '../../store/project-workbook';
import { proDxf } from '../../pro/dxf-export';
import { DXF_CONTENTS, layerName, type DxfContents } from '../../dxf/writer';
import { DEFAULT_FIGURE_OPTIONS, figureTitle, plan2D, toSvg, type FigureOptions } from '../view-figure';
import { reportResultFigures } from '../../pro/report-export';
import { generateReportHtml, type ReportConfig, type ReportData } from '../../engine/pro-report';
import { resultSet, resultSetChoices } from '../../pro/export-results';
import { t } from '../../i18n';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); resultsStore.clear3D(); });

/** A portal frame in XZ carrying a slab out to a supported edge, two cases, two combinations. */
function slabFrame() {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3), c = modelStore.addNode(4, 0, 3), d = modelStore.addNode(4, 0, 0);
  // The slab, 2 × 2 elements from the beam to an edge on pins.
  const grid: number[][] = [];
  for (let j = 0; j <= 2; j++) {
    grid.push([]);
    for (let i = 0; i <= 2; i++) grid[j]!.push(j === 0 && i === 0 ? b : j === 0 && i === 2 ? c : modelStore.addNode(2 * i, 1.5 * j, 3));
  }
  modelStore.addElement(a, b, 'frame');
  const beam = modelStore.addElement(b, c, 'frame');
  modelStore.addElement(d, c, 'frame');
  modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(d, 'fixed3d');
  for (const n of grid[2]!) modelStore.addSupport(n, 'pinned3d');
  const mat = [...modelStore.materials.keys()][0]!;
  const quads: number[] = [];
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) quads.push(modelStore.addQuad([grid[j]![i]!, grid[j]![i + 1]!, grid[j + 1]![i + 1]!, grid[j + 1]![i]!], mat, 0.15));
  for (const x of [...modelStore.combinations]) modelStore.removeCombination(x.id);
  const dead = modelStore.addLoadCase('D', 'D'), wind = modelStore.addLoadCase('W', 'W');
  modelStore.addDistributedLoad3D(beam, 0, 0, -10, -10, undefined, undefined, dead);
  for (const q of quads) modelStore.addSurfaceLoad3D(q, 5, dead);
  modelStore.addNodalLoad3D(b, 8, 0, 0, 0, 0, 0, wind);
  const c1 = modelStore.addCombination('1.2D+1.6W', [{ caseId: dead, factor: 1.2 }, { caseId: wind, factor: 1.6 }]);
  const c2 = modelStore.addCombination('0.9D-W', [{ caseId: dead, factor: 0.9 }, { caseId: wind, factor: -1 }]);
  const r = modelStore.solveCombinations3D(uiStore.includeSelfWeight, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  publishCombinations3D(r);
  return { quads, dead, wind, c1, c2 };
}

const allOff: DxfContents = Object.fromEntries(DXF_CONTENTS.map((k) => [k, false])) as unknown as DxfContents;

/** The DXF's entities as [type, layer, the group codes after them]. */
function entities(dxf: string): Array<{ type: string; layer: string; codes: Map<string, string[]> }> {
  const lines = dxf.split('\n');
  const start = lines.indexOf('ENTITIES');
  const out: Array<{ type: string; layer: string; codes: Map<string, string[]> }> = [];
  for (let i = start + 1; i + 1 < lines.length; i += 2) {
    const code = lines[i]!, value = lines[i + 1]!;
    if (code === '0') {
      if (value === 'ENDSEC') break;
      out.push({ type: value, layer: '', codes: new Map() });
    } else if (out.length) {
      const e = out[out.length - 1]!;
      if (code === '8') e.layer = value;
      e.codes.set(code, [...(e.codes.get(code) ?? []), value]);
    }
  }
  return out;
}

describe('the workbook, sheet by sheet', () => {
  it('keeps only the sheets named, with the cover and the conventions', () => {
    slabFrame();
    const sheets = currentWorkbookSheets(5, { sheets: new Set(['Nodes', 'Reactions']) });
    const names = sheets.map(s => s.name);
    expect(sheets.find(s => s.name === 'Warnings')!.rows.flat().join(' ')).toContain('#810');
    expect(names).toEqual(['Cover', 'Conventions', 'Warnings', 'Nodes', 'Reactions']);
  });

  it('keeps only the combinations chosen', () => {
    const { c1 } = slabFrame();
    const s = currentWorkbookSheets(5, { sheets: new Set(['Reactions']), sources: { cases: new Set(), combinations: new Set([c1]) } }).find((x) => x.name === 'Reactions')!;
    const col = s.rows[0]!.indexOf('sourceId');
    const ids = new Set(s.rows.slice(1).map((r) => r[col]));
    expect([...ids]).toEqual([c1]);
  });

  it('a CSV of one sheet still carries the cover and the conventions, as the dialog says', async () => {
    slabFrame();
    downloads.length = 0;
    await downloadProjectCsv(5, { sheets: new Set(['Nodes']) });
    expect(downloads).toHaveLength(1);
    const { blob, name } = downloads[0]!;
    expect(name).toMatch(/\.zip$/);
    const archive = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const files = Object.keys(archive);
    expect(new TextDecoder().decode(archive['03-Warnings.csv'])).toContain('#810');
    expect(files).toEqual(['01-Cover.csv', '02-Conventions.csv', '03-Warnings.csv', '04-Nodes.csv']);
  });
});

describe('an export the project moved under', () => {
  it('a CSV whose model is edited while its provenance is prepared is not written', async () => {
    slabFrame();
    downloads.length = 0;
    const pending = downloadProjectCsv(5, { sheets: new Set(['Nodes']) });
    // The edit lands while the export awaits the engine hashes.
    modelStore.addNode(99, 99, 99);
    await pending;
    expect(downloads).toHaveLength(0);
    // Exported again on the model as it is now: written, and describing it.
    await downloadProjectCsv(5, { sheets: new Set(['Nodes']) });
    expect(downloads).toHaveLength(1);
  });
});

describe('the DXF', () => {
  it('puts every content on its layer, the shells as 3D faces, in the unit asked for', () => {
    slabFrame();
    const dxf = proDxf({ contents: { ...allOff, members: true, shells: true, supports: true }, projection: 'space', units: 'mm', set: 'screen', diagramFactor: 1 });
    expect(dxf).toContain('$INSUNITS\n70\n4');
    const ents = entities(dxf);
    const faces = ents.filter((e) => e.type === '3DFACE');
    expect(faces).toHaveLength(4);
    expect(faces[0]!.layer).toBe(layerName(t('dxf.layerShells')));
    // The beam's far end, 4 m along x and 3 m up, in millimetres.
    const lines = ents.filter((e) => e.type === 'LINE' && e.layer === layerName(t('dxf.layerStructure')));
    expect(lines).toHaveLength(3);
    const xs = lines.flatMap((l) => [...(l.codes.get('10') ?? []), ...(l.codes.get('11') ?? [])].map(Number));
    expect(Math.max(...xs)).toBeCloseTo(4000, 3);
  });

  it('a projection is flat: plan drops z', () => {
    slabFrame();
    const dxf = proDxf({ contents: { ...allOff, members: true }, projection: 'top', units: 'm', set: 'screen', diagramFactor: 1 });
    for (const e of entities(dxf)) for (const z of [...(e.codes.get('30') ?? []), ...(e.codes.get('31') ?? [])]) expect(Number(z)).toBe(0);
  });

  it('loads go on one layer per case, results of the set chosen', () => {
    const { c1 } = slabFrame();
    const dxf = proDxf({ contents: { ...allOff, loads: true, moment: true, deformed: true, reactions: true }, projection: 'space', units: 'm', set: `combo:${c1}`, diagramFactor: 1 });
    const layers = new Set(entities(dxf).map((e) => e.layer));
    expect(layers).toContain(layerName(`${t('dxf.layerLoads')}_D`));
    expect(layers).toContain(layerName(`${t('dxf.layerLoads')}_W`));
    expect([...layers].some((l) => l.startsWith(layerName(t('dxf.layerMoments'))))).toBe(true);
    expect(layers).toContain(layerName(t('dxf.layerDeformed')));
    expect(layers).toContain(layerName(t('dxf.layerReactions')));
    expect(dxf).toContain('1.2D+1.6W');
    // The deformed slab is a closed 3D polyline.
    const deformed = entities(dxf).filter((e) => e.type === 'POLYLINE' && e.layer === layerName(t('dxf.layerDeformed')));
    expect(deformed.some((p) => p.codes.get('70')?.[0] === '9')).toBe(true);
  });
});

describe('the figures of a model with shells', () => {
  const opts: FigureOptions = { ...DEFAULT_FIGURE_OPTIONS, titles: true };

  it('the shell result is painted in the contour colours, with its scale', () => {
    slabFrame();
    const p = plan2D('shellMap', { ...opts, shellComponent: 'mx', view: 'top' })!;
    const svg = toSvg(p);
    // Contour bands are drawn as given, not mapped to ink: more than a handful of distinct fills.
    const fills = new Set([...svg.matchAll(/fill="(rgb\([^)]+\))"/g)].map((m) => m[1]));
    expect(fills.size).toBeGreaterThan(8);
    // In black and white, a grey ramp.
    const bw = toSvg(plan2D('shellMap', { ...opts, style: 'bw', shellComponent: 'mx', view: 'top' })!);
    for (const m of bw.matchAll(/fill="rgb\((\d+),(\d+),(\d+)\)"/g)) expect(m[1] === m[2] && m[2] === m[3]).toBe(true);
    expect(svg).toContain('kN·m/m');
  });

  it('a figure of another set is headed with its name', () => {
    const { c2 } = slabFrame();
    const set = resultSet(`combo:${c2}`);
    const p = plan2D('moment', { ...opts, results: set.results, resultsName: set.name })!;
    expect(p.title).toContain('0.9D-W');
  });
});

describe('the report', () => {
  const config = (over: Partial<ReportConfig> = {}): ReportConfig => ({
    companyName: '', companyLogo: null,
    sections: { modelData: true, results: true, advancedAnalysis: false, storyDrift: false, diagnostics: false, quantities: false, loads: true, figures: false },
    ...over,
  });

  it('draws the model, the loads and each result chosen as a figure', () => {
    slabFrame();
    const f = reportResultFigures(config({ resultModes: { reactions: 'table' } }), { style: 'color', values: true, view: 'iso', shellComponent: 'vonMises' });
    expect(f.model?.dataUrl).toMatch(/^data:image\/svg\+xml/);
    expect(f.loads).toBeDefined();
    expect(f.reactions).toBeUndefined();
    expect(f.forces).toHaveLength(3);
    expect(f.shells).toHaveLength(1);
  });

  it('a result as a figure only has no table, and figures are numbered in order', () => {
    const tr = (k: string) => k;
    const fig = (caption: string) => ({ dataUrl: 'data:image/svg+xml,x', caption });
    const html = generateReportHtml({
      projectName: 'p', date: 'd', nodes: [], elements: [], materials: [], sections: [], supports: [], loadCount: 0,
      results: { displacements: [], reactions: [{ nodeId: 7, fx: 1, fy: 2, fz: 3, mx: 0, my: 0, mz: 0 }], elementForces: [] },
      verifications: [], t: tr,
      config: config({ resultModes: { reactions: 'figure' }, sections: { ...config().sections, parts: { nodes: false } } }),
      resultFigures: { model: fig('M'), reactions: [fig('R')] },
    } as unknown as ReportData);
    expect(html).not.toContain('report.nodes (0)');
    expect(html).toContain('report.materials (0)');
    expect(html).toMatch(/report\.figure 1\. M/);
    expect(html).toMatch(/report\.figure 2\. R/);
    // The reactions table (its node 7 row) is not printed.
    expect(html).not.toMatch(/<td>7<\/td>/);
  });
});

describe('an SRSS or ABS combination, a magnitude without a sign', () => {
  /** The frame with its second combination set to SRSS, solved again. */
  function magnitudeFrame() {
    const f = slabFrame();
    modelStore.updateCombination(f.c2, { method: 'srss' });
    const r = modelStore.solveCombinations3D(uiStore.includeSelfWeight, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    publishCombinations3D(r);
    expect(resultsStore.perCombo3D.get(f.c2)?.magnitude?.method).toBe('srss');
    return f;
  }

  it('is named as one in the choices, the figure titles and the DXF', () => {
    const { c1, c2 } = magnitudeFrame();
    const choices = resultSetChoices();
    expect(choices.find((c) => c.key === `combo:${c2}`)!.label).toContain('SRSS');
    expect(choices.find((c) => c.key === `combo:${c1}`)!.label).not.toContain('SRSS');
    const set = resultSet(`combo:${c2}`);
    expect(figureTitle('moment', { results: set.results, resultsName: set.name })).toContain('SRSS');
    expect(figureTitle('moment', { results: resultSet(`combo:${c1}`).results, resultsName: '1.2D+1.6W' })).not.toContain('SRSS');
    const dxf = proDxf({ contents: { ...allOff, moment: true }, projection: 'space', units: 'm', set: `combo:${c2}`, diagramFactor: 1 });
    expect(dxf).toContain('SRSS');
  });

  it('the DXF prints its moments unsigned, not as negatives', () => {
    const { c2 } = magnitudeFrame();
    const dxf = proDxf({ contents: { ...allOff, moment: true }, projection: 'space', units: 'm', set: `combo:${c2}`, diagramFactor: 1 });
    const values = entities(dxf).filter((e) => e.type === 'TEXT' && e.layer.startsWith(layerName(t('dxf.layerMoments'))))
      .map((e) => Number(e.codes.get('1')?.[0]));
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) expect(v).toBeGreaterThanOrEqual(0);
  });
});

describe('the DXF loads, every kind and every case on its own layer', () => {
  /** The layers the LAYER table declares, and the layers entities are drawn on. */
  function declaredAndUsed(dxf: string) {
    const lines = dxf.split('\n');
    const declared: string[] = [];
    for (let i = lines.indexOf('LAYER'); i >= 0 && lines[i] !== 'ENDTAB'; i++) if (lines[i] === 'LAYER' && lines[i + 1] === '2') declared.push(lines[i + 2]!);
    return { declared, used: new Set(entities(dxf).map((e) => e.layer)) };
  }

  it('thermal, prestress and imposed displacements are drawn, and no layer is left empty', () => {
    const { quads } = slabFrame();
    const T = modelStore.addLoadCase('T', 'T');
    const beam = [...modelStore.elements.values()][1]!.id;
    const support = [...modelStore.supports.values()][0]!.nodeId;
    modelStore.addThermalLoad(beam, 20, 10, T);
    modelStore.addThermalLoadQuad3D(quads[0]!, 15, 5, T);
    modelStore.addLoadEntry({ type: 'prestress3d', data: { id: 0, elementId: beam, force: 500, eI: 0, eM: 0.2, eJ: 0, caseId: T } });
    modelStore.addLoadEntry({ type: 'displacement3d', data: { id: 0, nodeId: support, dz: -0.01, caseId: T } });
    const dxf = proDxf({ contents: { ...allOff, loads: true }, projection: 'space', units: 'm', set: 'screen', diagramFactor: 1 });
    const { declared, used } = declaredAndUsed(dxf);
    for (const l of declared) expect(used, l).toContain(l);
    const texts = entities(dxf).filter((e) => e.layer === layerName(`${t('dxf.layerLoads')}_T`) && e.type === 'TEXT').map((e) => e.codes.get('1')![0]!);
    expect(texts.some((s) => s.includes('°C'))).toBe(true);
    expect(texts.some((s) => s.includes('500'))).toBe(true);
    expect(texts.some((s) => s.includes('-10'))).toBe(true);
  });

  it('two cases whose names read alike in a layer name keep a layer each', () => {
    slabFrame();
    const n = [...modelStore.nodes.keys()][1]!;
    const a = modelStore.addLoadCase('Viento +X', 'W'), b = modelStore.addLoadCase('Viento X', 'W');
    modelStore.addNodalLoad3D(n, 1, 0, 0, 0, 0, 0, a);
    modelStore.addNodalLoad3D(n, 2, 0, 0, 0, 0, 0, b);
    const dxf = proDxf({ contents: { ...allOff, loads: true }, projection: 'space', units: 'm', set: 'screen', diagramFactor: 1 });
    const layers = new Set(entities(dxf).filter((e) => e.layer.includes('VIENTO')).map((e) => e.layer));
    expect(layers.size).toBe(2);
  });
});
