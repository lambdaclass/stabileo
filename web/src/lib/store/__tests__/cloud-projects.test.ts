import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cloudProjects, isProjectConflict } from '../cloud-projects.svelte';
import { modelStore, tabManager } from '..';
import { gzipBase64, gunzipBase64 } from '../../utils/gzip-base64';
import { serializeProject } from '../file';

type Seen = { method: string; path: string; body: Record<string, unknown> | undefined };

let seen: Seen[];
let replies: Map<string, (body: Record<string, unknown> | undefined) => Response | Promise<Response>>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function meta(id: string, name = 'Frame', revision = 1) {
  return { id, name, app_mode: 'basic' as const, content_bytes: 10, node_count: 2, element_count: 1, app_version: 'dev', revision, inserted_at: '2026-10-27T12:00:00Z', updated_at: '2026-10-27T12:00:00Z' };
}

function listMeta(total: number, used = total, max = 100) {
  return { total, used, limit: 100, offset: 0, max_projects: max, max_bytes: 1 };
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
    replies.set('POST /api/v1/projects', () => json(201, { data: meta('p1', 'Pórtico de prueba', 1) }));
    replies.set('PUT /api/v1/projects/p1', (body) => json(200, { data: meta('p1', 'Pórtico de prueba', Number(body!.revision) + 1) }));

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
    expect(seen[1].body!.revision).toBe(1);

    await cloudProjects.saveCurrent();
    expect(seen[2].body!.revision).toBe(2);

    replies.set('POST /api/v1/projects', () => json(201, { data: meta('p2') }));
    await cloudProjects.saveCurrent({ asNew: true });
    expect(seen[3].method).toBe('POST');
    expect(cloudProjects.linkedId).toBe('p2');
  });

  it('opens a cloud project into the store', async () => {
    const saved = serializeProject();
    modelStore.clear();
    modelStore.model.name = 'Otro';
    const content = await gzipBase64(saved);
    replies.set('GET /api/v1/projects/p9', () => json(200, { data: { ...meta('p9', 'Pórtico de prueba', 7), content } }));
    replies.set('PUT /api/v1/projects/p9', (body) => json(200, { data: meta('p9', 'Pórtico de prueba', Number(body!.revision) + 1) }));

    await cloudProjects.open('p9');
    expect(modelStore.model.name).toBe('Pórtico de prueba');
    expect(modelStore.nodes.size).toBe(2);
    expect(cloudProjects.linkedId).toBe('p9');

    await cloudProjects.saveCurrent();
    expect(seen.at(-1)!.body!.revision).toBe(7);
  });

  it('lists, renames and deletes, keeping the list in step', async () => {
    replies.set('GET /api/v1/projects', () => json(200, { data: [meta('a', 'A', 3), meta('b', 'B')], meta: listMeta(2) }));
    replies.set('PUT /api/v1/projects/a', (body) => json(200, { data: meta('a', String(body!.name), 4) }));
    replies.set('DELETE /api/v1/projects/b', () => json(200, { data: meta('b', 'B') }));

    await cloudProjects.refresh();
    expect(cloudProjects.items.map((p) => p.name)).toEqual(['A', 'B']);
    expect(cloudProjects.total).toBe(2);

    await cloudProjects.rename(cloudProjects.items[0], 'Renamed');
    expect(seen.at(-1)!.body).toEqual({ name: 'Renamed', revision: 3 });
    expect(cloudProjects.items[0]).toMatchObject({ name: 'Renamed', revision: 4 });

    await cloudProjects.remove('b');
    expect(cloudProjects.items.map((p) => p.id)).toEqual(['a']);
    expect(cloudProjects.total).toBe(1);
    expect(cloudProjects.used).toBe(1);
  });

  it('passes the server refusal through, with its code', async () => {
    replies.set('POST /api/v1/projects', () => json(409, { error: 'project_limit_reached', message: 'limit' }));
    const err = await cloudProjects.saveCurrent({ asNew: true }).catch((e) => e);
    expect(err.status).toBe(409);
    expect(err.code).toBe('project_limit_reached');
    expect(cloudProjects.saving).toBe(false);
  });

  it('at the limit, replaces a saved project with the open model and links the tab to it', async () => {
    replies.set('GET /api/v1/projects', () => json(200, { data: [meta('p9', 'Viejo', 5)], meta: listMeta(1, 1, 1) }));
    replies.set('PUT /api/v1/projects/p9', (body) => json(200, { data: meta('p9', String(body?.name), 6) }));

    await cloudProjects.refresh();
    expect(cloudProjects.maxProjects).toBe(1);
    expect(cloudProjects.atLimit).toBe(true);

    const saved = await cloudProjects.replace(cloudProjects.items[0]);
    const put = seen.find((r) => r.method === 'PUT')!;
    expect(put.path).toBe('/api/v1/projects/p9');
    expect(put.body).toMatchObject({ name: 'Pórtico de prueba', app_mode: 'basic', node_count: 2, element_count: 1, revision: 5 });
    const sent = JSON.parse(await gunzipBase64(String(put.body!.content)));
    expect({ ...sent, timestamp: null }).toEqual({ ...JSON.parse(serializeProject()), timestamp: null });
    expect(saved.name).toBe('Pórtico de prueba');
    expect(cloudProjects.linkedId).toBe('p9');
    expect(cloudProjects.items.map((p) => p.id)).toEqual(['p9']);
    expect(cloudProjects.total).toBe(1);
  });

  it('a new project in the same tab is saved as another project, never over the one the tab held', async () => {
    replies.set('POST /api/v1/projects', () => json(201, { data: meta('p1') }));
    await cloudProjects.saveCurrent();
    expect(cloudProjects.linkedId).toBe('p1');

    modelStore.clear();
    modelStore.addNode(0, 0);
    expect(cloudProjects.linkedId).toBeNull();

    replies.set('POST /api/v1/projects', () => json(201, { data: meta('p2') }));
    await cloudProjects.saveCurrent();
    expect(seen.map((r) => `${r.method} ${r.path}`)).toEqual(['POST /api/v1/projects', 'POST /api/v1/projects']);
    expect(cloudProjects.linkedId).toBe('p2');
  });

  it('a project opened from a file in the tab drops the link too', async () => {
    replies.set('POST /api/v1/projects', () => json(201, { data: meta('p1') }));
    await cloudProjects.saveCurrent();
    const { loadProject } = await import('../file');
    await loadProject(new File([serializeProject()], 'otro.ded', { type: 'application/json' }));
    expect(cloudProjects.linkedId).toBeNull();
  });

  it('switching tabs while a save is on its way sends the first tab\'s project to its own link and keeps both links', async () => {
    tabManager.createTab();
    const first = tabManager.activeTabId!;
    const a = modelStore.addNode(0, 0);
    modelStore.addElement(a, modelStore.addNode(4, 0));
    modelStore.model.name = 'Pórtico de prueba';
    replies.set('POST /api/v1/projects', () => json(201, { data: meta('pA') }));
    await cloudProjects.saveCurrent();

    tabManager.createTab();
    const second = tabManager.activeTabId!;
    modelStore.addNode(0, 0);
    modelStore.addNode(9, 0);
    modelStore.addNode(9, 3);
    modelStore.model.name = 'Segundo';
    replies.set('POST /api/v1/projects', () => json(201, { data: meta('pB', 'Segundo') }));
    await cloudProjects.saveCurrent();
    expect(cloudProjects.linkedId).toBe('pB');

    tabManager.switchTab(first);
    let answer!: (r: Response) => void;
    replies.set('PUT /api/v1/projects/pA', () => new Promise<Response>((resolve) => { answer = resolve; }));
    replies.set('PUT /api/v1/projects/pB', () => json(500, { error: 'wrong project' }));
    const saving = cloudProjects.saveCurrent();
    tabManager.switchTab(second);
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
    tabManager.switchTab(first);
    tabManager.switchTab(second);
    answer(json(200, { data: meta('pA', 'Pórtico de prueba', 2) }));
    await saving;

    const put = seen.find((r) => r.method === 'PUT')!;
    expect(put.path).toBe('/api/v1/projects/pA');
    expect(put.body).toMatchObject({ name: 'Pórtico de prueba', node_count: 2, element_count: 1 });
    expect(cloudProjects.linkedId).toBe('pB');
    tabManager.switchTab(first);
    expect(cloudProjects.linkedId).toBe('pA');
  });

  it('a new project made while the save was on its way does not take the saved project\'s link', async () => {
    let answer!: (r: Response) => void;
    replies.set('POST /api/v1/projects', () => new Promise<Response>((resolve) => { answer = resolve; }));
    const saving = cloudProjects.saveCurrent();
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
    modelStore.clear();
    answer(json(201, { data: meta('p1') }));
    await saving;
    expect(cloudProjects.linkedId).toBeNull();
  });
  it('a save the server refuses as a conflict changes neither the link nor the list', async () => {
    replies.set('POST /api/v1/projects', () => json(201, { data: meta('p1', 'Pórtico de prueba', 1) }));
    await cloudProjects.saveCurrent();
    const listed = cloudProjects.items;
    replies.set('PUT /api/v1/projects/p1', () => json(409, { error: 'project_conflict', message: 'stale' }));

    const err = await cloudProjects.saveCurrent().catch((e) => e);

    expect(isProjectConflict(err)).toBe(true);
    expect(seen.at(-1)!.body!.revision).toBe(1);
    expect(cloudProjects.linkedId).toBe('p1');
    expect(cloudProjects.items).toBe(listed);
    expect(cloudProjects.saving).toBe(false);
    expect(isProjectConflict(new Error('x'))).toBe(false);
  });

  it('renaming the project a tab holds moves that tab to the new revision, so its next save is no conflict', async () => {
    replies.set('POST /api/v1/projects', () => json(201, { data: meta('p1', 'Pórtico de prueba', 1) }));
    await cloudProjects.saveCurrent();
    replies.set('PUT /api/v1/projects/p1', (body) => json(200, { data: meta('p1', String(body!.name ?? 'Pórtico de prueba'), Number(body!.revision) + 1) }));

    await cloudProjects.rename(cloudProjects.items[0], 'Nuevo nombre');
    await cloudProjects.saveCurrent();

    expect(seen.filter((r) => r.method === 'PUT').map((r) => r.body!.revision)).toEqual([1, 2]);
  });

  it('only the latest search writes the list, and the limit counts every project whatever the search', async () => {
    const answers: ((r: Response) => void)[] = [];
    replies.set('GET /api/v1/projects', () => new Promise<Response>((resolve) => answers.push(resolve)));

    const older = cloudProjects.refresh('a');
    const newer = cloudProjects.refresh('ab');
    await vi.waitFor(() => expect(answers).toHaveLength(2));
    answers[1](json(200, { data: [meta('x', 'Abc')], meta: listMeta(1, 3, 3) }));
    await newer;
    answers[0](json(200, { data: [meta('y', 'Ax'), meta('x', 'Abc')], meta: listMeta(2, 3, 3) }));
    await older;

    expect(cloudProjects.items.map((p) => p.id)).toEqual(['x']);
    expect(cloudProjects.total).toBe(1);
    expect(cloudProjects.used).toBe(3);
    expect(cloudProjects.atLimit).toBe(true);
    expect(cloudProjects.loading).toBe(false);
  });
});

