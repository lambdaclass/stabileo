import { featuresForMode } from '../../../../config/public-features.mjs';
import LoadsTable from '../../tables/LoadsTable.svelte';
import Step3Transformation from '../../dsm/Step3Transformation.svelte';
import { dsmInFrame } from '../../../lib/axes/dsm-frame';
import { solveDetailed } from '../../../lib/engine/solver-detailed';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import WhatIf from '../../WhatIfPanel.svelte';
import LoadSketch from '../../pro/loads/LoadSketch.svelte';
import SupportsTable from '../../tables/SupportsTable.svelte';
import ProCaseDetails from '../../pro/loads/ProCaseDetails.svelte';
import Piece from '../../pro/pieces/PiecePanel.svelte';
import { modelStore, uiStore } from '../../../lib/store';
import { allChoices, DEFAULT_AXES, makeFrame } from '../../../lib/axes/frame';
import { axesStore } from '../../../lib/axes/axes.svelte';
import { whatIf } from '../../../lib/store/whatif.svelte';
import { initSolver } from '../../../lib/engine/wasm-solver';
import { createArc, addCurveLoad } from '../../../lib/store/curved-members';
import { renderMemoriaHtml } from '../../../lib/report/memoria/render';

const equations = vi.hoisted(() => [] as string[]);
vi.mock('../../dsm/MathEquation.svelte', () => ({
  default: (_: unknown, props: { equation: string }) => { equations.push(props.equation); },
}));

beforeAll(async () => { await initSolver(); });
afterEach(() => { whatIf.abandon(); axesStore.reset(); modelStore.clear(); });

it('known wrong result: #1986 Explore displays the global plane point load in the user vertical direction', async () => {
  uiStore.analysisMode = '2d';
  uiStore.unitSystem = 'SI';
  await modelStore.loadExample('cantilever');
  modelStore.addPointLoadOnElement([...modelStore.elements.keys()][0]!, 1, 7, { isGlobal: true });
  axesStore.choice = { up: '-Y', right: '+X', hand: 'right' };
  whatIf.open();
  expect(render(WhatIf).body).toContain('P=-7');
});

it('known wrong result: #1986 custom curve directions are printed in user component order', () => {
  uiStore.analysisMode = 'pro';
  modelStore.clear();
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
  const members = createArc(a, { x: 2, y: 0, z: 2 }, b, 4);
  expect(members).toHaveLength(4);
  const arcId = modelStore.elements.get(members[0]!)!.arc!.id;
  addCurveLoad({ arcId, caseId: 1, q: 5, dir: [0.6, 0, 0.8] });
  uiStore.selectElements(members);
  axesStore.choice = { up: '+Y', right: '-Z', hand: 'left' };
  expect(render(Piece).body).toContain('(0.00, 0.80, -0.60)');
});

it('known wrong result: #1986 storey shear magnitudes use the axis names of their columns', () => {
  axesStore.choice = { up: '+Y', right: '-Z', hand: 'left' };
  const m = {
    project: { name: 'A', date: '2026-11-16', revision: '' }, codes: [], scope: [],
    hypotheses: { analysis: [], stiffness: [], diaphragms: [], shells: [], supports: [] },
    actions: { cases: [], combinations: [] },
    global: { storeyShear: [{ level: 'L1', vxMagnitude: 6, vyMagnitude: 8, kx: 10, ky: 12, soft: false }] },
    elements: [], notices: { automatic: [], manual: [] },
    quantities: { byLevel: [], byType: [], rebar: [], steel: [], connections: [] },
  };
  const html = renderMemoriaHtml(m as never, new Set(['global', 'global.storeyShear']), { tr: (k) => k, msg: (m) => m.key, fmt: (v, d) => v.toFixed(d) });
  expect(html).toContain('Vz (kN)');
  expect(html).toContain('Vx (kN)');
  expect(html).toContain('Kz (kN/m)');
  expect(html).toContain('<td>6.0</td><td>8.0</td>');
});

it('known wrong result: #2259 Explore maps every spatial roller option to its selected user axis', async () => {
  uiStore.analysisMode = 'pro';
  await modelStore.loadExample('3d-portal-frame');
  whatIf.open();
  for (const c of allChoices()) {
    axesStore.choice = c;
    const f = makeFrame(c);
    const html = render(WhatIf).body;
    for (const [index, axis] of ['X', 'Y', 'Z'].entries()) {
      const shown = 'XYZ'[f.rows.findIndex(row => row[index] !== 0)];
      expect(html).toMatch(new RegExp(`<option value="roller${axis}"[^>]*>Roller ${shown}</option>`));
    }
  }
});

it('the Basic plane support table labels translation and rotation stiffness by their actual DOFs', () => {
  uiStore.analysisMode = '2d';
  const node = modelStore.addNode(0, 0);
  modelStore.addSupport(node, 'spring', { kx: 13, ky: 17, kz: 19 });
  axesStore.choice = { up: '+Y', right: '-Z', hand: 'left' };
  const html = render(SupportsTable).body.replace(/<!--[\s\S]*?-->/g, '');
  const labels = [...html.matchAll(/class="load-field[^"]*">([^<]+)/g)].map(match => match[1]);
  expect(labels).toEqual(['kz', 'ky', 'krx']);
});

it('displays a spectral direction factor with the sign of the actual user axis', () => {
  const id = modelStore.addLoadCase('Spectral', 'E');
  modelStore.updateLoadCaseFields(id, {
    spectral: { source: { kind: 'code' }, scale: 1, xi: 0.05, rule: 'srss', factors: { x: 1, y: 0, z: 0 } },
  });
  const lc = modelStore.model.loadCases.find(c => c.id === id)!;
  const displayed = () => {
    const html = render(ProCaseDetails, { props: { lc } }).body;
    return html.match(/<input[^>]*value="([^"]+)"[^>]*data-testid="cd-spec-fx"/)?.[1];
  };
  expect(displayed()).toBe('1');
  axesStore.choice = { up: '+Z', right: '-X', hand: 'left' };
  expect(displayed()).toBe('-1');
});

it('known wrong result: #1986 shell point force labels retain the entered user components', () => {
  uiStore.unitSystem = 'SI';
  const v = {
    kind: 'shellPoint',
    shell: {
      dirMode: 'global' as const, dirAxis: 'Z' as const, field: 'uniform' as const, q: null, corners: [],
      va: { axis: 'X' as const, c1: null, q1: null, c2: null, q2: null },
      partial: false, gamma: null, level: null, at: { x: 0, y: 0, z: 0 }, pf: { fx: 2, fy: 3, fz: 5 },
    },
  };
  for (const choice of allChoices()) {
    axesStore.choice = choice;
    const html = render(LoadSketch, { props: { v } }).body.replace(/<!--[\s\S]*?-->/g, '');
    expect(html).toMatch(/Fx = 2(?:\.0+)? kN/);
    expect(html).toMatch(/Fy = 3(?:\.0+)? kN/);
    expect(html).toMatch(/Fz = 5(?:\.0+)? kN/);
    const modelX = makeFrame(choice).rows.find(row => row[0] !== 0)![0];
    expect(html).toContain(modelX === 1 ? 'x1="48" y1="70" x2="74"' : 'x1="108" y1="70" x2="82"');
  }
});

it.skip('known wrong result: #1986 the production load table exposes existing axial loads at either end', () => {
  vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
  try {
    uiStore.analysisMode = '3d';
    uiStore.unitSystem = 'SI';
    const i = modelStore.addNode(0, 0, 0), j = modelStore.addNode(3, 0, 0);
    const e = modelStore.addElement(i, j);
    const id = modelStore.addDistributedLoad3D(e, -5, -5, 0, 0);
    const html = () => render(LoadsTable).body.replace(/<!--[\s\S]*?-->/g, '');
    expect(html()).not.toContain('qXI');
    for (const [qXI, qXJ] of [[6, 0], [0, -8]]) {
      modelStore.updateLoad(id, { qXI, qXJ });
      expect(html()).toMatch(new RegExp('qXI.*?value="' + qXI + '"'));
      expect(html()).toMatch(new RegExp('qXJ.*?value="' + qXJ + '"'));
    }
    modelStore.updateLoad(id, { qXI: 0, qXJ: 0, frame: 'global' });
    expect(html()).toContain('qXI');
  } finally {
    vi.unstubAllGlobals();
  }
});

it.skip('known wrong result: #1986 the symbolic transformation agrees with its numeric matrix under a Y-up permutation', () => {
  uiStore.analysisMode = '2d';
  const i = modelStore.addNode(0, 0), j = modelStore.addNode(3, 0);
  const id = modelStore.addElement(i, j);
  modelStore.addSupport(i, 'fixed');
  modelStore.addNodalLoad(j, 0, -3);
  const solved = solveDetailed(modelStore.buildSolverInput(false)!);
  for (const choice of [DEFAULT_AXES, { up: '+Y', right: '+X', hand: 'right' }, { up: '+Z', right: '-X', hand: 'right' }] as const) {
    axesStore.choice = choice;
    const data = dsmInFrame(solved, makeFrame(choice));
    const elem = data.elements.find(e => e.elementId === id)!;
    equations.length = 0;
    render(Step3Transformation, { props: { data } });
    const rows = equations.find(eq => eq.startsWith('[T] = '))?.match(/bmatrix\}(.*?)\\end/)?.[1];
    expect(rows).toBeDefined();
    const decoded = rows!.split('\\\\').map(row => row.trim().split(/\s*&\s*/).map(cell => {
      if (cell === 'c' || cell === '-c') return Math.cos(elem.angle) * (cell.startsWith('-') ? -1 : 1) + 0;
      if (cell === 's' || cell === '-s') return Math.sin(elem.angle) * (cell.startsWith('-') ? -1 : 1) + 0;
      return Number(cell);
    }));
    expect(decoded).toHaveLength(elem.T.length);
    decoded.forEach((row, i) => {
      expect(row).toHaveLength(elem.T[i]!.length);
      row.forEach((v, j) => expect(v).toBeCloseTo(elem.T[i]![j]!, 12));
    });
  }
});
