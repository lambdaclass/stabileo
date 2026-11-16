import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ResultsTable from '../../../components/tables/ResultsTable.svelte';
import { exportResultsCSV } from '../../store/file';
import { axesStore } from '../axes.svelte';
import { allChoices, makeFrame, planeSigns } from '../frame';
import { resultsStore, uiStore } from '../../store';

afterEach(() => { axesStore.reset(); resultsStore.clear(); });

it.skip('known wrong result: #2259 Basic plane table and CSV preserve SRSS and ABS magnitudes under all user axes', () => {
  uiStore.analysisMode = '2d';
  for (const choice of allChoices()) for (const method of ['srss', 'abs', 'signed']) {
    axesStore.choice = choice;
    resultsStore.setResults({ displacements: [{ nodeId: 1, ux: 0.001, uz: 0.002, ry: 0.003 }], reactions: [{ nodeId: 1, rx: 4, rz: 5, my: 6 }], elementForces: [], ...(method === 'signed' ? {} : { magnitude: { method } }) } as never);
    const p = planeSigns(makeFrame(choice));
    const signs = method === 'signed' ? [p.sx, p.sz, p.sr] : [1, 1, 1];
    const html = render(ResultsTable).body;
    for (const [i, v] of [1, 2, 3].entries()) expect(html).toContain(`>${(v * signs[i]!).toFixed(4)}</td>`);
    const csv = exportResultsCSV();
    expect(csv).toContain(`1,${[0.001, 0.002, 0.003].map((v, i) => v * signs[i]!).join(',')}`);
    expect(csv).toContain(`1,${[4, 5, 6].map((v, i) => v * signs[i]!).join(',')}`);
  }
});
