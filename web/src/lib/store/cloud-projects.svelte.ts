import { projectsApi, type CloudProject } from '../api/projects';
import { APP_VERSION } from '../build-info';
import { gzipBase64, gunzipBase64 } from '../utils/gzip-base64';
import { trackUsage } from '../telemetry/usage';
import { modelStore, uiStore, tabManager } from '.';
import { serializeProject, loadProject } from './file';
import { authStore } from './auth.svelte';
import { cloudLinks } from './cloud-link.svelte';

let items = $state<CloudProject[]>([]);
let total = $state(0);
let accountTotal = $state(0);
let maxProjects = $state(1);
let loading = $state(false);
let saving = $state(false);
let owner = $state<string | null>(null);

/** Everything held here belongs to one account: another sign-in starts from nothing. */
function sameOwner(): boolean {
  const me = authStore.account?.id ?? null;
  if (me === owner) return true;
  owner = me;
  items = [];
  total = 0;
  accountTotal = 0;
  cloudLinks.clear();
  return false;
}

function mine(): boolean {
  return (authStore.account?.id ?? null) === owner;
}

function tabKey(): string {
  return tabManager.activeTabId ?? 'default';
}

function mode(): 'basic' | 'pro' {
  return uiStore.appMode === 'pro' ? 'pro' : 'basic';
}

async function payload() {
  const text = serializeProject();
  const meta = {
    name: modelStore.model.name.trim() || 'Stabileo',
    app_mode: mode(),
    node_count: modelStore.nodes.size,
    element_count: modelStore.elements.size,
    app_version: APP_VERSION,
  };
  return { ...meta, content: await gzipBase64(text) };
}

export const cloudProjects = {
  get items() { return mine() ? items : []; },
  get total() { return mine() ? total : 0; },
  get maxProjects() { return maxProjects; },
  get loading() { return loading; },
  get saving() { return saving; },
  get atLimit() { return mine() && accountTotal >= maxProjects; },
  get linkedId(): string | null {
    return mine() ? cloudLinks.get(tabKey()) : null;
  },

  async refresh(search?: string): Promise<void> {
    sameOwner();
    loading = true;
    try {
      const list = await projectsApi.list({ search });
      items = list.data;
      total = list.meta.total;
      if (!search) accountTotal = list.meta.total;
      maxProjects = list.meta.max_projects;
    } finally {
      loading = false;
    }
  },

  /** Updates the project this tab came from, or creates one; `asNew` always creates. */
  async saveCurrent(opts: { asNew?: boolean } = {}): Promise<CloudProject> {
    saving = true;
    try {
      sameOwner();
      const tab = tabKey();
      const id = opts.asNew ? null : cloudLinks.get(tab);
      const body = await payload();
      const saved = id ? await projectsApi.update(id, body) : await projectsApi.create(body);
      cloudLinks.set(tab, saved.id);
      trackUsage('project.cloud_save', { mode: body.app_mode, update: Boolean(id) });
      items = [saved, ...items.filter((p) => p.id !== saved.id)];
      if (!id) {
        total += 1;
        accountTotal += 1;
      }
      return saved;
    } finally {
      saving = false;
    }
  },

  /** Overwrites a saved project with the open model, name included, and links this tab to it. */
  async replace(id: string): Promise<CloudProject> {
    saving = true;
    try {
      sameOwner();
      const tab = tabKey();
      const body = await payload();
      const saved = await projectsApi.update(id, body);
      cloudLinks.set(tab, saved.id);
      trackUsage('project.cloud_save', { mode: body.app_mode, update: true, replace: true });
      items = [saved, ...items.filter((p) => p.id !== saved.id)];
      return saved;
    } finally {
      saving = false;
    }
  },

  async open(id: string): Promise<void> {
    const project = await projectsApi.get(id);
    const text = await gunzipBase64(project.content);
    await loadProject(new File([text], `${project.name}.ded`, { type: 'application/json' }));
    cloudLinks.set(tabKey(), project.id);
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
    accountTotal = Math.max(0, accountTotal - 1);
    cloudLinks.forgetProject(id);
  },
};
