/**
 * Entry of the research viewer bundle (vite.research-viewer.config.ts): the app's
 * ScalarFieldViewer, built on its own so research pages can load it at run time without changing
 * how the application's chunks are split. The page passes plain data and gets an update handle.
 */
import { mount, unmount } from 'svelte';
import { setLocale } from '../../lib/i18n';
import ScalarFieldViewer from './ScalarFieldViewer.svelte';

export type ViewerProps = Record<string, unknown>;

export function mountScalarFieldViewer(target: HTMLElement, initial: ViewerProps) {
  if (typeof initial.locale === 'string') setLocale(initial.locale);
  const props = $state({ ...initial });
  const component = mount(ScalarFieldViewer, { target, props: props as never }) as { fit?: () => void };
  return {
    update(next: ViewerProps) {
      if (typeof next.locale === 'string') setLocale(next.locale);
      Object.assign(props, next);
    },
    fit() {
      component.fit?.();
    },
    destroy() {
      unmount(component);
    },
  };
}
