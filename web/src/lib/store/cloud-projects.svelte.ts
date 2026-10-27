import { projectsApi, type CloudProject } from '../api/projects';
import { APP_VERSION } from '../build-info';
import { gzipBase64, gunzipBase64 } from '../utils/gzip-base64';
import { trackUsage } from '../telemetry/usage';
import { modelStore, uiStore, tabManager } from '.';
import { serializeProject, loadProject } from './file';

let items = $state<CloudProject[]>([]);
let total = $state(0);
let maxProjects = $state(100);
let loading = $state(false);
let saving = $state(false);
const linked = new Map<string, string>();
let linkedVersion = $state(0);

function tabKey(): string {
  return tabManager.activeTabId ?? 'default';
}

function mode(): 'basic' | 'pro' {
  return uiStore.appMode === 'pro' ? 'pro' : 'basic';
}

async function payload() {
  const text = serializeProject();
  return {
    name: modelStore.model.name.trim() || 'Stabileo',
    app_mode: mode(),
    content: await gzipBase64(text),
    node_count: modelStore.nodes.size,
    element_count: modelStore.elements.size,
    app_version: APP_VERSION,
  };
}

export const cloudProjects = {
  get items() { return items; },
  get total() { return total; },
  get maxProjects() { return maxProjects; },
  get loading() { return loading; },
  get saving() { return saving; },
  get linkedId(): string | null {
    void linkedVersion;
    return linked.get(tabKey()) ?? null;
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
      const body = await payload();
      const id = opts.asNew ? null : linked.get(tabKey());
      const saved = id ? await projectsApi.update(id, body) : await projectsApi.create(body);
      linked.set(tabKey(), saved.id);
      linkedVersion += 1;
      trackUsage('project.cloud_save', { mode: body.app_mode, update: Boolean(id) });
      items = [saved, ...items.filter((p) => p.id !== saved.id)];
      if (!id) total += 1;
      return saved;
    } finally {
      saving = false;
    }
  },

  async open(id: string): Promise<void> {
    const project = await projectsApi.get(id);
    const text = await gunzipBase64(project.content);
    await loadProject(new File([text], `${project.name}.ded`, { type: 'application/json' }));
    linked.set(tabKey(), project.id);
    linkedVersion += 1;
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
    for (const [tab, linkedId] of linked) if (linkedId === id) linked.delete(tab);
    linkedVersion += 1;
  },
};
