import { projectsApi, type CloudProject } from '../api/projects';
import { APP_VERSION } from '../build-info';
import { gzipBase64, gunzipBase64 } from '../utils/gzip-base64';
import { trackUsage } from '../telemetry/usage';
import { modelStore, uiStore, tabManager } from '.';
import { serializeProject, loadProject } from './file';
import { authStore } from './auth.svelte';
import { cloudLink } from './cloud-link.svelte';
import { milestone } from '../tracking/activity.svelte';

let items = $state<CloudProject[]>([]);
let total = $state(0);
let maxProjects = $state(1);
let loading = $state(false);
let saving = $state(false);

function tabKey(): string {
  return tabManager.activeTabId ?? 'default';
}

function accountId(): string | null {
  return authStore.account?.id ?? null;
}

/** Everything a save sends and where it goes, taken at once before anything is awaited. */
function capture() {
  const tab = tabKey();
  const account = accountId();
  return {
    tab,
    account,
    generation: cloudLink.generation(tab),
    linked: cloudLink.get(tab, account),
    text: serializeProject(),
    meta: {
      name: modelStore.model.name.trim() || 'Stabileo',
      app_mode: uiStore.appMode === 'pro' ? ('pro' as const) : ('basic' as const),
      node_count: modelStore.nodes.size,
      element_count: modelStore.elements.size,
      app_version: APP_VERSION,
    },
  };
}

export const cloudProjects = {
  get items() { return items; },
  get total() { return total; },
  get maxProjects() { return maxProjects; },
  get loading() { return loading; },
  get saving() { return saving; },
  get atLimit() { return total >= maxProjects; },
  get linkedId(): string | null {
    return cloudLink.get(tabKey(), accountId());
  },

  async refresh(search?: string): Promise<void> {
    loading = true;
    try {
      const list = await projectsApi.list({ search });
      items = list.data;
      total = list.meta.total;
      maxProjects = list.meta.max_projects;
    } finally {
      loading = false;
    }
  },

  /** Updates the project this tab came from, or creates one; `asNew` always creates. */
  async saveCurrent(opts: { asNew?: boolean } = {}): Promise<CloudProject> {
    saving = true;
    try {
      const at = capture();
      const id = opts.asNew ? null : at.linked;
      const body = { ...at.meta, content: await gzipBase64(at.text) };
      const saved = id ? await projectsApi.update(id, body) : await projectsApi.create(body);
      cloudLink.set(at.tab, { id: saved.id, account: at.account }, at.generation);
      trackUsage('project.cloud_save', { mode: body.app_mode, update: Boolean(id) });
      milestone('first_save');
      items = [saved, ...items.filter((p) => p.id !== saved.id)];
      if (!id) total += 1;
      return saved;
    } finally {
      saving = false;
    }
  },

  /** Overwrites a saved project with the open model, name included, and links this tab to it. */
  async replace(id: string): Promise<CloudProject> {
    saving = true;
    try {
      const at = capture();
      const body = { ...at.meta, content: await gzipBase64(at.text) };
      const saved = await projectsApi.update(id, body);
      cloudLink.set(at.tab, { id: saved.id, account: at.account }, at.generation);
      trackUsage('project.cloud_save', { mode: body.app_mode, update: true, replace: true });
      milestone('first_save');
      items = [saved, ...items.filter((p) => p.id !== saved.id)];
      return saved;
    } finally {
      saving = false;
    }
  },

  async open(id: string): Promise<void> {
    const account = accountId();
    const project = await projectsApi.get(id);
    const text = await gunzipBase64(project.content);
    const tab = tabKey();
    await loadProject(new File([text], `${project.name}.ded`, { type: 'application/json' }));
    if (tabKey() === tab) cloudLink.set(tab, { id: project.id, account });
    trackUsage('project.cloud_open', { mode: project.app_mode });
  },

  async rename(id: string, name: string): Promise<void> {
    const updated = await projectsApi.update(id, { name });
    items = items.map((p) => (p.id === id ? updated : p));
  },

  async remove(id: string): Promise<void> {
    await projectsApi.remove(id);
    items = items.filter((p) => p.id !== id);
    total = Math.max(0, total - 1);
    cloudLink.forgetProject(id);
  },
};
