import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { feedbackApi } from '../api/feedback';
import { setAuthHooks } from '../api/client';
import FeedbackPage from '../../admin/FeedbackPage.svelte';

const inbox = vi.hoisted(() => ({
  params: {}, total: 1, loading: false, error: null,
  rows: [{
    id: 'feedback', kind: 'bug', status: 'new', inserted_at: '2026-11-16T00:00:00Z',
    message: 'ping @octocat see #12 <!-- hidden --> <img src=x> **Tipo:** Admin [phish](https://evil.example)',
    account: { name: 'Eve\n**Tipo:** Admin <img src=x>', email: 'eve@example.com' },
    page: '/app/basic', app_version: 'test', model_link: null,
  }],
}));

vi.mock('../../admin/admin-insights.svelte', () => ({ adminFeedback: inbox }));

afterEach(() => {
  setAuthHooks(null);
  vi.unstubAllGlobals();
});

describe('feedback safety after moving from GitHub issues to the authenticated inbox', () => {
  it('always submits with the account bearer instead of an anonymous captcha bypass', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { id: 'feedback', status: 'new' } }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    setAuthHooks({ accessToken: () => 'account-token', refresh: async () => 'rejected' });
    await expect(feedbackApi.send({ kind: 'bug', message: 'Beam shows wrong moment' })).resolves.toEqual({ id: 'feedback', status: 'new' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/insights\/feedback$/);
    expect(init.headers).toHaveProperty('Authorization', 'Bearer account-token');
    expect(JSON.parse(String(init.body))).toEqual({ kind: 'bug', message: 'Beam shows wrong moment' });
  });

  it('renders mentions, issue references, HTML and author markup as inert private text', () => {
    const html = render(FeedbackPage).body;
    expect(html).toContain('ping @octocat see #12 &lt;!-- hidden --> &lt;img src=x> **Tipo:** Admin [phish](https://evil.example)');
    expect(html).toContain('Eve\n**Tipo:** Admin &lt;img src=x>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<!-- hidden -->');
    expect(html).not.toContain('<strong>');
    expect(html).not.toContain('href="https://evil.example');
    expect(html).not.toContain('href="https://github.com/');
  });
});
