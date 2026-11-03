/**
 * What the command search finds beyond the ribbon: the Project tab's actions, the view's presets
 * and its "show everything", and the settings. Each runs as its own button would.
 */
import type { ProCmd } from './stages';
import { proNav } from '../store/pro-nav.svelte';
import { uiStore } from '../store';
import { viewCategories } from '../store/view-categories.svelte';
import { viewState, viewVisibility } from '../store/view-state.svelte';
import { requestAutosave } from '../store/autosave-service';

export interface PaletteAction { cmd: ProCmd; pathKey: string }

const camera = (face: string) => () => window.dispatchEvent(new CustomEvent('stabileo-camera-view', { detail: face }));

export function paletteActions(): PaletteAction[] {
  const project = 'ribbon.project', view = 'view.title', settings = 'config.title';
  const a = (id: string, labelKey: string, pathKey: string, action: () => void): PaletteAction => ({ cmd: { id: `act-${id}`, labelKey, action }, pathKey });
  return [
    a('save', 'project.save', project, () => proNav.ask('save')),
    a('save-now', 'save.clickToSave', project, () => { void requestAutosave('manual'); }),
    a('examples', 'pro.exampleBtn', project, () => proNav.ask('examples')),
    a('report', 'proExport.reportBtn', project, () => window.dispatchEvent(new Event('stabileo-open-report'))),
    a('results', 'proExport.resultsBtn', project, () => proNav.ask('data')),
    a('drawings', 'proExport.drawingsBtn', project, () => proNav.ask('drawings')),
    a('reproduce', 'provenance.reproduce.link', project, () => window.dispatchEvent(new Event('stabileo-reproduce'))),
    a('regulations', 'regulations.title', project, () => proNav.openRegulations()),
    ...(['top', 'front', 'right', 'iso'] as const).map((f) => a(`view-${f}`, `view.preset.${f}`, view, camera(f))),
    a('split', 'viewport.split', view, () => { viewState.split = !viewState.split; }),
    a('plan', 'viewport.planView', view, () => { uiStore.planView3D = !uiStore.planView3D; }),
    a('zoom-all', 'view.zoomAll', view, () => window.dispatchEvent(new CustomEvent('stabileo-zoom-to-fit'))),
    a('show-all', 'view.catReset', view, () => { viewCategories.reset(); viewVisibility.showAll(); }),
    a('settings', 'config.title', settings, () => { uiStore.proActiveTab = 'settings'; uiStore.proPanelVisible = true; }),
    a('inline-help', 'config.inlineHelp', settings, () => { uiStore.inlineHelp = !uiStore.inlineHelp; }),
  ];
}
