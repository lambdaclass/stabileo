import { afterEach, expect, it } from 'vitest';
import { utils } from 'xlsx';
import { t } from '../../i18n';
import { axesStore } from '../axes.svelte';
import { allChoices, makeFrame, planeSigns } from '../frame';
import { modelStore, resultsStore, uiStore } from '../../store';
import { buildExcelWorkbook } from '../../export/excel';
import { buildForcesReport } from '../../engine/forces-report';
import { RC_FORCES_DEFAULT } from '../../flow/rc-forces-report';
import { pointOnElementText } from '../../engine/calc-report-loads';
import { actionSummary } from '../../ai/capabilities/build-model';
import { combinationNameShown } from '../case-names';
import { generateReportHtml } from '../../engine/pro-report';

const result = {
  displacements: [{ nodeId: 1, ux: 0.001, uy: 0.002, uz: 0.003, rx: 0.004, ry: 0.005, rz: 0.006 }],
  reactions: [{ nodeId: 1, fx: 1, fy: 2, fz: 3, mx: 4, my: 5, mz: 6 }], elementForces: [],
};
afterEach(() => { axesStore.reset(); modelStore.clear(); resultsStore.clear(); });

it('known wrong result: #2259 Excel plane SRSS and ABS displacements, reactions and both totals stay magnitudes', async () => {
  uiStore.analysisMode = '2d';
  modelStore.clear();
  modelStore.addNode(0, 0);
  for (const choice of allChoices()) for (const method of ['srss', 'abs', 'signed']) {
    axesStore.choice = choice;
    const magnitude = method === 'signed' ? {} : { magnitude: { method } };
    resultsStore.setResults({ displacements: [{ nodeId: 1, ux: 0.001, uz: 0.002, ry: 0.003 }], reactions: [{ nodeId: 1, rx: 4, rz: 5, my: 6 }], elementForces: [], ...magnitude } as never);
    const wb = await buildExcelWorkbook({ provenance: false });
    expect(wb).not.toBeNull();
    const sheets = Object.values(wb!.Sheets).map(s => utils.sheet_to_json(s, { header: 1 }) as unknown[][]);
    const nodes = sheets.find(s => s[0]?.[0] === 'ID' && s[0]?.some(h => String(h).includes('(mm)')))!;
    const reactions = sheets.find(s => s[0]?.[0] === t('excel.node') && s[0]?.some(h => String(h).includes('(kN)')))!;
    const p = planeSigns(makeFrame(choice));
    const signs = method === 'signed' ? [p.sx, p.sz, p.sr] : [1, 1, 1];
    expect(nodes[1]!.slice(-3)).toEqual([1, 2, 3].map((v, i) => v * signs[i]!));
    const want = [4, 5, 6].map((v, i) => v * signs[i]!);
    expect(reactions[1]!.slice(-3)).toEqual(want);
    expect(reactions.at(-1)!.slice(-3)).toEqual(want);
    const summary = sheets[0]!;
    for (const v of want) expect(summary.flat()).toContain(v.toFixed(4));
  }
});

it('known wrong result: #2259 forces report permutes SRSS and ABS blocks while signed blocks retain direction', () => {
  for (const choice of allChoices()) for (const method of ['srss', 'abs', 'signed']) {
    axesStore.choice = choice;
    const r = { ...result, ...(method === 'signed' ? {} : { magnitude: { method } }) };
    const doc = buildForcesReport(RC_FORCES_DEFAULT, { results: r, perCombo: new Map(), comboNames: new Map(), elementNodes: new Map() } as never, k => k);
    const f = makeFrame(choice);
    const permute = (v: number[]) => f.rows.map(row => v[row.findIndex(x => x !== 0)]!);
    const signed = (v: number[], pseudo: boolean) => f.rows.map(row => row.reduce((a, x, i) => a + x * v[i]!, 0) * (pseudo ? f.det : 1));
    const map = (v: number[], pseudo = false) => method === 'signed' ? signed(v, pseudo) : permute(v);
    expect(doc.sheets.find(s => s.section === 'reactions')!.aoa[1]!.slice(2)).toEqual([...map([1, 2, 3]), ...map([4, 5, 6], true)]);
    expect(doc.sheets.find(s => s.section === 'displacements')!.aoa[1]!.slice(2)).toEqual([...map([0.001, 0.002, 0.003]), ...map([0.004, 0.005, 0.006], true)]);
  }
});

it('#2259 stored point axial force is described in global report axes or retained in local output', () => {
  for (const choice of allChoices()) {
    axesStore.choice = choice;
    const p = planeSigns(makeFrame(choice));
    expect(pointOnElementText({ a: 1, p: 0, px: 7, isGlobal: true }, { global: 'global' }, 'SI', [1, 0])).toContain(`P${p.h.toLowerCase()}=${p.sx * 7}`);
    expect(pointOnElementText({ a: 1, p: 0, px: 7 }, { global: 'global' }, 'SI', [1, 0])).toContain('Px=7');
  }
});

it('known wrong result: #2259 AI lateral-load summary reports the signed user force and its mapped axis', () => {
  for (const choice of allChoices()) {
    axesStore.choice = choice;
    const p = planeSigns(makeFrame(choice));
    expect(actionSummary({ action: 'add_lateral_loads', params: { h: 10 } } as never)).toContain(`${p.sx * 10} kN`);
    expect(actionSummary({ action: 'add_lateral_loads', params: { h: 10 } } as never)).toContain(p.h);
  }
});

it('known wrong result: #2259 generated combinations preserve constituent user case names including copied axis tokens', () => {
  modelStore.clear();
  const user = modelStore.addLoadCase('Wind +Y', 'W');
  const generated = modelStore.addLoadCase('Wind +X', 'W', { axisNamed: true });
  axesStore.choice = { up: '+Y', right: '-X', hand: 'left' };
  const name = combinationNameShown({ name: '1.0 W (Wind +Y) + 1.6 W (Wind +X)', origin: {}, factors: [{ caseId: user, factor: 1 }, { caseId: generated, factor: 1.6 }] } as never);
  expect(name).toContain('Wind +Y');
  expect(name).toContain('Wind −X');
  expect(combinationNameShown({ name, origin: {}, nameTyped: true })).toBe(name);
});

it('known wrong result: #2259 modal report signed factors transform as vectors under reversed and left-handed axes', () => {
  for (const choice of allChoices()) {
    const f = makeFrame(choice);
    const html = generateReportHtml({ projectName: 'P', date: '', nodes: [], elements: [], supports: [], materials: [], sections: [], loadCount: 0, results: result, advancedResults: { modal: { modes: [{ frequency: 2, period: 0.5, participationX: -2, participationY: 3, participationZ: -5, massRatioX: 0.1, massRatioY: 0.2, massRatioZ: 0.3 }] } }, config: { axes: choice, companyName: '', companyLogo: null, sections: { modelData: false, results: false, advancedAnalysis: true, storyDrift: false, diagnostics: false, quantities: false, loads: false } } } as never);
    const table = html.slice(html.indexOf('Part. X'));
    const cells = [...table.matchAll(/<td class="num">([^<]*)<\/td>/g)].slice(3, 6).map(m => Number(m[1]!.replace(',', '.')));
    expect(cells).toEqual(f.rows.map(row => row.reduce((sum, sign, k) => sum + sign * [-2, 3, -5][k]!, 0) + 0));
    const ratios = [...table.matchAll(/<td class="num">([^<]*)<\/td>/g)].slice(6, 9).map(m => Number(m[1]!.replace(' %', '')) / 100);
    expect(ratios).toEqual(f.rows.map(row => [0.1, 0.2, 0.3][row.findIndex(x => x !== 0)]));
    expect(ratios.every(v => v >= 0)).toBe(true);
  }
});
