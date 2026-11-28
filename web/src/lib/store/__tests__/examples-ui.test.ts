import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

async function fresh() {
  vi.resetModules();
  return (await import('../examples-ui.svelte')).examplesUi;
}

describe('examplesUi', () => {
  beforeEach(() => store.clear());

  it('opens one view at a time and closes it', async () => {
    const ui = await fresh();
    expect(ui.view).toBeNull();
    ui.open('examples');
    expect(ui.view).toBe('examples');
    ui.open('tutorials');
    expect(ui.view).toBe('tutorials');
    ui.close();
    expect(ui.view).toBeNull();
  });

  it('takes the shelf it is asked for, and forgets it when opened without one', async () => {
    const ui = await fresh();
    ui.open('examples', 'space');
    expect(ui.shelf).toBe('space');
    ui.open('examples');
    expect(ui.shelf).toBeNull();
  });

  it('dismisses the start card for one tab only', async () => {
    const ui = await fresh();
    expect(ui.startDismissedFor('tab-a')).toBe(false);
    ui.dismissStart('tab-a');
    expect(ui.startDismissedFor('tab-a')).toBe(true);
    expect(ui.startDismissedFor('tab-b')).toBe(false);
  });

  it('remembers that the start card was turned off', async () => {
    let ui = await fresh();
    expect(ui.startOff).toBe(false);
    ui.startOff = true;
    expect(store.get('stabileo-start-card')).toBe('off');
    ui = await fresh();
    expect(ui.startOff).toBe(true);
    ui.startOff = false;
    expect((await fresh()).startOff).toBe(false);
  });
});
