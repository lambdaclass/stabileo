import { uiStore } from './ui.svelte';
import { projectSettings } from './project-settings.svelte';

/** Something the Project tab does as it opens: asked for from the command search. */
export type ProjectRequest = 'save' | 'data' | 'drawings' | 'viewerLink';
let request = $state<ProjectRequest | null>(null);

export const proNav = {
  openProjectInfo() { projectSettings.show('data'); },
  get request() { return request; },
  /** Take the pending request, once. */
  takeRequest(): ProjectRequest | null { const r = request; request = null; return r; },
  /** The Project tab, doing `r`. */
  ask(r: ProjectRequest) {
    request = r;
    uiStore.proActiveTab = 'project';
    uiStore.proPanelVisible = true;
  },
  openRegulations() { projectSettings.show('regulations'); },
};
