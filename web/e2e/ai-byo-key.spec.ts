import { inflateRawSync } from 'node:zlib';
import type { Page, Route } from '@playwright/test';
import { test, expect, loadModel } from './fixtures';

const ANTHROPIC_KEY = 'sk-ant-e2e-0000-secret';
const OPENAI_KEY = 'sk-e2e-openai-1111-secret';

function corsHeaders(route: Route): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': route.request().headers()['access-control-request-headers'] ?? '*',
    'access-control-expose-headers': '*',
  };
}

function anthropicSse(toolName: string, input: unknown): string {
  const events = [
    { type: 'message_start', message: { id: 'msg_e2e', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, stop_details: null, usage: { input_tokens: 100, output_tokens: 1 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_e2e', name: toolName, input: {} } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null, stop_details: null }, usage: { output_tokens: 50 } },
    { type: 'message_stop' },
  ];
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}

interface Seen { url: string; headers: Record<string, string>; body: Record<string, unknown> }

async function mockAnthropic(page: Page, toolName: string, input: unknown): Promise<Seen[]> {
  const seen: Seen[] = [];
  await page.route('https://api.anthropic.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders(route) });
    seen.push({ url: route.request().url(), headers: route.request().headers(), body: route.request().postDataJSON() });
    await route.fulfill({ status: 200, headers: { ...corsHeaders(route), 'content-type': 'text/event-stream' }, body: anthropicSse(toolName, input) });
  });
  return seen;
}

async function mockOpenAi(page: Page, toolName: string, input: unknown): Promise<Seen[]> {
  const seen: Seen[] = [];
  await page.route('https://api.openai.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders(route) });
    seen.push({ url: route.request().url(), headers: route.request().headers(), body: route.request().postDataJSON() });
    await route.fulfill({
      status: 200,
      headers: { ...corsHeaders(route), 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'chatcmpl_e2e', object: 'chat.completion', created: 0, model: 'gpt-6-astra',
        choices: [{ index: 0, finish_reason: 'tool_calls', message: { role: 'assistant', content: null, refusal: null, tool_calls: [{ id: 'call_e2e', type: 'function', function: { name: toolName, arguments: JSON.stringify(input) } }] } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    });
  });
  return seen;
}

async function openApp(page: Page): Promise<string[]> {
  const stabileoCalls: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api/ai')) stabileoCalls.push(r.url());
  });
  await page.addInitScript(() => { try { localStorage.setItem('liveCalc', 'false'); } catch { return; } });
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileoActions, null, { timeout: 30_000 });
  await page.getByTestId('ai-open').click();
  return stabileoCalls;
}

type Traffic = { requests: { host: string; text: string }[]; console: string[] };

function watchTraffic(page: Page): Traffic {
  const traffic: Traffic = { requests: [], console: [] };
  page.on('request', (r) => {
    traffic.requests.push({ host: new URL(r.url()).host, text: r.url() + JSON.stringify(r.headers()) + (r.postData() ?? '') });
  });
  page.on('console', (m) => traffic.console.push(m.text()));
  return traffic;
}

function expectKeyOnlyTo(traffic: Traffic, key: string, host: string): void {
  const carrying = traffic.requests.filter((r) => r.text.includes(key)).map((r) => r.host);
  expect(carrying.length).toBeGreaterThan(0);
  expect(new Set(carrying)).toEqual(new Set([host]));
  expect(traffic.console.filter((line) => line.includes(key))).toEqual([]);
}

function sharedPayload(link: string): string {
  const m = /#code=([A-Za-z0-9_-]+)/.exec(link);
  expect(m, `a share link carrying the model code: ${link}`).not.toBeNull();
  return inflateRawSync(Buffer.from(m![1], 'base64url')).toString('utf8');
}

async function sendAndApply(page: Page, prompt: string): Promise<void> {
  await page.locator('.chat-input').fill(prompt);
  await page.getByTestId('ai-send').click();
  const apply = page.getByTestId('ai-apply');
  await expect(apply).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => window.__stabileo.viewportPick().hasResults)).toBe(false);
  await apply.click();
  await expect(apply).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__stabileo.viewportPick().hasResults)).toBe(true);
}

async function nodeXs(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    window.__stabileo.nodeIds().map((id) => window.__stabileo.nodePosition(id)!.x).sort((a, b) => a - b),
  );
}

test.describe('@smoke AI with your own key', () => {
  test('Anthropic: paste a key, ask for a beam, Apply puts the validated beam on the canvas and solves it, and neither the .ded nor the share link carries the key', async ({ page, context }) => {
    const seen = await mockAnthropic(page, 'create_beam', { span: 6, q: -10, interpretation: 'A 6 m simply supported beam.' });
    const traffic = watchTraffic(page);
    const stabileoCalls = await openApp(page);

    await expect(page.getByTestId('ai-key-settings')).toBeVisible();
    await expect(page.getByTestId('ai-send')).toHaveCount(0);
    await expect(page.getByTestId('ai-key-note')).toContainText('api.anthropic.com');
    const input = page.getByTestId('ai-key-input');
    await expect(input).toHaveAttribute('type', 'password');
    await input.fill(`  ${ANTHROPIC_KEY}  `);
    await page.getByTestId('ai-key-save').click();
    await expect(page.getByTestId('ai-key-bar')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('stabileo.ai.key.anthropic'))).toBe(ANTHROPIC_KEY);

    await sendAndApply(page, 'simply supported 6 m beam with 10 kN/m');

    expect(await nodeXs(page)).toEqual([0, 6]);
    expect(await page.evaluate(() => window.__stabileo.elementIds().length)).toBe(1);
    expect(await page.evaluate(() => window.__stabileo.supportCount())).toBe(2);
    expect(await page.evaluate(() => window.__stabileo.verticalReaction2D())).toBeCloseTo(60, 6);

    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(seen[0].headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(seen[0].body.model).toBe('claude-opus-5-5');
    expect(seen[0].body.thinking).toEqual({ type: 'adaptive' });
    expect(seen[0].body).not.toHaveProperty('temperature');
    expect(stabileoCalls).toEqual([]);
    expectKeyOnlyTo(traffic, ANTHROPIC_KEY, 'api.anthropic.com');

    const ded = await page.evaluate(() => window.__stabileo.serializeProject());
    expect(JSON.parse(ded).snapshot.nodes).toHaveLength(2);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByTestId('hdr-project').click();
    await page.getByTestId('project-share-link').click();
    const shareLink = await page.evaluate(() => navigator.clipboard.readText());
    const shared = sharedPayload(shareLink);
    const lines = shared.split('\n');
    expect(lines.filter((l) => l.startsWith('node ')).map((l) => l.split(' ').slice(1, 4).map(Number))).toEqual([[1, 0, 0], [2, 6, 0]]);
    expect(lines.filter((l) => l.startsWith('member '))).toHaveLength(1);
    expect(lines.filter((l) => l.startsWith('support '))).toHaveLength(2);
    expect(lines.filter((l) => l.startsWith('load distributed '))).toHaveLength(1);
    for (const payload of [ded, shareLink, shared, page.url()]) {
      expect(payload).not.toContain(ANTHROPIC_KEY);
      expect(payload).not.toContain('sk-ant-');
    }
    await page.keyboard.press('Escape');
    if (!(await page.getByTestId('ai-key-manage').isVisible())) await page.getByTestId('ai-open').click();

    await page.getByTestId('ai-key-manage').click();
    await page.getByTestId('ai-key-forget').click();
    expect(await page.evaluate(() => localStorage.getItem('stabileo.ai.key.anthropic'))).toBeNull();
    await expect(page.getByTestId('ai-key-input')).toBeVisible();
  });

  test('OpenAI: the chosen provider gets the request and the continuous beam lands after Apply', async ({ page }) => {
    const seen = await mockOpenAi(page, 'create_continuous_beam', { spans: [4, 5], q: -12, interpretation: 'Two-span beam.' });
    await page.addInitScript((key) => {
      try {
        localStorage.setItem('stabileo.ai.provider', 'openai');
        localStorage.setItem('stabileo.ai.key.openai', key);
      } catch { return; }
    }, OPENAI_KEY);
    const traffic = watchTraffic(page);
    const stabileoCalls = await openApp(page);

    await expect(page.getByTestId('ai-key-bar')).toContainText('OpenAI');
    await sendAndApply(page, 'two-span continuous beam, 4 m and 5 m');

    expect(await nodeXs(page)).toEqual([0, 4, 9]);
    expect(await page.evaluate(() => window.__stabileo.elementIds().length)).toBe(2);
    expect(await page.evaluate(() => window.__stabileo.verticalReaction2D())).toBeCloseTo(12 * 9, 6);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('https://api.openai.com/v1/chat/completions');
    expect(seen[0].headers.authorization).toBe(`Bearer ${OPENAI_KEY}`);
    expect(seen[0].body.model).toBe('gpt-6-astra');
    expect(stabileoCalls).toEqual([]);
    expectKeyOnlyTo(traffic, OPENAI_KEY, 'api.openai.com');
  });

  test('without a key every AI action is unavailable and each tab shows the key settings', async ({ page }) => {
    const traffic = watchTraffic(page);
    await openApp(page);
    await expect(page.locator('.ai-drawer .tab')).toHaveCount(4);
    for (const tab of await page.locator('.ai-drawer .tab').all()) {
      await tab.click();
      await expect(page.getByTestId('ai-key-settings')).toBeVisible();
      for (const action of ['[data-testid="ai-send"]', '[data-testid="ai-apply"]', '.chat-input', '.action-btn', '.draft-retry', '.fix-issues-btn']) {
        await expect(page.locator(`.ai-drawer ${action}`), action).toHaveCount(0);
      }
    }
    expect(traffic.requests.filter((r) => r.host === 'api.anthropic.com' || r.host === 'api.openai.com')).toEqual([]);
  });

  test('Cancel on an edit of a loaded model puts back exactly the model there was', async ({ page }) => {
    const seen = await mockAnthropic(page, 'add_bay', { width: 5, interpretation: 'One more bay.' });
    await page.addInitScript((key) => { try { localStorage.setItem('stabileo.ai.key.anthropic', key); } catch { return; } }, ANTHROPIC_KEY);
    await openApp(page);
    await loadModel(page, 'two-story-frame');
    const model = () => page.evaluate(() => JSON.parse(window.__stabileo.serializeProject()).snapshot);
    const before = await model();
    const nodesBefore = await page.evaluate(() => window.__stabileo.nodeCount());
    const solvedBefore = await page.evaluate(() => window.__stabileo.viewportPick().hasResults);
    expect(nodesBefore).toBeGreaterThan(0);

    await page.locator('.chat-input').fill('add a 5 m bay');
    await page.getByTestId('ai-send').click();
    await expect(page.getByTestId('ai-apply')).toBeVisible({ timeout: 20_000 });
    expect(seen).toHaveLength(1);
    expect(await page.evaluate(() => window.__stabileo.viewportPick().hasResults)).toBe(false);
    await expect(page.getByTestId('ai-key-manage'), 'the key cannot be changed while a draft waits').toBeDisabled();
    await expect(page.getByTestId('ai-apply')).toBeEnabled();

    await page.locator('.ai-drawer .draft-cancel').click();
    await expect(page.getByTestId('ai-apply')).toHaveCount(0);
    expect(await model()).toEqual(before);
    expect(await page.evaluate(() => window.__stabileo.nodeCount())).toBe(nodesBefore);
    expect(await page.evaluate(() => window.__stabileo.viewportPick().hasResults)).toBe(solvedBefore);
  });

  test('an invalid proposal is never applied', async ({ page }) => {
    const seen = await mockAnthropic(page, 'create_model', {
      analysis_mode: '2d',
      nodes: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 5, y: 0 }],
      elements: [{ id: 1, type: 'frame', nodeI: 1, nodeJ: 99, materialId: 1, sectionId: 1 }],
      materials: [{ id: 1, name: 'Steel', e: 200000, nu: 0.3, rho: 78.5, fy: 250 }],
      sections: [{ id: 1, name: 'IPE 300', a: 0.00538, iz: 0.0000836 }],
      supports: [{ id: 1, nodeId: 1, type: 'fixed' }],
      interpretation: 'Broken.',
    });
    await page.addInitScript((key) => { try { localStorage.setItem('stabileo.ai.key.anthropic', key); } catch { return; } }, ANTHROPIC_KEY);
    await openApp(page);
    await page.locator('.chat-input').fill('a cantilever');
    await page.getByTestId('ai-send').click();
    await expect(page.locator('.chat-msg.chat-ai').last()).toContainText(/(Validation failed:|La validación falló:) element 1 references non-existent nodeJ=99/, { timeout: 20_000 });
    expect(seen).toHaveLength(1);
    await expect(page.getByTestId('ai-apply')).toHaveCount(0);
    expect(await page.evaluate(() => window.__stabileo.nodeCount())).toBe(0);
  });
});

for (const size of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
]) {
  test.describe(`@smoke AI key settings on a ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, hasTouch: true, isMobile: true });

    test('fits the width, has 44 px targets and leaves the model in view', async ({ page }) => {
      await openApp(page);
      const settings = page.getByTestId('ai-key-settings');
      await expect(settings).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const box = await settings.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
      for (const id of ['ai-provider-anthropic', 'ai-provider-openai', 'ai-key-input', 'ai-key-save']) {
        const b = await page.getByTestId(id).boundingBox();
        expect(b!.height, id).toBeGreaterThanOrEqual(44);
      }
      const canvas = await page.locator('canvas').first().boundingBox();
      expect(canvas, 'the viewer is on screen').not.toBeNull();
      expect(canvas!.y).toBeLessThan(size.height / 2);
    });
  });
}
