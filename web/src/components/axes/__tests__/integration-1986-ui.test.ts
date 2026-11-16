import { afterEach, beforeAll, expect, it } from 'vitest';
import { render } from 'svelte/server';
import WhatIf from '../../WhatIfPanel.svelte';
import Piece from '../../pro/pieces/PiecePanel.svelte';
import { modelStore, uiStore } from '../../../lib/store';
import { axesStore } from '../../../lib/axes/axes.svelte';
import { whatIf } from '../../../lib/store/whatif.svelte';
import { initSolver } from '../../../lib/engine/wasm-solver';
import { createArc, addCurveLoad } from '../../../lib/store/curved-members';
import { renderMemoriaHtml } from '../../../lib/report/memoria/render';

beforeAll(async () => { await initSolver(); });
afterEach(() => { whatIf.abandon(); axesStore.reset(); modelStore.clear(); });

it.skip('known wrong result: #1986 Explore displays the global plane point load in the user vertical direction', async () => {
  uiStore.analysisMode = '2d';
  uiStore.unitSystem = 'SI';
  await modelStore.loadExample('cantilever');
  modelStore.addPointLoadOnElement([...modelStore.elements.keys()][0]!, 1, 7, { isGlobal: true });
  axesStore.choice = { up: '-Y', right: '+X', hand: 'right' };
  whatIf.open();
  expect(render(WhatIf).body).toContain('P=-7');
});

it.skip('known wrong result: #1986 custom curve directions are printed in user component order', () => {
  uiStore.analysisMode = 'pro';
  modelStore.clear();
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(4, 0, 0);
  const members = createArc(a, { x: 2, y: 0, z: 2 }, b, 4);
  expect(members).toHaveLength(4);
  const arcId = modelStore.elements.get(members[0]!)!.arc!.id;
  addCurveLoad({ arcId, caseId: 1, q: 5, dir: [1, 2, 3] });
  uiStore.selectElements(members);
  axesStore.choice = { up: '+Y', right: '-Z', hand: 'left' };
  expect(render(Piece).body).toContain('(2.00, 3.00, -1.00)');
});

it.skip('known wrong result: #1986 storey shears use the axis names and signs of their columns', () => {
  axesStore.choice = { up: '+Y', right: '-Z', hand: 'left' };
  const m = {
    project: { name: 'A', date: '2026-11-16', revision: '' }, codes: [], scope: [],
    hypotheses: { analysis: [], stiffness: [], diaphragms: [], shells: [], supports: [] },
    actions: { cases: [], combinations: [] },
    global: { storeyShear: [{ level: 'L1', vx: 6, vy: 8, kx: 10, ky: 12, soft: false }] },
    elements: [], notices: { automatic: [], manual: [] },
    quantities: { byLevel: [], byType: [], rebar: [], steel: [], connections: [] },
  };
  const html = renderMemoriaHtml(m as never, new Set(['global']), { tr: (k) => k, msg: (m) => m.key, fmt: (v, d) => v.toFixed(d) });
  expect(html).toContain('Vz (kN)');
  expect(html).toContain('Vx (kN)');
  expect(html).toContain('Kz (kN/m)');
  expect(html).toContain('<td>-6.0</td>');
});
