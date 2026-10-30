import { expect, it, vi } from 'vitest';
const mounted = vi.hoisted(() => ({ props: {} as Record<string, unknown> }));
vi.mock('svelte', () => ({ mount: (_: unknown, options: { props: Record<string, unknown> }) => { mounted.props = options.props; return {}; }, unmount: vi.fn() }));
vi.mock('./ScalarFieldViewer.svelte', () => ({ default: {} }));
import { mountScalarFieldViewer } from './scalar-field-viewer-entry.svelte';
it('mounts and updates only the viewer locale without touching stored language', () => {
  const setItem = vi.fn();
  vi.stubGlobal('localStorage', { getItem: () => 'fr', setItem });
  try {
    const viewer = mountScalarFieldViewer({} as HTMLElement, { locale: 'de' });
    expect(mounted.props.locale).toBe('de');
    viewer.update({ locale: 'tr' });
    expect(mounted.props.locale).toBe('tr');
    expect(localStorage.getItem('stabileo-lang')).toBe('fr');
    expect(setItem).not.toHaveBeenCalled();
    viewer.destroy();
  } finally { vi.unstubAllGlobals(); }
});
