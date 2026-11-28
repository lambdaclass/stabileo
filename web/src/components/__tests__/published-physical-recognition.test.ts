import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ProPhysicalPanel from '../pro/ProPhysicalPanel.svelte';
import DeskPrepare from '../pro/desk/DeskPrepare.svelte';
import { modelStore, uiStore } from '../../lib/store';
import { physicalGroups, recognizePhysicalElements } from '../../lib/store/physical';
import { t } from '../../lib/i18n';

afterEach(() => { modelStore.clear(); uiStore.analysisMode = '2d'; });

it('known wrong result: #1928 published elements can be recognized by hand on a model with no physical groups', () => {
  uiStore.analysisMode = 'pro';
  modelStore.clear();
  modelStore.addElement(modelStore.addNode(0, 0, 0), modelStore.addNode(0, 0, 3), 'frame');
  expect(render(ProPhysicalPanel).body).toContain('data-testid="physical-recognize"');
  expect(physicalGroups()).toHaveLength(0);
  const prepare = () => render(DeskPrepare, { props: { empty: true } }).body;
  expect(prepare()).toContain('data-testid="desk-route-recognize"');
  expect(prepare()).toContain(t('desk.prep.miss.pieces'));
  expect(recognizePhysicalElements()).toBeGreaterThan(0);
  expect(prepare()).not.toContain(t('desk.prep.miss.pieces'));
  expect(render(ProPhysicalPanel).body).toContain('data-testid="physical-table"');
});

it.skip('known wrong result: #1928 published preparation lists levels before physical recognition', () => {
  uiStore.analysisMode = 'pro';
  modelStore.clear();
  const list = render(DeskPrepare, { props: { empty: true } }).body.split('data-testid="desk-route-existing-missing"')[1]!.split('</ul>')[0]!;
  const levels = list.indexOf(t('desk.prep.miss.levels'));
  expect(levels).toBeGreaterThanOrEqual(0);
  expect(list.indexOf(t('desk.prep.miss.pieces'))).toBeGreaterThan(levels);
});
