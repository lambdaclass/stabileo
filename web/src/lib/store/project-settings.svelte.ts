export type ProjectSettingsPage = 'data' | 'regulations' | 'templates';

let page = $state<ProjectSettingsPage | null>(null);

export const projectSettings = {
  get page() { return page; },
  set page(p: ProjectSettingsPage | null) { page = p; },
  show(p: ProjectSettingsPage = 'data') { page = p; },
  close() { page = null; },
};
