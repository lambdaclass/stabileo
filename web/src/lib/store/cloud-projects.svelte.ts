import { projectsApi, type CloudProject } from '../api/projects';
import { ApiError } from '../api/client';
import { APP_VERSION } from '../build-info';
import { gzipBase64, gunzipBase64 } from '../utils/gzip-base64';
import { trackUsage } from '../telemetry/usage';
import { modelStore, uiStore, tabManager } from '.';
import { serializeProject, loadProject } from './file';
import { authStore } from './auth.svelte';
import { cloudLink } from './cloud-link.svelte';

let items = $state<CloudProject[]>([]);
let total = $state(0);
let used = $state(0);
let maxProjects = $state(1);
let loading = $state(false);
let saving = $state(false);
let latestList = 0;

function tabKey(): string {
  return tabManager.activeTabId ?? 'default';
}

function accountId(): string | null {
  return authStore.account?.id ?? null;
}

export function isProjectConflict(e: unknown): boolean {
  return e instanceof ApiError && e.status === 409 && e.code === 'project_conflict';
}

/** Everything a save sends and where it goes, taken at once before anything is awaited. */
function capture() {
  const tab = tabKey();
  const account = accountId();
  return {
    tab,
    account,
    generation: cloudLink.generation(tab),
    linked: cloudLink.link(tab, account),
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

function remember(saved: CloudProject): void {
  items = [saved, ...items.filter((p) => p.id !== saved.id)];
}

export const cloudProjects = {
  get items() { return items; },
  get total() { return total; },
  get used() { return used; },
  get maxProjects() { return maxProjects; },
  get loading() { return loading; },
  get saving() { return saving; },
  get atLimit() { return used >= maxProjects; },
  get linkedId(): string | null {
    return cloudLink.get(tabKey(), accountId());
  },

  /** Only the latest call writes the list, so a slow answer to an older search never replaces a newer one. */
  async refresh(search?: string): Promise<void> {
    const call = ++latestList;
    loading = true;
    try {
      const list = await projectsApi.list({ search });
      if (call !== latestList) return;
      items = list.data;
      total = list.meta.total;
      used = list.meta.used;
      maxProjects = list.meta.max_projects;
    } finally {
      if (call === latestList) loading = false;
    }
  },

  /**
   * Updates the project this tab came from, or creates one; `asNew` always creates. An update the
   * server refuses because the project was saved elsewhere since this tab received it throws the
   * 409 `project_conflict` (`isProjectConflict`) and changes nothing.
   */
  async saveCurrent(opts: { asNew?: boolean } = {}): Promise<CloudProject> {
    saving = true;
    try {
      const at = capture();
      const linked = opts.asNew ? null : at.linked;
      const body = { ...at.meta, content: await gzipBase64(at.text) };
      const saved = linked ? await projectsApi.update(linked.id, { ...body, revision: linked.revision }) : await projectsApi.create(body);
      cloudLink.set(at.tab, { id: saved.id, account: at.account, revision: saved.revision }, at.generation);
      trackUsage('project.cloud_save', { mode: body.app_mode, update: Boolean(linked) });
      remember(saved);
      if (!linked) {
        total += 1;
        used += 1;
      }
      return saved;
    } finally {
      saving = false;
    }
  },

  /** Overwrites a listed project with the open model, name included, and links this tab to it. */
  async replace(project: CloudProject): Promise<CloudProject> {
    saving = true;
    try {
      const at = capture();
      const body = { ...at.meta, content: await gzipBase64(at.text) };
      const saved = await projectsApi.update(project.id, { ...body, revision: project.revision });
      cloudLink.set(at.tab, { id: saved.id, account: at.account, revision: saved.revision }, at.generation);
      trackUsage('project.cloud_save', { mode: body.app_mode, update: true, replace: true });
      remember(saved);
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
    if (tabKey() === tab) cloudLink.set(tab, { id: project.id, account, revision: project.revision });
    trackUsage('project.cloud_open', { mode: project.app_mode });
  },

  async rename(project: CloudProject, name: string): Promise<void> {
    const updated = await projectsApi.update(project.id, { name, revision: project.revision });
    cloudLink.advance(project.id, project.revision, updated.revision);
    items = items.map((p) => (p.id === project.id ? updated : p));
  },

  async remove(id: string): Promise<void> {
    await projectsApi.remove(id);
    items = items.filter((p) => p.id !== id);
    total = Math.max(0, total - 1);
    used = Math.max(0, used - 1);
    cloudLink.forgetProject(id);
  },
};
