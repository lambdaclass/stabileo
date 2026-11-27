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

  it('gives every mode one panel width, and keeps a dragged one', async () => {
    const { shellLayout, DEFAULT_PANEL_WIDTH } = await import('../shell-layout.svelte');
    expect(shellLayout.panelWidth).toBe(DEFAULT_PANEL_WIDTH);
    shellLayout.panelWidth = 512.4;
    shellLayout.rememberWidth();
    vi.resetModules();
    expect((await import('../shell-layout.svelte')).shellLayout.panelWidth).toBe(512);
  });

  it('opens the panel at start until it is closed, and then remembers that', async () => {
    const { shellLayout } = await import('../shell-layout.svelte');
    expect(shellLayout.panelOpenAtStart).toBe(true);
    shellLayout.rememberPanelOpen(false);
    expect(shellLayout.panelOpenAtStart).toBe(false);
    shellLayout.rememberPanelOpen(true);
    expect(shellLayout.panelOpenAtStart).toBe(true);
  });
});
