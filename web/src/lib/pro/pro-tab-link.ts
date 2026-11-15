import { uiStore } from '../store/ui.svelte';
import { isDesignTab } from './design-navigation';
import { askDesignForLink } from '../store/design-presence';

/** The panel views `?proTab=<id>` may open; a view added to `ProPanel` and not here makes the link a silent no-op. */
export const PRO_TAB_LINKS = ['project', 'nodes', 'elements', 'shells', 'materials', 'sections', 'supports',
  'specifications', 'constraints', 'loads', 'advanced', 'results', 'rcSheets', 'design', 'connections', 'diagnostics',
  'settings', 'selection', 'steel', 'grid', 'generators', 'transform', 'edit', 'groups', 'code', 'view',
  'otherCodes', 'designData', 'desk'] as const;

/**
 * `?proTab=<id>` opens PRO on one of its views. A place of design while design is off asks the
 * reader and turns nothing on.
 */
export function openProTabFromQuery(params: URLSearchParams): void {
  const tab = params.get('proTab');
  if (!tab || !(PRO_TAB_LINKS as readonly string[]).includes(tab)) return;
  if (isDesignTab(tab) && !uiStore.designInPro) { askDesignForLink(tab); return; }
  uiStore.proActiveTab = tab;
}
