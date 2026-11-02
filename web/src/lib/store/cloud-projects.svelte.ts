import { projectsApi, type CloudProject } from '../api/projects';
import { APP_VERSION } from '../build-info';
import { gzipBase64, gunzipBase64 } from '../utils/gzip-base64';
import { trackUsage } from '../telemetry/usage';
import { modelStore, uiStore, tabManager } from '.';
import { serializeProject, loadProjectText } from './file';
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

/** An answer to a request made for `who` is applied only while `who` is still the one signed in. */
function stillFor(who: string | null): boolean {
  return owner === who && mine();
}

let listRequest = 0;

function guard(who: string | null): void {
  if (!stillFor(who)) throw new Error('signed-in account changed');
}

function tabKey(): string {
  return tabManager.activeTabId ?? 'default';
}

function mode(): 'basic' | 'pro' {
  return uiStore.appMode === 'pro' ? 'pro' : 'basic';
}

function snapshot(linkedTab?: string) {
  const own = modelStore.model.name.trim() || 'Stabileo';
  return {
    text: serializeProject(),
    meta: {
      name: linkedTab ? cloudLinks.name(linkedTab, own) : own,
      app_mode: mode(),
      node_count: modelStore.nodes.size,
      element_count: modelStore.elements.size,
      app_version: APP_VERSION,
    },
  };
}

let saveQueue: Promise<unknown> = Promise.resolve();

/** Saves run one after another, so each starts from the revision the one before it left. */
function queued<T>(run: () => Promise<T>): Promise<T> {
  const next = saveQueue.then(run);
  saveQueue = next.catch(() => {});
  return next;
}

async function saveNow(opts: { asNew?: boolean }): Promise<CloudProject> {
  saving = true;
  try {
    sameOwner();
    const who = owner;
    const tab = tabKey();
    const generation = cloudLinks.generation(tab);
    const edit = modelStore.modelVersion;
    const id = opts.asNew ? null : cloudLinks.get(tab);
    const revision = cloudLinks.revision(tab);
    const { text, meta } = snapshot(id ? tab : undefined);
    const body = { ...meta, content: await gzipBase64(text) };
    guard(who);
    const saved = id ? await projectsApi.update(id, { ...body, revision }) : await projectsApi.create(body);
    if (!stillFor(who)) return saved;
    cloudLinks.setIf(tab, generation, saved.id, saved.revision, saved.name, edit);
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
}

async function replaceNow(id: string): Promise<CloudProject> {
  saving = true;
  try {
    sameOwner();
    const who = owner;
    const tab = tabKey();
    const generation = cloudLinks.generation(tab);
    const edit = modelStore.modelVersion;
    const listed = items.find((p) => p.id === id)?.revision;
    const { text, meta } = snapshot();
    const body = { ...meta, content: await gzipBase64(text) };
    guard(who);
    const saved = await projectsApi.update(id, { ...body, revision: listed });
    if (!stillFor(who)) return saved;
    cloudLinks.setIf(tab, generation, saved.id, saved.revision, saved.name, edit);
    trackUsage('project.cloud_save', { mode: body.app_mode, update: true, replace: true });
    items = [saved, ...items.filter((p) => p.id !== saved.id)];
    return saved;
  } finally {
    saving = false;
  }
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
  /** Whether opening another project here would lose work: a model edited since its last cloud open or save, or never saved there. */
  get openWouldReplaceWork(): boolean {
    const empty = modelStore.nodes.size === 0 && modelStore.elements.size === 0;
    return !empty && !(mine() && cloudLinks.synced(tabKey(), modelStore.modelVersion));
  },

  async refresh(search?: string): Promise<void> {
    sameOwner();
    const who = owner;
    const request = ++listRequest;
    loading = true;
    try {
      const list = await projectsApi.list({ search });
      if (!stillFor(who) || request !== listRequest) return;
      items = list.data;
      total = list.meta.total;
      if (!search) accountTotal = list.meta.total;
      maxProjects = list.meta.max_projects;
    } finally {
      loading = false;
    }
  },

  /** Updates the project this tab came from, or creates one; `asNew` always creates. */
  saveCurrent(opts: { asNew?: boolean } = {}): Promise<CloudProject> {
    return queued(() => saveNow(opts));
  },

  /** Overwrites a saved project with the open model, name included, and links this tab to it. */
  replace(id: string): Promise<CloudProject> {
    return queued(() => replaceNow(id));
  },

  /** Loads the project into this tab's document; false when the tab, the document or an edit moved on while it downloaded. */
  async open(id: string): Promise<boolean> {
    sameOwner();
    const who = owner;
    const tab = tabKey();
    const generation = cloudLinks.generation(tab);
    const edit = modelStore.modelVersion;
    const project = await projectsApi.get(id);
    const text = await gunzipBase64(project.content);
    if (!stillFor(who) || tabKey() !== tab || cloudLinks.generation(tab) !== generation || modelStore.modelVersion !== edit) return false;
    loadProjectText(text);
    modelStore.model.name = project.name;
    cloudLinks.set(tab, project.id, project.revision, project.name, modelStore.modelVersion);
    trackUsage('project.cloud_open', { mode: project.app_mode });
    return true;
  },

  async rename(id: string, name: string): Promise<void> {
    sameOwner();
    const who = owner;
    const before = items.find((p) => p.id === id)?.revision;
    const updated = await projectsApi.update(id, { name });
    if (!stillFor(who)) return;
    const tab = tabKey();
    const renameHere = cloudLinks.get(tab) === id && cloudLinks.keepsCloudName(tab, modelStore.model.name.trim());
    if (renameHere) modelStore.model.name = updated.name;
    cloudLinks.renamed(id, updated.name, before, updated.revision, renameHere ? tab : '');
    items = items.map((p) => (p.id === id ? updated : p));
  },

  async remove(id: string): Promise<void> {
    sameOwner();
    const who = owner;
    await projectsApi.remove(id);
    if (!stillFor(who)) return;
    items = items.filter((p) => p.id !== id);
    total = Math.max(0, total - 1);
    accountTotal = Math.max(0, accountTotal - 1);
    cloudLinks.forgetProject(id);
  },
};
