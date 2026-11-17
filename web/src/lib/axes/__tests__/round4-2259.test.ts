import { afterEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { allChoices, makeFrame, planeSigns } from '../frame';
import { axesStore } from '../axes.svelte';
import { buildSystemPrompt } from '../../ai/capabilities/build-model';
import { pointOnElementText } from '../../engine/calc-report-loads';
import { generateReportHtml } from '../../engine/pro-report';
import { transformSnapshot } from '../../model/code/frame';
import { codeToModel, modelToCode } from '../../model/code/format';
import { modelToUser } from '../../export/workbook-frame';

const result = { displacements: [], reactions: [], elementForces: [] };
const modes = [
  { frequency: 2, period: 0.5, participationX: -2, participationY: 3, participationZ: 5, massRatioX: 0.1, massRatioY: 0.2, massRatioZ: 0.3 },
  { frequency: 4, period: 0.25, participationX: 7, participationY: -11, participationZ: 13 },
  { frequency: 8, period: 0.125, participationX: 0, participationY: 0, participationZ: 0, massRatioX: 0, massRatioY: 0, massRatioZ: 0 },
];
afterEach(() => axesStore.reset());

it('known wrong result: #2259 modal reports retain signed factors separately from optional effective mass ratios', () => {
  for (const axes of allChoices()) {
    const f = makeFrame(axes);
    const html = generateReportHtml({ projectName: 'P', date: '', t: (key: string) => key === 'adv.massRatio' ? 'Mass ratio' : key, nodes: [], elements: [], supports: [], materials: [], sections: [], loadCount: 0, results: result, advancedResults: { modal: { modes } }, config: { axes, companyName: '', companyLogo: null, sections: { modelData: false, results: false, advancedAnalysis: true, storyDrift: false, diagnostics: false, quantities: false, loads: false } } } as never);
    const table = html.slice(html.indexOf('Part. X'));
    const rows = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].filter(m => m[1]!.includes('<td'));
    for (const [i, mode] of modes.entries()) {
      const cells = [...rows[i]![1]!.matchAll(/<td class="num">([^<]*)<\/td>/g)].map(m => m[1]!);
      const numeric = (v: string) => Number(v.replace(',', '.'));
      expect(cells.slice(3, 6).map(numeric)).toEqual(f.rows.map(row => row.reduce((sum, sign, k) => sum + sign * [mode.participationX, mode.participationY, mode.participationZ][k]!, 0) + 0));
      expect(cells.slice(6, 9)).toEqual(f.rows.map(row => {
        const value = [mode.massRatioX, mode.massRatioY, mode.massRatioZ][row.findIndex(x => x !== 0)];
        return value === undefined ? '—' : `${(value * 100).toFixed(1)} %`;
      }));
    }
    for (const axis of ['X', 'Y', 'Z']) expect(table).toContain(`Mass ratio ${axis}`);
  }
});

it('known wrong result: #2259 the Advanced modal table shares the signed-factor and mass-ratio presentation path', () => {
  const source = readFileSync(new URL('../../../components/pro/ProAdvancedTab.svelte', import.meta.url), 'utf8');
  expect(source).toContain('<ModalResultsTable modes={modalResult.modes} withheld={modalConstrained}');
  const table = readFileSync(new URL('../../../components/pro/dynamics/ModalResultsTable.svelte', import.meta.url), 'utf8');
  expect(table).toContain('modalPresentation(axesStore.frame, modes, withheld)');
  expect(source).not.toMatch(/participation\s*=.*massRatio/);
  for (const axis of ['X', 'Y', 'Z']) expect(table).toContain(`{t('adv.massRatio')} ${axis}`);
});

it('known wrong result: #2259 AI plane prompts describe coordinates and couples with the plane convention', () => {
  for (const axes of allChoices()) for (const mode of ['2d', 'edu']) {
    const f = makeFrame(axes);
    const p = planeSigns(f);
    if (f.identity) continue;
    const text = buildSystemPrompt('en', mode, undefined, undefined, f);
    expect(text).toContain(`model x → ${p.sx === 1 ? '+' : '−'}${p.h}`);
    expect(text).toContain(`model z → ${p.sz === 1 ? '+' : '−'}${p.v}`);
    expect(text).toContain(`model My and in-plane rotation → ${p.sr === 1 ? '+' : '−'}${p.n}`);
    expect(text).not.toContain('moments and rotations convert like the axis they turn about');
  }
});

for (const entry of ['snapshot export', 'snapshot import', 'code export', 'code import', 'workbook'] as const) {
  it(`known wrong result: #2259 local restraint normals follow global axes through ${entry}`, () => {
    for (const axes of allChoices()) for (const analysisMode of ['3d', 'pro']) for (const dofFrame of ['local', 'global']) {
      const support = { id: 1, nodeId: 1, type: 'fixed3d', dofFrame, normalX: 2, normalY: -3, normalZ: 5, dofRestraints: { tx: true, ty: false, tz: true, rx: false, ry: true, rz: false }, kx: 7, ky: 11, kz: 13, curves: { x: [[0, 0], [1, 2]] } };
      const snap = { analysisMode, nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }]], supports: [[1, support]] };
      const read = (code: string) => { const r = codeToModel(code); expect(r.errors).toEqual([]); return r.snapshot as Record<string, any>; };
      const shown = entry === 'snapshot export' ? transformSnapshot(snap, axes, 'toUser')
        : entry === 'snapshot import' ? transformSnapshot(snap, axes, 'toModel')
        : entry === 'code export' ? read(modelToCode(snap as never, axes).split('\n').filter(l => !l.startsWith('frame ')).join('\n'))
        : entry === 'code import' ? read(`${modelToCode(snap as never)}\nframe up="${axes.up}" right="${axes.right}" hand="${axes.hand}"`)
        : { supports: [...modelToUser({ supports: new Map([[1, support]]) }, makeFrame(axes)).supports] };
      const out = shown.supports[0][1];
      const f = makeFrame(axes);
      const matrix = entry.endsWith('import') ? f.rows[0].map((_, i) => f.rows.map(row => row[i]!)) : f.rows;
      expect([out.normalX, out.normalY, out.normalZ]).toEqual(matrix.map(row => row.reduce((sum, sign, k) => sum + sign * [2, -3, 5][k]!, 0) + 0));
      if (dofFrame === 'local') for (const key of ['dofRestraints', 'kx', 'ky', 'kz', 'curves'] as const) expect(out[key]).toEqual(support[key]);
    }
  });
}

it('known wrong result: #2259 global point-load axial components are transformed and named in the displayed horizontal axis', () => {
  for (const choice of allChoices()) {
    axesStore.choice = choice;
    const p = planeSigns(makeFrame(choice));
    for (const px of [-10, 0, 10]) {
      const text = pointOnElementText({ a: 1, p: 0, px, isGlobal: true }, { global: 'global' }, 'SI', [1, 0]);
      if (px !== 0) expect(text).toContain(`P${p.h.toLowerCase()}=${p.sx * px}`);
      else expect(text).toBe('');
      const local = pointOnElementText({ a: 1, p: 0, px }, { global: 'global' }, 'SI', [1, 0]);
      if (px !== 0) expect(local).toContain(`Px=${px}`);
      else expect(local).toBe('');
    }
  }
});

it('known wrong result: #2259 global axial report components follow the member direction and refuse indeterminate directions', () => {
  for (const choice of allChoices()) {
    axesStore.choice = choice;
    const p = planeSigns(makeFrame(choice));
    for (const member of [[3, 4], [-3, 4], [3, -4], [-3, -4]] as const) {
      const text = pointOnElementText({ a: 1, p: 0, px: 10, isGlobal: true }, { global: 'global' }, 'SI', member);
      expect(text).toContain(`P${p.h.toLowerCase()}=${p.sx * member[0] * 2}`);
      expect(text).toContain(`P${p.v.toLowerCase()}=${p.sz * member[1] * 2}`);
    }
  }
  for (const member of [[0, 0], [Infinity, 0], [NaN, 1]] as const) {
    expect(() => pointOnElementText({ a: 1, p: 0, px: 10, isGlobal: true }, { global: 'global' }, 'SI', member)).toThrow('member direction');
    expect(pointOnElementText({ a: 1, p: 0, px: 10 }, { global: 'global' }, 'SI', member)).toContain('Px=10');
  }
});
