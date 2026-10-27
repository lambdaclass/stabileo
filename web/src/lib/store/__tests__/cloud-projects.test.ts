import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cloudProjects } from '../cloud-projects.svelte';
import { modelStore } from '..';
import { gzipBase64, gunzipBase64 } from '../../utils/gzip-base64';
import { serializeProject } from '../file';

type Seen = { method: string; path: string; body: Record<string, unknown> | undefined };

let seen: Seen[];
let replies: Map<string, (body: Record<string, unknown> | undefined) => Response | Promise<Response>>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function meta(id: string, name = 'Frame') {
  return { id, name, app_mode: 'basic', content_bytes: 10, node_count: 2, element_count: 1, app_version: 'dev', inserted_at: '2026-10-27T12:00:00Z', updated_at: '2026-10-27T12:00:00Z' };
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
});
