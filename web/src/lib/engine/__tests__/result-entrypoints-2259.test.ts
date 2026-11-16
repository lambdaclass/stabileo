import { afterEach, beforeAll, expect, it } from 'vitest';
import { render } from 'svelte/server';
import * as XLSX from 'xlsx';
import { axesStore } from '../../axes/axes.svelte';
import { allChoices } from '../../axes/frame';
import { modelStore, uiStore, resultsStore } from '../../store';
import { initSolver, solve3D } from '../wasm-solver';
import { exportResultsCSV } from '../../store/file';
import { buildExcelWorkbook } from '../../export/excel';
import ResultsTable from '../../../components/tables/ResultsTable.svelte';
import ProResultsTab from '../../../components/pro/ProResultsTab.svelte';
import { t } from '../../i18n';

beforeAll(async () => { await initSolver(); });
afterEach(() => { axesStore.reset(); resultsStore.clear(); modelStore.clear(); });

it.each(['basic table', 'pro table', 'CSV', 'Excel'] as const)('known wrong result: #2259 %s retains SRSS and ABS component magnitudes', async entry => {
  uiStore.analysisMode = 'pro';
  uiStore.unitSystem = 'SI';
  await modelStore.loadExample('3d-portal-frame');
  const input = modelStore.buildSolverInput3D(false)!;
  const solved = solve3D(input);
  for (const method of ['srss', 'abs'] as const) {
    const results = { ...solved, magnitude: { method },
      reactions: [{ nodeId: 1, fx: 1, fy: 2, fz: 3, mx: 4, my: 5, mz: 6 }],
      displacements: [{ nodeId: 1, ux: 0.001, uy: 0.002, uz: 0.003, rx: 0.004, ry: 0.005, rz: 0.006 }] };
    resultsStore.setResults3D(results);
    for (const choice of allChoices()) {
      axesStore.choice = choice;
      if (entry === 'basic table' || entry === 'pro table') {
        const html = render(entry === 'basic table' ? ResultsTable : ProResultsTab).body;
        const numbers = [...html.matchAll(/<td class="(?:num|col-num)(?: [^"]*)?"[^>]*>([^<]+)<\/td>/g)].map(m => m[1]!);
        expect(numbers).toHaveLength(6);
        expect(numbers.every(n => !n.trim().startsWith('-'))).toBe(true);
      } else if (entry === 'CSV') {
        const rows = exportResultsCSV().split('\n').filter(row => row.startsWith('1,') && row.split(',').length === 7);
        expect(rows).toHaveLength(2);
        expect(rows.flatMap(row => row.split(',').slice(1).map(Number)).every(n => n >= 0)).toBe(true);
      } else {
        const wb = await buildExcelWorkbook({ provenance: false });
        expect(wb).not.toBeNull();
        const reactions = XLSX.utils.sheet_to_json<unknown[]>(wb!.Sheets[t('excel.sheetReactions')]!, { header: 1 });
        expect(reactions.length).toBeGreaterThan(1);
        expect(reactions[1]!.slice(2).every(n => typeof n === 'number' && n >= 0)).toBe(true);
        const nodes = XLSX.utils.sheet_to_json<unknown[]>(wb!.Sheets[t('excel.sheetNodes')]!, { header: 1 });
        expect(nodes[1]!.slice(4).every(n => typeof n === 'number' && n >= 0)).toBe(true);
      }
    }
  }
});
