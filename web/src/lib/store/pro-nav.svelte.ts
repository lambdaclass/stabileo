/**
 * Going to a place in PRO with it open.
 *
 * The load generator's "Open the project's regulations" switched to the Design tab and left the
 * regulations section there closed, so the link landed on a page that did not show what it
 * named. The regulations are also offered in the Project tab now — they are the project's, and
 * the seismic and wind generators need them long before design — and this opens them there.
 */
import { uiStore } from './ui.svelte';

let regulationsOpen = $state(false);
let projectInfoOpen = $state(false);

export const proNav = {
  get regulationsOpen() { return regulationsOpen; },
  set regulationsOpen(v: boolean) { regulationsOpen = v; },
  get projectInfoOpen() { return projectInfoOpen; },
  set projectInfoOpen(v: boolean) { projectInfoOpen = v; },
  /** The Project tab, with the project's data open (client, job, revisions, signatures). */
  openProjectInfo() {
    projectInfoOpen = true;
    uiStore.proActiveTab = 'project';
    uiStore.proPanelVisible = true;
  },
  /** The Project tab, with its regulations section open and in view. */
  openRegulations() {
    regulationsOpen = true;
    uiStore.proActiveTab = 'project';
  },
};
