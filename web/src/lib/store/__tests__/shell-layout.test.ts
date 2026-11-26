import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

describe('shellLayout', () => {
  beforeEach(() => {
    store.clear();
    vi.resetModules();
  });

  it('puts the panel on the left until told otherwise', async () => {
    const { shellLayout } = await import('../shell-layout.svelte');
    expect(shellLayout.panelSide).toBe('left');
  });

  it('toggles between the sides and remembers the choice', async () => {
    const { shellLayout } = await import('../shell-layout.svelte');
    shellLayout.toggle();
    expect(shellLayout.panelSide).toBe('right');
    expect(localStorage.getItem('stabileo-panel-side')).toBe('right');
    shellLayout.toggle();
    expect(shellLayout.panelSide).toBe('left');
    expect(localStorage.getItem('stabileo-panel-side')).toBe('left');
  });

  it('reads a stored side on load, and anything unknown as left', async () => {
    localStorage.setItem('stabileo-panel-side', 'right');
    expect((await import('../shell-layout.svelte')).shellLayout.panelSide).toBe('right');
    vi.resetModules();
    localStorage.setItem('stabileo-panel-side', 'middle');
    expect((await import('../shell-layout.svelte')).shellLayout.panelSide).toBe('left');
  });
});
