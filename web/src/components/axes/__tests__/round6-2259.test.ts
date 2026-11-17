import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import * as XLSX from 'xlsx';
import QuickInfoCard from '../../viewport/QuickInfoCard.svelte';
import SupportsTable from '../../tables/SupportsTable.svelte';
import { axesStore } from '../../../lib/axes/axes.svelte';
import { allChoices, makeFrame, planeSigns } from '../../../lib/axes/frame';
import { modelStore, resultsStore, uiStore } from '../../../lib/store';
import { viewState } from '../../../lib/store/view-state.svelte';
import { fmtQ } from '../../../lib/store/display-units.svelte';
import { buildProReportData } from '../../../lib/engine/pro-report-inputs';
import { buildTemplateWorkbook } from '../../../lib/excel-import/template';
import { INSTRUCTIONS_SHEET, SHEETS, headerFor } from '../../../lib/excel-import/schema';
import { parseWorkbook } from '../../../lib/excel-import/parse';
import { t } from '../../../lib/i18n';
import { i18n } from '../../../lib/i18n/store.svelte';

const result = {
  displacements: [{ nodeId: 1, ux: 0.001, uy: 0.002, uz: 0.003, rx: 0, ry: 0, rz: 0 }],
  reactions: [{ nodeId: 1, fx: 2, fy: 3, fz: 5, mx: 0, my: 0, mz: 0 }], elementForces: [],
};
afterEach(() => { axesStore.reset(); resultsStore.clear(); modelStore.clear(); uiStore.clearSelection(); viewState.quickInfo = false; });

it.skip('known wrong result: #2259 quick info permutes SRSS and ABS magnitudes but signs linear and nonlinear vectors', () => {
  i18n.locale = 'en';
  uiStore.unitSystem = 'SI';
  uiStore.analysisMode = 'pro';
  const id = modelStore.addNode(0, 0, 0);
  expect(id).toBe(1);
  viewState.quickInfo = true;
  uiStore.clearSelection();
  uiStore.selectNode(id);
  for (const kind of ['srss', 'abs', 'linear', 'nonlinear'] as const) {
    resultsStore.setResults3D({ ...result, ...(kind === 'srss' || kind === 'abs' ? { magnitude: { method: kind } } : {}) });
    for (const choice of allChoices()) {
      axesStore.choice = choice;
      const frame = makeFrame(choice);
      const expected = (v: number[]) => frame.rows.map(row => {
        const k = row.findIndex(n => n !== 0);
        return v[k]! * (kind === 'srss' || kind === 'abs' ? 1 : row[k]!);
      });
      const html = render(QuickInfoCard).body;
      expect(html).toContain(`u = ${expected([0.001, 0.002, 0.003]).map(v => fmtQ(v, 'displacement')).join('; ')}`);
      expect(html).toContain(`R = ${expected([2, 3, 5]).map(v => fmtQ(v, 'force')).join('; ')}`);
    }
  }
});

it.skip('known wrong result: #2259 plane spring labels name the displayed translation and rotation axes', () => {
  uiStore.analysisMode = '2d';
  const id = modelStore.addNode(0, 0);
  modelStore.addSupport(id, 'spring');
  for (const choice of allChoices()) {
    axesStore.choice = choice;
    const p = planeSigns(makeFrame(choice));
    const html = render(SupportsTable).body;
    const labels = [...html.matchAll(/class="load-field[^"]*">([^<]*)/g)].map(m => m[1]);
    expect(labels).toEqual([`k${p.h.toLowerCase()}`, `k${p.v.toLowerCase()}`, `kr${p.n.toLowerCase()}`]);
  }
});

it.skip('known wrong result: #2259 generated report combination names and result-set names use the same axes as their factors', () => {
  uiStore.analysisMode = 'pro';
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  const a = modelStore.addLoadCase('Wind +X', 'W', { axisNamed: true });
  modelStore.addLoadCase('Wind -X', 'W', { axisNamed: true });
  const id = modelStore.addCombination('1.0 W (Wind +X)', [{ caseId: a, factor: 1 }], {} as never);
  resultsStore.setResults3D(result);
  resultsStore.setCombinationResults3D(new Map(), new Map([[id, result]]), null as never);
  for (const choice of allChoices()) {
    const f = makeFrame(choice);
    const row = f.rows.findIndex(r => r[0] !== 0);
    const axis = `${f.rows[row]![0]! > 0 ? '+' : '-'}${'XYZ'[row]}`;
    const name = f.identity ? '1.0 W (Wind +X)' : `1.0 W (Wind ${axis})`;
    const data = buildProReportData({ config: { axes: choice } as never, t })!;
    expect(data.combinations).toHaveLength(1);
    expect(data.combinations![0]).toMatchObject({ name, factors: [{ caseName: `Wind ${axis}`, factor: 1 }] });
    expect(data.resultSets).toHaveLength(1);
    expect(data.resultSets![0]!.name).toBe(name);
  }
  modelStore.updateCombination(id, { name: 'My X label' });
  expect(buildProReportData({ config: { axes: { up: '+X', right: '-Z', hand: 'left' } } as never, t })!.combinations![0]!.name).toBe('My X label');
});

it.skip('known wrong result: #2259 template coordinate requirements follow the importer across every axes choice', () => {
  i18n.locale = 'en';
  const schema = SHEETS.find(s => s.name === 'Nodes')!;
  for (const choice of allChoices()) {
    const f = makeFrame(choice);
    const wb = buildTemplateWorkbook(XLSX as never, choice);
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[INSTRUCTIONS_SHEET]!, { header: 1 });
    const start = rows.findIndex(r => r[0]?.startsWith('── Nodes'));
    const instructions = rows.slice(start + 1, start + 1 + schema.columns.length);
    for (const [i, axis] of ['x', 'y', 'z'].entries()) {
      const header = headerFor(schema.columns.find(c => c.key === axis)!);
      const row = instructions.find(r => r[1] === header)!;
      expect(row[2]).toBe(t(f.rows[i]![0] !== 0 ? 'xls.tpl.required' : 'xls.tpl.optionalMark'));
    }
    const sheets = Object.fromEntries(wb.SheetNames.map(n => [n, XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n]!, { header: 1, defval: '' })]));
    expect(parseWorkbook(sheets).problems).toEqual([]);
    const required = f.rows.findIndex(r => r[0] !== 0);
    const coordinate = schema.columns.findIndex(c => c.key === 'xyz'[required]);
    sheets.Nodes![1]![coordinate] = '';
    expect(parseWorkbook(sheets).problems.some(p => p.sheet === 'Nodes' && p.column === 'xyz'[required])).toBe(true);
  }
});
