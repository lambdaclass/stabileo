import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cloudProjects } from '../cloud-projects.svelte';
import { modelStore, tabManager } from '..';
import { gzipBase64, gunzipBase64 } from '../../utils/gzip-base64';
import { serializeProject } from '../file';
import { authStore } from '../auth.svelte';

type Seen = { method: string; path: string; body: Record<string, unknown> | undefined };

let seen: Seen[];
let replies: Map<string, (body: Record<string, unknown> | undefined) => Response | Promise<Response>>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function meta(id: string, name = 'Frame', revision = 1) {
  return { id, name, revision, app_mode: 'basic', content_bytes: 10, node_count: 2, element_count: 1, app_version: 'dev', inserted_at: '2026-10-27T12:00:00Z', updated_at: '2026-10-27T12:00:00Z' };
}

beforeEach(() => {
  seen = [];
  replies = new Map();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const path = new URL(url, 'http://x').pathname;
    const body = init.body === undefined ? undefined : JSON.parse(String(init.body));
    seen.push({ method: String(init.method), path, body });
    const reply = replies.get(`${init.method} ${path}`);
    if (!reply) throw new Error(`unexpected ${init.method} ${path}`);
    return reply(body);
  }));
  modelStore.clear();
  const a = modelStore.addNode(0, 0);
  const b = modelStore.addNode(4, 0);
  modelStore.addElement(a, b);
  modelStore.model.name = 'Pórtico de prueba';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cloud projects', () => {
  it('saves the open project gzipped, then updates the same one, and creates another on "save as new"', async () => {
    replies.set('POST /api/v1/projects', () => json(201, { data: meta('p1', 'Pórtico de prueba') }));
    replies.set('PUT /api/v1/projects/p1', () => json(200, { data: meta('p1', 'Pórtico de prueba') }));

    await cloudProjects.saveCurrent();
    const created = seen[0];
    expect(created.method).toBe('POST');
    expect(created.body).toMatchObject({ name: 'Pórtico de prueba', app_mode: 'basic', node_count: 2, element_count: 1 });
    const sent = JSON.parse(await gunzipBase64(String(created.body!.content)));
    const local = JSON.parse(serializeProject());
    expect({ ...sent, timestamp: null }).toEqual({ ...local, timestamp: null });
    expect(cloudProjects.linkedId).toBe('p1');

    await cloudProjects.saveCurrent();
    expect(seen[1].method).toBe('PUT');
    expect(seen[1].path).toBe('/api/v1/projects/p1');

    replies.set('POST /api/v1/projects', () => json(201, { data: meta('p2') }));
    await cloudProjects.saveCurrent({ asNew: true });
    expect(seen[2].method).toBe('POST');
    expect(cloudProjects.linkedId).toBe('p2');
  });

  it('opens a cloud project into the store', async () => {
    const saved = serializeProject();
    modelStore.clear();
    modelStore.model.name = 'Otro';
    const content = await gzipBase64(saved);
    replies.set('GET /api/v1/projects/p9', () => json(200, { data: { ...meta('p9', 'Pórtico de prueba'), content } }));

    await cloudProjects.open('p9');
    expect(modelStore.model.name).toBe('Pórtico de prueba');
    expect(modelStore.nodes.size).toBe(2);
    expect(cloudProjects.linkedId).toBe('p9');
  });

  it('lists, renames and deletes, keeping the list in step', async () => {
    replies.set('GET /api/v1/projects', () => json(200, { data: [meta('a', 'A'), meta('b', 'B')], meta: { total: 2, limit: 100, offset: 0, max_projects: 100, max_bytes: 1 } }));
    replies.set('PUT /api/v1/projects/a', (body) => json(200, { data: meta('a', String(body!.name)) }));
    replies.set('DELETE /api/v1/projects/b', () => json(200, { data: meta('b', 'B') }));

    await cloudProjects.refresh();
    expect(cloudProjects.items.map((p) => p.name)).toEqual(['A', 'B']);
    expect(cloudProjects.total).toBe(2);

    await cloudProjects.rename('a', 'Renamed');
    expect(seen.at(-1)!.body).toEqual({ name: 'Renamed' });
    expect(cloudProjects.items[0].name).toBe('Renamed');

    await cloudProjects.remove('b');
    expect(cloudProjects.items.map((p) => p.id)).toEqual(['a']);
    expect(cloudProjects.total).toBe(1);
  });

  it('passes the server refusal through, with its code', async () => {
    replies.set('POST /api/v1/projects', () => json(409, { error: 'project_limit_reached', message: 'limit' }));
    const err = await cloudProjects.saveCurrent({ asNew: true }).catch((e) => e);
    expect(err.status).toBe(409);
    expect(err.code).toBe('project_limit_reached');
    expect(cloudProjects.saving).toBe(false);
  });

  it('at the limit, replaces a saved project with the open model and links the tab to it', async () => {
    replies.set('GET /api/v1/projects', () => json(200, { data: [meta('p9', 'Viejo')], meta: { total: 1, limit: 50, offset: 0, max_projects: 1, max_bytes: 1 } }));
    replies.set('PUT /api/v1/projects/p9', (body) => json(200, { data: meta('p9', String(body?.name)) }));

    await cloudProjects.refresh();
    expect(cloudProjects.maxProjects).toBe(1);
    expect(cloudProjects.atLimit).toBe(true);

    const saved = await cloudProjects.replace('p9');
    const put = seen.find((r) => r.method === 'PUT')!;
    expect(put.path).toBe('/api/v1/projects/p9');
    expect(put.body).toMatchObject({ name: 'Pórtico de prueba', app_mode: 'basic', node_count: 2, element_count: 1 });
    const sent = JSON.parse(await gunzipBase64(String(put.body!.content)));
    expect({ ...sent, timestamp: null }).toEqual({ ...JSON.parse(serializeProject()), timestamp: null });
    expect(saved.name).toBe('Pórtico de prueba');
    expect(cloudProjects.linkedId).toBe('p9');
    expect(cloudProjects.items.map((p) => p.id)).toEqual(['p9']);
    expect(cloudProjects.total).toBe(1);
  });
  it('links the tab the save started from, even when another tab is open by the time it answers', async () => {
    if (!tabManager.activeTabId) tabManager.init();
    const origin = tabManager.activeTabId;
    replies.set('POST /api/v1/projects', () => {
      tabManager.createTab();
      return json(201, { data: meta('p7') });
    });

    await cloudProjects.saveCurrent({ asNew: true });
    expect(tabManager.activeTabId).not.toBe(origin);
    expect(cloudProjects.linkedId).toBeNull();
    tabManager.switchTab(origin!);
    expect(cloudProjects.linkedId).toBe('p7');
  });
  it('a new document in the tab drops its cloud link, so the next save creates instead of overwriting', async () => {
    replies.set('POST /api/v1/projects', () => json(201, { data: meta('p3') }));
    await cloudProjects.saveCurrent({ asNew: true });
    expect(cloudProjects.linkedId).toBe('p3');

    modelStore.clear();
    expect(cloudProjects.linkedId).toBeNull();
    replies.set('POST /api/v1/projects', () => json(201, { data: meta('p4') }));
    await cloudProjects.saveCurrent();
    expect(seen.at(-1)).toMatchObject({ method: 'POST', path: '/api/v1/projects' });
  });

  it('a search that matches nothing keeps the account at its limit', async () => {
    replies.set('GET /api/v1/projects', () => json(200, { data: [meta('p9')], meta: { total: 1, limit: 100, offset: 0, max_projects: 1, max_bytes: 1 } }));
    await cloudProjects.refresh();
    expect(cloudProjects.atLimit).toBe(true);
    replies.set('GET /api/v1/projects', () => json(200, { data: [], meta: { total: 0, limit: 100, offset: 0, max_projects: 1, max_bytes: 1 } }));
    await cloudProjects.refresh('zzz');
    expect(cloudProjects.items).toEqual([]);
    expect(cloudProjects.atLimit).toBe(true);
  });

  it("another account signing in sees none of the previous account's projects or links", async () => {
    const who = vi.spyOn(authStore, 'account', 'get').mockReturnValue({ id: 'a1' } as never);
    replies.set('GET /api/v1/projects', () => json(200, { data: [meta('p5')], meta: { total: 1, limit: 100, offset: 0, max_projects: 5, max_bytes: 1 } }));
    replies.set('POST /api/v1/projects', () => json(201, { data: meta('p5') }));
    await cloudProjects.refresh();
    await cloudProjects.saveCurrent({ asNew: true });
    expect(cloudProjects.linkedId).toBe('p5');

    who.mockReturnValue({ id: 'b2' } as never);
    expect(cloudProjects.items).toEqual([]);
    expect(cloudProjects.linkedId).toBeNull();
    replies.set('POST /api/v1/projects', () => json(201, { data: meta('p6') }));
    await cloudProjects.saveCurrent();
    expect(seen.at(-1)).toMatchObject({ method: 'POST', path: '/api/v1/projects' });
    who.mockRestore();
  });
  it('a save answered after the tab got another document does not link that document', async () => {
    replies.set('POST /api/v1/projects', () => {
      modelStore.clear();
      return json(201, { data: meta('p8') });
    });
    await cloudProjects.saveCurrent({ asNew: true });
    expect(cloudProjects.linkedId).toBeNull();
  });

  it("a list answered after another account signed in is dropped", async () => {
    const who = vi.spyOn(authStore, 'account', 'get').mockReturnValue({ id: 'c3' } as never);
    replies.set('GET /api/v1/projects', () => {
      who.mockReturnValue({ id: 'd4' } as never);
      return json(200, { data: [meta('p10')], meta: { total: 1, limit: 100, offset: 0, max_projects: 5, max_bytes: 1 } });
    });
    await cloudProjects.refresh();
    expect(cloudProjects.items).toEqual([]);
    who.mockRestore();
  });
  it('a content save names the revision it was based on, and a newer one elsewhere is reported', async () => {
    replies.set('POST /api/v1/projects', () => json(201, { data: meta('r1', 'Frame', 1) }));
    replies.set('PUT /api/v1/projects/r1', () => json(200, { data: meta('r1', 'Frame', 2) }));
    await cloudProjects.saveCurrent({ asNew: true });
    await cloudProjects.saveCurrent();
    expect(seen.at(-1)!.body).toMatchObject({ revision: 1 });

    replies.set('PUT /api/v1/projects/r1', () => json(409, { error: 'project_changed', message: 'changed' }));
    const err = await cloudProjects.saveCurrent().catch((e) => e);
    expect(seen.at(-1)!.body).toMatchObject({ revision: 2 });
    expect(err.code).toBe('project_changed');
    expect(cloudProjects.linkedId).toBe('r1');
  });

  it('a listing that shows a newer revision saved elsewhere does not let this document overwrite it', async () => {
    replies.set('POST /api/v1/projects', () => json(201, { data: meta('v1', 'Frame', 1) }));
    await cloudProjects.saveCurrent({ asNew: true });
    replies.set('GET /api/v1/projects', () => json(200, { data: [meta('v1', 'Frame', 5)], meta: { total: 1, limit: 100, offset: 0, max_projects: 5, max_bytes: 1 } }));
    await cloudProjects.refresh();
    replies.set('PUT /api/v1/projects/v1', () => json(409, { error: 'project_changed', message: 'changed' }));
    const err = await cloudProjects.saveCurrent().catch((e) => e);
    expect(seen.at(-1)!.body).toMatchObject({ revision: 1 });
    expect(err.code).toBe('project_changed');
  });

  it('a rename from this list keeps the open document current, but not one that is already behind', async () => {
    const doc = serializeProject();
    replies.set('GET /api/v1/projects/n1', async () => json(200, { data: { ...meta('n1', 'Frame', 3), content: await gzipBase64(doc) } }));
    await cloudProjects.open('n1');
    replies.set('GET /api/v1/projects', () => json(200, { data: [meta('n1', 'Frame', 3)], meta: { total: 1, limit: 100, offset: 0, max_projects: 5, max_bytes: 1 } }));
    await cloudProjects.refresh();
    replies.set('PUT /api/v1/projects/n1', () => json(200, { data: meta('n1', 'Beam', 4) }));
    await cloudProjects.rename('n1', 'Beam');
    replies.set('PUT /api/v1/projects/n1', () => json(200, { data: meta('n1', 'Beam', 5) }));
    await cloudProjects.saveCurrent();
    expect(seen.at(-1)!.body).toMatchObject({ revision: 4 });

    replies.set('GET /api/v1/projects', () => json(200, { data: [meta('n1', 'Beam', 7)], meta: { total: 1, limit: 100, offset: 0, max_projects: 5, max_bytes: 1 } }));
    await cloudProjects.refresh();
    replies.set('PUT /api/v1/projects/n1', () => json(200, { data: meta('n1', 'Girder', 8) }));
    await cloudProjects.rename('n1', 'Girder');
    replies.set('PUT /api/v1/projects/n1', () => json(409, { error: 'project_changed', message: 'changed' }));
    await cloudProjects.saveCurrent().catch(() => {});
    expect(seen.at(-1)!.body).toMatchObject({ revision: 5 });
  });

  it('a rename from the list is kept by the next save, unless the document was renamed here', async () => {
    if (!tabManager.activeTabId) tabManager.init();
    const first = tabManager.activeTabId!;
    const doc = serializeProject();
    replies.set('GET /api/v1/projects/m1', async () => json(200, { data: { ...meta('m1', 'Frame', 1), content: await gzipBase64(doc) } }));
    await cloudProjects.open('m1');
    tabManager.createTab();
    await cloudProjects.open('m1');
    replies.set('GET /api/v1/projects', () => json(200, { data: [meta('m1', 'Frame', 1)], meta: { total: 1, limit: 100, offset: 0, max_projects: 5, max_bytes: 1 } }));
    await cloudProjects.refresh();
    replies.set('PUT /api/v1/projects/m1', () => json(200, { data: meta('m1', 'Beam', 2) }));
    await cloudProjects.rename('m1', 'Beam');
    expect(modelStore.model.name).toBe('Beam');

    tabManager.switchTab(first);
    expect(modelStore.model.name).toBe('Frame');
    replies.set('PUT /api/v1/projects/m1', () => json(200, { data: meta('m1', 'Beam', 3) }));
    await cloudProjects.saveCurrent();
    expect(seen.at(-1)!.body).toMatchObject({ name: 'Beam', revision: 2 });

    modelStore.model.name = 'Local name';
    replies.set('PUT /api/v1/projects/m1', () => json(200, { data: meta('m1', 'Local name', 4) }));
    await cloudProjects.saveCurrent();
    expect(seen.at(-1)!.body).toMatchObject({ name: 'Local name', revision: 3 });
  });

  it('a list rename leaves a name given to the open document here, and an edit made while a project downloads keeps it from loading', async () => {
    const doc = serializeProject();
    replies.set('GET /api/v1/projects/k1', async () => json(200, { data: { ...meta('k1', 'Frame', 1), content: await gzipBase64(doc) } }));
    expect(await cloudProjects.open('k1')).toBe(true);
    expect(cloudProjects.openWouldReplaceWork).toBe(false);
    modelStore.model.name = 'Mine';
    replies.set('GET /api/v1/projects', () => json(200, { data: [meta('k1', 'Frame', 1)], meta: { total: 1, limit: 100, offset: 0, max_projects: 5, max_bytes: 1 } }));
    await cloudProjects.refresh();
    replies.set('PUT /api/v1/projects/k1', () => json(200, { data: meta('k1', 'Listed', 2) }));
    await cloudProjects.rename('k1', 'Listed');
    expect(modelStore.model.name).toBe('Mine');

    modelStore.addNode(9, 9);
    expect(cloudProjects.openWouldReplaceWork).toBe(true);
    const nodes = modelStore.nodes.size;
    replies.set('GET /api/v1/projects/k2', async () => {
      modelStore.addNode(10, 10);
      return json(200, { data: { ...meta('k2', 'Other', 1), content: await gzipBase64(doc) } });
    });
    expect(await cloudProjects.open('k2')).toBe(false);
    expect(modelStore.nodes.size).toBe(nodes + 1);
    expect(cloudProjects.linkedId).toBe('k1');
  });

  it('a second save started before the first answers waits, and names the revision the first one left', async () => {
    replies.set('POST /api/v1/projects', () => json(201, { data: meta('q1', 'Frame', 1) }));
    await cloudProjects.saveCurrent({ asNew: true });
    let revision = 1;
    replies.set('PUT /api/v1/projects/q1', async (body) => {
      await new Promise((done) => setTimeout(done, 20));
      if (body!.revision !== revision) return json(409, { error: 'project_changed', message: 'changed' });
      revision += 1;
      return json(200, { data: meta('q1', 'Frame', revision) });
    });
    const [first, second] = await Promise.all([cloudProjects.saveCurrent(), cloudProjects.saveCurrent()]);
    expect([first.revision, second.revision]).toEqual([2, 3]);
    expect(seen.slice(-2).map((s) => s.body!.revision)).toEqual([1, 2]);
  });

  it('two tabs holding the same project each keep the revision they last saw', async () => {
    if (!tabManager.activeTabId) tabManager.init();
    const first = tabManager.activeTabId!;
    const doc = serializeProject();
    replies.set('GET /api/v1/projects/t1', async () => json(200, { data: { ...meta('t1', 'Frame', 1), content: await gzipBase64(doc) } }));
    await cloudProjects.open('t1');
    tabManager.createTab();
    await cloudProjects.open('t1');
    replies.set('PUT /api/v1/projects/t1', () => json(200, { data: meta('t1', 'Frame', 2) }));
    await cloudProjects.saveCurrent();
    expect(seen.at(-1)!.body).toMatchObject({ revision: 1 });

    tabManager.switchTab(first);
    replies.set('PUT /api/v1/projects/t1', () => json(409, { error: 'project_changed', message: 'changed' }));
    const err = await cloudProjects.saveCurrent().catch((e) => e);
    expect(seen.at(-1)!.body).toMatchObject({ revision: 1 });
    expect(err.code).toBe('project_changed');
  });

  it('opening a project takes its cloud name and revision, unless the tab moved on while it loaded', async () => {
    const doc = serializeProject();
    replies.set('GET /api/v1/projects/o1', async () => json(200, { data: { ...meta('o1', 'Renamed in the cloud', 4), content: await gzipBase64(doc) } }));
    await cloudProjects.open('o1');
    expect(modelStore.model.name).toBe('Renamed in the cloud');
    expect(cloudProjects.linkedId).toBe('o1');
    replies.set('PUT /api/v1/projects/o1', () => json(200, { data: meta('o1', 'Renamed in the cloud', 5) }));
    await cloudProjects.saveCurrent();
    expect(seen.at(-1)!.body).toMatchObject({ revision: 4 });

    modelStore.clear();
    replies.set('GET /api/v1/projects/o2', async () => {
      modelStore.clear();
      return json(200, { data: { ...meta('o2', 'Late', 1), content: await gzipBase64(doc) } });
    });
    await cloudProjects.open('o2');
    expect(modelStore.model.name).not.toBe('Late');
    expect(cloudProjects.linkedId).toBeNull();
  });
});
