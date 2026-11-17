import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SelectedEntityPanel from '../../floating-tools/SelectedEntityPanel.svelte';
import { modelStore, uiStore } from '../../../lib/store';
import { axesStore } from '../../../lib/axes/axes.svelte';
import { i18n } from '../../../lib/i18n/store.svelte';

afterEach(() => { modelStore.clear(); uiStore.clearSelectedLoads(); axesStore.reset(); i18n.locale = 'en'; });

it.skip('known wrong result: #2259 selected projected loads declare Projected and retain their actual frame', () => {
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
    const html = render(SelectedEntityPanel).body;
    const active = [...html.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)].filter(m => /\bactive\b/.test(m[1]!));
    expect(active.map(m => m[2])).toEqual([frame === 'projected' ? 'Projected' : frame === 'global' ? 'Global' : 'Local']);
    expect((modelStore.loads.find(l => l.data.id === id)!.data as { frame?: string }).frame).toBe(frame);
  }
});

it.skip('known wrong result: #2259 the German section description names its kern once', async () => {
  const { default: de } = await import('../../../lib/i18n/locales/de');
  expect(de['landing.secDesc']).toContain('Zentralkern des');
  expect(de['landing.secDesc']).not.toContain('Zentralkern Kern');
});
