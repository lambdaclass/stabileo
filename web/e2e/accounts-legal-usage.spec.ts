import { test, expect } from './fixtures';
import type { Page, Route } from '@playwright/test';
import { gunzipSync } from 'node:zlib';
import { RESULTS_CHANGED_IN, WHATS_NEW_STORAGE_KEY } from '../src/lib/release/whats-new';

const TERMS_VERSION = '2026-10-27';

const ACCOUNT = {
  id: '6f1c2c0e-0000-4000-8000-000000000001',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  company: null,
  job_title: null,
  country: null,
  locale: 'es',
  email_verified_at: null,
  inserted_at: '2026-10-27T12:00:00Z',
};

const consents = (termsCurrent: boolean, usage: boolean | null = null, research = false) => ({
  terms: termsCurrent ? { version: TERMS_VERSION, accepted_at: '2026-10-27T12:00:00Z' } : { version: '2020-01-01', accepted_at: '2020-01-01T12:00:00Z' },
  terms_current: termsCurrent,
  usage_analytics: usage,
  model_research: research,
});

const session = (termsCurrent = true, usage: boolean | null = null) => ({
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_in: 900,
  account: { ...ACCOUNT, consents: consents(termsCurrent, usage) },
});

interface Backend {
  register: Record<string, unknown>[];
  consents: Record<string, unknown>[];
  events: Record<string, unknown>[];
  projects: Record<string, unknown>[];
  updates: Record<string, unknown>[];
  feedback: Record<string, unknown>[];
}

const savedProject = (id: string, name: string, revision = 1) => ({
  id, name, revision, app_mode: 'basic', content_bytes: 100, node_count: 2, element_count: 1, app_version: 'test',
  inserted_at: '2026-10-27T12:00:00Z', updated_at: '2026-10-27T12:00:00Z',
});

/** The account notices hide from automated browsers, so these tests present as a person's browser. */
async function boot(
  page: Page,
  opts: { termsCurrent?: boolean; usageAnalytics?: boolean | null; signedIn?: boolean; saveRequiresAccount?: boolean; saved?: ReturnType<typeof savedProject>[]; maxProjects?: number; researchFails?: (granted: boolean) => boolean; refreshDelayMs?: number; refreshUnavailable?: boolean } = {},
): Promise<Backend> {
  const backend: Backend = { register: [], consents: [], events: [], projects: [], updates: [], feedback: [] };
  await page.addInitScript(([signedIn, whatsNewKey, whatsNewSeen]) => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    try {
      if (sessionStorage.getItem('booted')) return;
      sessionStorage.setItem('booted', '1');
      localStorage.clear();
      localStorage.setItem('stabileo-lang', 'es');
      localStorage.setItem('stabileo-lang-manual', '1');
      localStorage.setItem('stabileo-feature-accounts', '1');
      localStorage.setItem(whatsNewKey, whatsNewSeen);
      if (signedIn) localStorage.setItem('stabileo-refresh-token', 'refresh-0');
    } catch {
      /* storage blocked */
    }
  }, [opts.signedIn === true, WHATS_NEW_STORAGE_KEY, RESULTS_CHANGED_IN] as const);

  const body = (route: Route) => (route.request().postData() ? JSON.parse(route.request().postData()!) : undefined);
  const json = (route: Route, status: number, data: unknown) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

  await page.route('**/api/v1/auth/config', (r) =>
    json(r, 200, { user_login_enabled: true, terms_version: TERMS_VERSION, usage_telemetry_enabled: true, cloud_projects_enabled: true, save_requires_account: opts.saveRequiresAccount === true }),
  );
  await page.route('**/api/v1/auth/refresh', async (r) => {
    if (opts.refreshDelayMs) await new Promise((done) => setTimeout(done, opts.refreshDelayMs));
    if (opts.refreshUnavailable) return json(r, 503, { error: 'unavailable', message: 'down' });
    return json(r, 200, session(opts.termsCurrent ?? true, opts.usageAnalytics ?? null));
  });
  await page.route('**/api/v1/auth/register', (r) => {
    const b = body(r);
    backend.register.push(b);
    return b.accept_terms === true
      ? json(r, 201, session())
      : json(r, 422, { error: 'validation_error', message: 'Validation failed', details: { accept_terms: ['must be accepted'] } });
  });
  let usage: boolean | null = opts.usageAnalytics ?? null;
  let research = false;
  await page.route('**/api/v1/auth/consents', async (r) => {
    const b = body(r);
    backend.consents.push(b);
    if (b.kind === 'model_research' && opts.researchFails?.(b.granted)) return json(r, 500, { error: 'internal', message: 'down' });
    if (b.kind !== 'terms') await new Promise((done) => setTimeout(done, 400));
    if (b.kind === 'usage_analytics') usage = b.granted;
    if (b.kind === 'model_research') research = b.granted;
    return json(r, 201, { data: { ...ACCOUNT, consents: consents(true, usage, research) } });
  });
  await page.route('**/api/v1/insights/events', (r) => {
    backend.events.push(body(r));
    return json(r, 202, { accepted: 1, rejected: 0, enabled: true });
  });
  const revisions = new Map((opts.saved ?? []).map((p) => [p.id, p.revision]));
  await page.route('**/api/v1/projects**', (r) => {
    if (r.request().method() === 'POST') {
      const b = body(r);
      backend.projects.push(b);
      revisions.set('p1', 1);
      return json(r, 201, { data: { ...savedProject('p1', String(b.name)), app_mode: b.app_mode, node_count: b.node_count, element_count: b.element_count } });
    }
    if (r.request().method() === 'PUT') {
      const b = body(r);
      const id = r.request().url().split('/').pop()!;
      const current = revisions.get(id) ?? 1;
      backend.updates.push({ url: r.request().url(), ...b });
      if ('content' in b && typeof b.revision !== 'number') return json(r, 422, { error: 'validation', details: { revision: ['is required to replace the content'] } });
      if ('content' in b && b.revision !== current) return json(r, 409, { error: 'project_changed', message: 'changed' });
      revisions.set(id, current + 1);
      return json(r, 200, { data: { ...savedProject(id, String(b.name), current + 1), element_count: b.element_count } });
    }
    const saved = opts.saved ?? [];
    return json(r, 200, { data: saved, meta: { total: saved.length, limit: 100, offset: 0, max_projects: opts.maxProjects ?? 100, max_bytes: 1 } });
  });
  await page.route('**/api/v1/insights/feedback', (r) => {
    backend.feedback.push(body(r));
    return json(r, 201, { data: { id: 'f1' } });
  });

  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo && window.__stabileo.solverReady(), null, { timeout: 60_000 });
  return backend;
}

async function solvePortal(page: Page) {
  await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
  await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBeGreaterThan(0);
  await page.getByTestId('rb-cmd-solve').click();
}

test.describe('accounts, legal and anonymous usage', () => {
  test('sign-up waits for the terms and sends their acceptance with the optional usage choice', async ({ page }) => {
    const backend = await boot(page);
    await page.getByTestId('account-button').click();
    await page.getByTestId('auth-mode-register').click();
    await page.getByTestId('auth-name').fill('Ada Lovelace');
    await page.getByTestId('auth-email').fill('ada@example.com');
    await page.getByTestId('auth-password').fill('long-enough-1');
    await expect(page.getByTestId('auth-submit')).toBeDisabled();

    await expect(page.getByTestId('auth-usage-note')).toBeVisible();
    await page.getByTestId('auth-accept-terms').check();
    await page.getByTestId('auth-submit').click();

    await expect(page.getByTestId('auth-dialog')).toHaveCount(0);
    expect(backend.register).toEqual([
      expect.objectContaining({ email: 'ada@example.com', name: 'Ada Lovelace', accept_terms: true, terms_version: TERMS_VERSION, usage_analytics: true }),
    ]);
    await expect(page.getByTestId('account-button')).toContainText('Ada Lovelace');
  });

  test('usage is shared by default under a visit id, the notice gives way to the disclaimer, and "Got it" adds a stable id', async ({ page }) => {
    const backend = await boot(page);
    const flush = () =>
      page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      });

    await expect(page.getByTestId('usage-notice')).toBeVisible();
    await solvePortal(page);
    await expect(page.getByTestId('results-disclaimer')).toBeVisible();
    await expect(page.getByTestId('usage-notice')).toHaveCount(0);
    await page.getByTestId('results-disclaimer-ok').click();
    await expect(page.getByTestId('usage-notice')).toBeVisible();

    await page.getByTestId('rb-cmd-momentY').click();
    await flush();
    await expect.poll(() => backend.events.length).toBeGreaterThan(0);
    const before = backend.events[0];
    expect(String(before.install_id)).toMatch(/^v-/);
    expect(await page.evaluate(() => localStorage.getItem('stabileo-install-id'))).toBeNull();
    const events = backend.events.flatMap((b) => b.events as { name: string; props: Record<string, unknown> }[]);
    expect(events.map((e) => e.name)).toEqual(expect.arrayContaining(['mode.open', 'diagram.show', 'solve']));
    expect(events.find((e) => e.name === 'solve')!.props).toMatchObject({ outcome: 'ok', dim3: false, elements: '1-10' });
    expect(JSON.stringify(backend.events)).not.toMatch(/Portal Frame|"nodes"|"x"|coordinates/);
    expect(events.find((e) => e.name === 'example.open')?.props).toEqual({ example: 'portal-frame' });

    await page.getByTestId('usage-notice-ok').click();
    await expect(page.getByTestId('usage-notice')).toHaveCount(0);
    await page.getByTestId('rb-cmd-shearZ').click();
    await flush();
    await expect.poll(() => backend.events.length).toBeGreaterThan(1);
    const after = backend.events.at(-1)!;
    expect(String(after.install_id)).not.toMatch(/^v-/);
    expect(after.install_id).toBe(await page.evaluate(() => localStorage.getItem('stabileo-install-id')));

    await page.reload();
    await page.waitForFunction(() => !!window.__stabileo && window.__stabileo.solverReady(), null, { timeout: 60_000 });
    await solvePortal(page);
    await expect(page.getByTestId('results-disclaimer')).toHaveCount(0);
    await expect(page.getByTestId('usage-notice')).toHaveCount(0);
  });

  test('the notice has no way to turn sharing off, and the profile does', async ({ page }) => {
    const backend = await boot(page, { signedIn: true });
    await expect(page.getByTestId('usage-notice')).toBeVisible();
    await expect(page.getByTestId('usage-notice').getByRole('button')).toHaveCount(1);
    await page.getByTestId('usage-notice-ok').click();
    await expect(page.getByTestId('usage-notice')).toHaveCount(0);

    await page.getByTestId('account-button').click();
    await page.getByTestId('profile-usage').uncheck();
    await expect.poll(() => backend.consents).toEqual([
      { kind: 'usage_analytics', granted: true },
      { kind: 'usage_analytics', granted: false },
    ]);
    await page.keyboard.press('Escape');
    await solvePortal(page);
    await page.getByTestId('results-disclaimer-ok').click();
    await page.getByTestId('rb-cmd-momentY').click();
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(500);
    expect(backend.events).toEqual([]);
  });

  test('quick research choices reach the server in order, and the box shows what was stored', async ({ page }) => {
    const backend = await boot(page, { signedIn: true, researchFails: (granted) => !granted });
    await page.getByTestId('account-button').click();
    const research = page.getByTestId('profile-research');
    await research.click();
    await research.click();
    await expect(page.getByTestId('profile-dialog').getByRole('status')).toBeVisible();
    await expect(research).toBeChecked();
    expect(backend.consents).toEqual([
      { kind: 'model_research', granted: true },
      { kind: 'model_research', granted: false },
    ]);
  });

  test('turning usage sharing off and back on quickly leaves it on, here and on the server', async ({ page }) => {
    const backend = await boot(page, { signedIn: true, usageAnalytics: true });
    await page.getByTestId('account-button').click();
    const usage = page.getByTestId('profile-usage');
    await expect(usage).toBeChecked();
    await usage.click();
    await usage.click();
    await expect.poll(() => backend.consents.length).toBe(2);
    await page.waitForTimeout(600);
    expect(backend.consents).toEqual([
      { kind: 'usage_analytics', granted: false },
      { kind: 'usage_analytics', granted: true },
    ]);
    await expect(usage).toBeChecked();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('stabileo-usage-consent') ?? '{}').choice)).toBe('granted');
  });

  test("an account that refused usage sharing elsewhere stops this browser sharing, without a notice", async ({ page }) => {
    const backend = await boot(page, { signedIn: true, usageAnalytics: false });
    await expect(page.getByTestId('account-button')).toContainText('Ada Lovelace');
    await expect(page.getByTestId('usage-notice')).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('stabileo-usage-consent') ?? '{}').choice)).toBe('denied');
    await solvePortal(page);
    await page.getByTestId('results-disclaimer-ok').click();
    await page.getByTestId('rb-cmd-momentY').click();
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(500);
    expect(backend.events).toEqual([]);
    expect(backend.consents).toEqual([]);
  });

  test('nothing is sent while a returning session is still being restored, so its recorded refusal holds', async ({ page }) => {
    const backend = await boot(page, { signedIn: true, usageAnalytics: false, refreshDelayMs: 4000 });
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByTestId('account-button')).toContainText('Ada Lovelace', { timeout: 15_000 });
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(500);
    expect(backend.events).toEqual([]);
  });

  test('nothing is sent while a stored session could not be restored, since its recorded choice is unknown', async ({ page }) => {
    const backend = await boot(page, { signedIn: true, usageAnalytics: false, refreshUnavailable: true });
    await solvePortal(page);
    await page.getByTestId('results-disclaimer-ok').click();
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(500);
    expect(backend.events).toEqual([]);
  });

  test('an account under older terms is asked to accept the ones in force', async ({ page }) => {
    const backend = await boot(page, { signedIn: true, termsCurrent: false });
    await expect(page.getByTestId('terms-update')).toBeVisible();
    let downloads = 0;
    page.on('download', () => (downloads += 1));
    await page.keyboard.press('Control+s');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    expect(downloads).toBe(0);
    const browserKeepsCopy = await page.getByTestId('terms-update').locator('a').first().evaluate((a) => {
      const e = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true });
      a.dispatchEvent(e);
      return !e.defaultPrevented;
    });
    expect(browserKeepsCopy).toBe(true);
    await expect(page.getByTestId('terms-update')).toBeVisible();
    await expect(page.getByTestId('save-dialog')).toHaveCount(0);
    await page.getByTestId('terms-update-accept').click();
    await expect(page.getByTestId('terms-update')).toHaveCount(0);
    expect(backend.consents).toEqual([{ kind: 'terms', granted: true, version: TERMS_VERSION }]);
  });

  test('a signed-in user saves the open project to the cloud, gzipped', async ({ page }) => {
    const backend = await boot(page, { signedIn: true });
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.getByTestId('hdr-project').click();
    await page.getByTestId('cloud-projects-open').first().click();
    await page.getByTestId('cloud-save').click();
    await expect(page.getByTestId('cloud-row')).toHaveCount(1);
    await expect(page.getByTestId('cloud-save')).toHaveText(/Guardar cambios/);
    await page.getByTestId('cloud-save').click();
    await expect.poll(() => backend.updates.length).toBe(1);
    expect(backend.updates[0]).toMatchObject({ url: expect.stringMatching(/\/projects\/p1$/), revision: 1 });

    expect(backend.projects).toHaveLength(1);
    const saved = backend.projects[0];
    expect(saved).toMatchObject({ app_mode: 'basic', element_count: 3 });
    const doc = JSON.parse(gunzipSync(Buffer.from(String(saved.content), 'base64')).toString('utf8'));
    expect(doc.snapshot.elements).toHaveLength(3);
  });

  test('with saving behind an account, Ctrl+S asks for one and saves the file after sign-up', async ({ page }) => {
    const backend = await boot(page, { saveRequiresAccount: true });
    await page.getByTestId('usage-notice-ok').click();
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBeGreaterThan(0);

    await page.locator('body').press('Control+s');
    await expect(page.getByTestId('auth-reason')).toBeVisible();
    await expect(page.getByTestId('auth-name')).toBeVisible();
    await page.getByTestId('auth-name').fill('Ada Lovelace');
    await page.getByTestId('auth-email').fill('ada@example.com');
    await page.getByTestId('auth-password').fill('long-enough-1');
    await page.getByTestId('auth-accept-terms').check();
    const download = page.waitForEvent('download');
    await page.getByTestId('auth-submit').click();

    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.ded$/);
    await expect(page.getByTestId('auth-dialog')).toHaveCount(0);
    expect(backend.register).toHaveLength(1);
  });

  test('with saving behind an account, closing the request saves nothing and results stay free', async ({ page }) => {
    await boot(page, { saveRequiresAccount: true });
    await page.getByTestId('usage-notice-ok').click();
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.getByTestId('hdr-project').click();

    await page.getByTestId('save-open').click();
    await expect(page.getByTestId('auth-reason')).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByTestId('auth-dialog')).toHaveCount(0);
    await expect(page.getByTestId('save-confirm')).toHaveCount(0);

    await page.getByTestId('export-results').click();
    await page.getByTestId('results-export-download').click();
    await expect(page.getByTestId('auth-reason')).toBeVisible();
    await page.getByTestId('auth-dialog').getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByTestId('auth-dialog')).toHaveCount(0);

    await page.getByTestId('results-format-csv').click();
    const download = page.waitForEvent('download');
    await page.getByTestId('results-export-download').click();
    expect((await download).suggestedFilename()).toMatch(/\.csv$/);
    await expect(page.getByTestId('auth-dialog')).toHaveCount(0);
  });

  test('a signed-in user saves without being asked', async ({ page }) => {
    await boot(page, { signedIn: true, saveRequiresAccount: true });
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await expect(page.getByTestId('account-button')).toContainText('Ada Lovelace');
    const download = page.waitForEvent('download');
    await page.locator('body').press('Control+s');
    expect((await download).suggestedFilename()).toMatch(/\.ded$/);
    await expect(page.getByTestId('auth-dialog')).toHaveCount(0);
  });

  test('with one free project already saved, the open model replaces it', async ({ page }) => {
    const backend = await boot(page, { signedIn: true, saved: [savedProject('p0', 'Viejo', 3)], maxProjects: 1 });
    page.on('dialog', (d) => d.accept());
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.getByTestId('hdr-project').click();
    await page.getByTestId('cloud-projects-open').first().click();

    await expect(page.getByTestId('cloud-limit')).toBeVisible();
    await expect(page.getByTestId('cloud-save')).toHaveCount(0);
    await page.getByTestId('cloud-replace').click();

    await expect(page.getByTestId('cloud-save')).toHaveText(/Guardar cambios/);
    await expect(page.getByTestId('cloud-save-new')).toHaveCount(0);
    expect(backend.projects).toEqual([]);
    expect(backend.updates).toHaveLength(1);
    expect(backend.updates[0]).toMatchObject({ url: expect.stringMatching(/\/projects\/p0$/), app_mode: 'basic', element_count: 3, revision: 3 });
    const doc = JSON.parse(gunzipSync(Buffer.from(String(backend.updates[0].content), 'base64')).toString('utf8'));
    expect(doc.snapshot.elements).toHaveLength(3);
  });

  test('a comment from the contact menu reaches the inbox, asking for an account first', async ({ page }) => {
    const backend = await boot(page);
    await page.getByTestId('usage-notice-ok').click();
    await page.getByTestId('contact-open').click();
    await page.getByTestId('contact-feedback').click();

    await expect(page.getByTestId('auth-reason')).toBeVisible();
    await page.getByTestId('auth-name').fill('Ada Lovelace');
    await page.getByTestId('auth-email').fill('ada@example.com');
    await page.getByTestId('auth-password').fill('long-enough-1');
    await page.getByTestId('auth-accept-terms').check();
    await page.getByTestId('auth-submit').click();

    await expect(page.getByTestId('feedback-dialog')).toBeVisible();
    await page.getByTestId('feedback-kind').selectOption('idea');
    await page.getByTestId('feedback-message').fill('Exportar a IFC estructural');
    await page.getByTestId('feedback-send').click();
    await expect(page.getByTestId('feedback-msg')).toBeVisible();
    expect(backend.feedback).toEqual([expect.objectContaining({ kind: 'idea', message: 'Exportar a IFC estructural', page: '/app/basic' })]);
  });

  for (const [locale, path, title] of [
    ['es', '/es/terms/', 'Términos de uso de Stabileo'],
    ['en', '/en/privacy/', 'Stabileo Privacy Policy'],
    ['pt', '/pt/usage-data/', 'Quais dados de uso anônimos o Stabileo envia'],
  ] as const) {
    test(`the ${path} page is published in ${locale}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      await expect(page.locator('main, body').first()).toContainText('Stabileo');
    });
  }
});
