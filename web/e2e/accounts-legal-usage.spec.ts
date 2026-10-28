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

const consents = (termsCurrent: boolean) => ({
  terms: termsCurrent ? { version: TERMS_VERSION, accepted_at: '2026-10-27T12:00:00Z' } : { version: '2020-01-01', accepted_at: '2020-01-01T12:00:00Z' },
  terms_current: termsCurrent,
  usage_analytics: false,
  model_research: false,
});

const session = (termsCurrent = true) => ({
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_in: 900,
  account: { ...ACCOUNT, consents: consents(termsCurrent) },
});

interface Backend {
  register: Record<string, unknown>[];
  consents: Record<string, unknown>[];
  events: Record<string, unknown>[];
  projects: Record<string, unknown>[];
}

/** The account notices hide from automated browsers, so these tests present as a person's browser. */
async function boot(page: Page, opts: { termsCurrent?: boolean; signedIn?: boolean; saveRequiresAccount?: boolean } = {}): Promise<Backend> {
  const backend: Backend = { register: [], consents: [], events: [], projects: [] };
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
  await page.route('**/api/v1/auth/refresh', (r) => json(r, 200, session(opts.termsCurrent ?? true)));
  await page.route('**/api/v1/auth/register', (r) => {
    const b = body(r);
    backend.register.push(b);
    return b.accept_terms === true
      ? json(r, 201, session())
      : json(r, 422, { error: 'validation_error', message: 'Validation failed', details: { accept_terms: ['must be accepted'] } });
  });
  await page.route('**/api/v1/auth/consents', (r) => {
    backend.consents.push(body(r));
    return json(r, 201, { data: { ...ACCOUNT, consents: consents(true) } });
  });
  await page.route('**/api/v1/insights/events', (r) => {
    backend.events.push(body(r));
    return json(r, 202, { accepted: 1, rejected: 0, enabled: true });
  });
  await page.route('**/api/v1/projects**', (r) => {
    if (r.request().method() === 'POST') {
      const b = body(r);
      backend.projects.push(b);
      return json(r, 201, { data: { id: 'p1', name: b.name, app_mode: b.app_mode, content_bytes: 100, node_count: b.node_count, element_count: b.element_count, app_version: 'test', inserted_at: '2026-10-27T12:00:00Z', updated_at: '2026-10-27T12:00:00Z' } });
    }
    return json(r, 200, { data: [], meta: { total: 0, limit: 100, offset: 0, max_projects: 100, max_bytes: 1 } });
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
      expect.objectContaining({ email: 'ada@example.com', name: 'Ada Lovelace', accept_terms: true, usage_analytics: true }),
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
    expect(events.map((e) => e.name)).toEqual(expect.arrayContaining(['diagram.show', 'solve']));
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

  test('an account under older terms is asked to accept the ones in force', async ({ page }) => {
    const backend = await boot(page, { signedIn: true, termsCurrent: false });
    await expect(page.getByTestId('terms-update')).toBeVisible();
    await page.getByTestId('terms-update-accept').click();
    await expect(page.getByTestId('terms-update')).toHaveCount(0);
    expect(backend.consents).toEqual([{ kind: 'terms', granted: true }]);
  });

  test('a signed-in user saves the open project to the cloud, gzipped', async ({ page }) => {
    const backend = await boot(page, { signedIn: true });
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.getByTestId('hdr-project').click();
    await page.getByTestId('cloud-projects-open').first().click();
    await page.getByTestId('cloud-save').click();
    await expect(page.getByTestId('cloud-row')).toHaveCount(1);
    await expect(page.getByTestId('cloud-save')).toHaveText(/Guardar cambios/);

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

    await page.getByTestId('export-excel').click();
    await expect(page.getByTestId('auth-reason')).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();

    const download = page.waitForEvent('download');
    await page.getByTestId('export-csv').click();
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
