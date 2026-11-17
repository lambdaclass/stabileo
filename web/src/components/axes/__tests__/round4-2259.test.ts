import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ProLoadTables from '../../pro/loads/ProLoadTables.svelte';
import ModalResultsTable from '../../pro/dynamics/ModalResultsTable.svelte';
import { allChoices, makeFrame } from '../../../lib/axes/frame';
import SelectedEntityPanel from '../../floating-tools/SelectedEntityPanel.svelte';
import { modelStore, uiStore } from '../../../lib/store';
import { axesStore } from '../../../lib/axes/axes.svelte';
import { i18n } from '../../../lib/i18n/store.svelte';

afterEach(() => { modelStore.clear(); uiStore.clearSelectedLoads(); axesStore.reset(); i18n.locale = 'en'; });

it('known wrong result: #2259 selected projected loads declare Projected and retain their actual frame', () => {
  i18n.locale = 'en';
  uiStore.analysisMode = '3d';
  modelStore.clear();
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 1, 4);
  const e = modelStore.addElement(a, b);
  const id = modelStore.addDistributedLoad3D(e, 2, 3, 5, 7);
  axesStore.choice = { up: '+Y', right: '-Z', hand: 'left' };
  uiStore.selectedLoads = new Set([id]);
  for (const frame of ['projected', 'global', 'local'] as const) {
    modelStore.updateLoad(id, { frame });
    const stored = (modelStore.loads.find(l => l.data.id === id)!.data as { frame?: string }).frame;
    const html = render(SelectedEntityPanel).body;
    const active = [...html.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)].filter(m => /\bactive\b/.test(m[1]!));
    expect(active.map(m => m[2])).toEqual([frame === 'projected' ? 'Projected' : frame === 'global' ? 'Global' : 'Local']);
    expect((modelStore.loads.find(l => l.data.id === id)!.data as { frame?: string }).frame).toBe(stored);
  }
});

it('known wrong result: #2259 the German section description names its kern once', async () => {
  const { default: de } = await import('../../../lib/i18n/locales/de');
  expect(de['landing.secDesc']).toContain('Zentralkern des');
  expect(de['landing.secDesc']).not.toContain('Zentralkern Kern');
});

it('known wrong result: #2259 Advanced renders distinct signed participation and mass-ratio columns', () => {
  i18n.locale = 'en';
  const modes = [
    { frequency: 2, period: 0.5, participationX: -2, participationY: 3, participationZ: 5, massRatioX: 0.1, massRatioY: 0.2, massRatioZ: 0.3 },
    { frequency: 4, period: 0.25, participationX: 7, participationY: -11, participationZ: 13 },
  ];
  for (const choice of allChoices()) {
    axesStore.choice = choice;
    const f = makeFrame(choice);
    const html = render(ModalResultsTable, { props: { modes } }).body;
    for (const axis of ['X', 'Y', 'Z']) expect(html).toContain(`Mass ratio ${axis}`);
    const rows = [...html.matchAll(/data-testid="adv-modal-row-\d+"[^>]*>([\s\S]*?)<\/tr>/g)];
    for (const [i, mode] of modes.entries()) {
      const cells = [...rows[i]![1]!.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(m => m[1]!);
      const expected = f.rows.map(row => row.reduce((sum, sign, k) => sum + sign * [mode.participationX, mode.participationY, mode.participationZ][k]!, 0) + 0);
      expect(cells.slice(2, 5).map(Number)).toEqual(expected);
      expect(cells.slice(5, 8)).toEqual(f.rows.map(row => {
        const ratio = [mode.massRatioX, mode.massRatioY, mode.massRatioZ][row.findIndex(x => x !== 0)];
        return ratio === undefined ? '—' : `${(ratio * 100).toFixed(1)}%`;
      }));
      expect(cells.slice(8, 11)).toEqual(cells.slice(5, 8));
    }
    const withheld = render(ModalResultsTable, { props: { modes, withheld: true } }).body;
    const first = withheld.slice(withheld.indexOf('data-testid="adv-modal-row-0"'));
    expect([...first.matchAll(/<td[^>]*>—<\/td>/g)]).toHaveLength(18);
  }
});

it('known wrong result: #2259 standalone gravity is visible separately from case weight rules', () => {
  i18n.locale = 'en';
  uiStore.analysisMode = 'pro';
  modelStore.clear();
  modelStore.setAnalysis({ selfWeight: [], standaloneSelfWeight: 'gravity' });
  for (const choice of allChoices()) {
    axesStore.choice = choice;
    const f = makeFrame(choice);
    const index = f.rows.findIndex(row => row[2] !== 0);
    const sign = f.rows[index]![2]!;
    const html = render(ProLoadTables).body;
    const row = html.match(/data-testid="sw-standalone"[^>]*>([\s\S]*?)<\/tr>/)![1]!;
    expect(row).toContain('All-loads solve');
    const cells = [...row.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(m => m[1]);
    expect(cells.slice(0, 3)).toEqual(['All-loads solve', 'XYZ'[index], String(-sign)]);
  }
});
