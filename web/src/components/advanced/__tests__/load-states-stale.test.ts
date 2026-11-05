import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';

const state = vi.hoisted(() => ({ dirty: false }));

vi.mock('../../../lib/store', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../../lib/store')>();
  const results = new Proxy(orig.resultsStore, {
    get(target, key, recv) {
      if (key === 'combinationsDirty') return state.dirty;
      if (key === 'perCombo') return new Map([[1, {}]]);
      return Reflect.get(target, key, recv);
    },
  });
  const ui = new Proxy(orig.uiStore, {
    get(target, key, recv) {
      if (key === 'loadCasesEnabled') return true;
      if (key === 'is3DWorkspace') return false;
      return Reflect.get(target, key, recv);
    },
  });
  return { ...orig, resultsStore: results, uiStore: ui };
});

vi.mock('../../../lib/actions/load-states', () => ({
  addCirsocCombinations: vi.fn(),
  openLoadsTable: vi.fn(),
  governingByMember: () => new Map([[1, { moment: { comboName: 'C1', value: 10 } }]]),
}));

afterEach(() => { state.dirty = false; });

it('shows the envelope and the governing combinations only while the combination results are current', async () => {
  const { default: Panel } = await import('../LoadStatesPanel.svelte');
  const fresh = render(Panel, { props: { onInfluence: () => {} } }).body;
  expect(fresh).toContain('data-testid="load-states-envelope"');
  expect(fresh).toContain('data-testid="load-states-governing"');
  expect(fresh).not.toContain('data-testid="load-states-solve"');
  state.dirty = true;
  const stale = render(Panel, { props: { onInfluence: () => {} } }).body;
  expect(stale).not.toContain('data-testid="load-states-envelope"');
  expect(stale).not.toContain('data-testid="load-states-governing"');
  expect(stale).toContain('data-testid="load-states-solve"');
});
