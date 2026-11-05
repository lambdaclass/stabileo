import { test, expect, CURRENT_STAMP } from './fixtures';
import type { Page, Route } from '@playwright/test';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
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

const consents = (termsCurrent: boolean, usage = true) => ({
  terms: termsCurrent ? { version: TERMS_VERSION, accepted_at: '2026-10-27T12:00:00Z' } : { version: '2020-01-01', accepted_at: '2020-01-01T12:00:00Z' },
  terms_current: termsCurrent,
  usage_analytics: usage,
  model_research: true,
});

const session = (termsCurrent = true, usage = true) => ({
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_in: 900,
  account: { ...ACCOUNT, consents: consents(termsCurrent, usage) },
});

interface Backend {
  googleOpened: number;
  attempts: string[];
  exchanges: { code: string; verifier: string }[];
  holdGoogle: (go: Promise<void>) => void;
  register: Record<string, unknown>[];
  consents: Record<string, unknown>[];
  events: Record<string, unknown>[];
  projects: Record<string, unknown>[];
  updates: Record<string, unknown>[];
  feedback: Record<string, unknown>[];
  conflictNextSave: () => void;
}

const savedProject = (id: string, name: string, revision = 1) => ({
  id, name, app_mode: 'basic', content_bytes: 100, node_count: 2, element_count: 1, app_version: 'test', revision,
  inserted_at: '2026-10-27T12:00:00Z', updated_at: '2026-10-27T12:00:00Z',
});

/** The account notices hide from automated browsers, so these tests present as a person's browser. */
async function boot(
  page: Page,
  opts: {
    termsCurrent?: boolean; usageOff?: boolean; signedIn?: boolean; saveRequiresAccount?: boolean; googleLogin?: boolean; exchangeFails?: boolean;
    saved?: ReturnType<typeof savedProject>[]; maxProjects?: number; knownToGoogle?: boolean; path?: string;
  } = {},
): Promise<Backend> {
  let googleWaits: Promise<void> = Promise.resolve();
  let conflict = false;
  const backend: Backend = {
    googleOpened: 0, attempts: [], exchanges: [], register: [], consents: [], events: [], projects: [], updates: [], feedback: [],
    holdGoogle: (go) => { googleWaits = go; },
    conflictNextSave: () => { conflict = true; },
  };
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
    json(r, 200, { user_login_enabled: true, terms_version: TERMS_VERSION, usage_telemetry_enabled: true, cloud_projects_enabled: true, save_requires_account: opts.saveRequiresAccount === true, google_login: opts.googleLogin !== false }),
  );
  await page.context().route(/\/api\/v1\/auth\/google(\?|$)/, async (r) => {
    backend.googleOpened += 1;
    const attempt = new URL(r.request().url()).searchParams.get('attempt') ?? '';
    backend.attempts.push(attempt);
    await googleWaits;
    return r.fulfill({ status: 302, headers: { location: `/oauth-callback.html?code=code-1&attempt=${attempt}` } });
  });
  await page.route('**/api/v1/auth/google/exchange', (r) => {
    const b = body(r);
    backend.exchanges.push(b);
    const attempt = createHash('sha256').update(b.verifier ?? '').digest('base64url');
    if (b.code !== 'code-1' || !backend.attempts.includes(attempt)) return json(r, 401, { error: 'invalid_or_expired_code', message: 'expired' });
    if (opts.exchangeFails) return json(r, 503, { error: 'unavailable', message: 'Try again later' });
    return opts.knownToGoogle
      ? json(r, 200, session())
      : json(r, 200, { signup_required: true, signup_token: 'signup-1', email: 'ada@gmail.test', name: 'Ada Lovelace' });
  });
  await page.route('**/api/v1/auth/refresh', (r) => json(r, 200, session(opts.termsCurrent ?? true, opts.usageOff !== true)));
  await page.route('**/api/v1/auth/google/register', (r) => {
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
    const url = new URL(r.request().url());
    const id = url.pathname.match(/\/projects\/([^/]+)$/)?.[1];
    const saved = opts.saved ?? [];
    if (r.request().method() === 'POST') {
      const b = body(r);
      backend.projects.push(b);
      return json(r, 201, { data: { ...savedProject(`p${backend.projects.length}`, b.name), app_mode: b.app_mode, node_count: b.node_count, element_count: b.element_count } });
    }
    if (r.request().method() === 'PUT') {
      const b = body(r);
      backend.updates.push({ url: r.request().url(), ...b });
      if (conflict) {
        conflict = false;
        return json(r, 409, { error: 'project_conflict', message: 'The project was saved since this revision' });
      }
      return json(r, 200, { data: { ...savedProject(id!, b.name, Number(b.revision) + 1), element_count: b.element_count } });
    }
    if (id) {
      const content = gzipSync(Buffer.from(JSON.stringify(BEAM))).toString('base64');
      return json(r, 200, { data: { ...savedProject(id, 'Beam', 9), content } });
    }
    const search = (url.searchParams.get('search') ?? '').toLowerCase();
    const found = saved.filter((p) => p.name.toLowerCase().includes(search));
    return json(r, 200, { data: found, meta: { total: found.length, used: saved.length, limit: 100, offset: 0, max_projects: opts.maxProjects ?? 100, max_bytes: 1 } });
  });
  await page.route('**/api/v1/insights/feedback', (r) => {
    backend.feedback.push(body(r));
    return json(r, 201, { data: { id: 'f1' } });
  });

  await page.goto(opts.path ?? '/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo && window.__stabileo.solverReady(), null, { timeout: 60_000 });
  return backend;
}

const BEAM = {
  version: '2.0', name: 'Beam', analysisMode: '2d',
  snapshot: {
    solvedWith: CURRENT_STAMP,
    name: 'Beam',
    nodes: [[1, { id: 1, x: 0, y: 0 }], [2, { id: 2, x: 4, y: 0 }]],
    elements: [[1, { id: 1, nodeI: 1, nodeJ: 2, type: 'frame', materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {} }]],
    materials: [[1, { id: 1, name: 'Steel', e: 200000, nu: 0.3, rho: 0 }]],
    sections: [[1, { id: 1, name: 'Beam', a: 0.01, iy: 1e-4, iz: 1e-4, j: 1e-4 }]],
    supports: [], loads: [], nextId: { node: 3, element: 2, material: 2, section: 2, support: 1, load: 1 },
  },
};

/** Google's window opens, comes back with a code for someone new, and the dialog asks for the terms. */
async function continueWithGoogle(page: Page) {
  await page.getByTestId('auth-google').click();
  await expect(page.getByTestId('auth-google-email')).toContainText('ada@gmail.test');
}

async function solvePortal(page: Page) {
  await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
  await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBeGreaterThan(0);
  await page.getByTestId('rb-cmd-solve').click();
}

test.describe('accounts, legal and anonymous usage', () => {
  test('sign-up is with Google only, waits for the terms and sends them with the optional choices unticked', async ({ page }) => {
    const backend = await boot(page);
    await page.getByTestId('account-button').click();
    await continueWithGoogle(page);
    await expect(page.getByTestId('auth-submit')).toBeDisabled();

    await expect(page.getByTestId('auth-share-usage')).not.toBeChecked();
    await expect(page.getByTestId('auth-allow-research')).not.toBeChecked();
    await page.getByTestId('auth-accept-terms').check();
    await page.getByTestId('auth-submit').click();

    await expect(page.getByTestId('auth-dialog')).toHaveCount(0);
    expect(backend.googleOpened).toBe(1);
    expect(backend.register).toEqual([
      { signup_token: 'signup-1', accept_terms: true, usage_analytics: false, model_research: false, locale: 'es', source: { trigger: 'account_button', page: '/app/basic' }, attribution: {} },
    ]);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('stabileo-usage-consent') ?? '{}').choice)).toBe('denied');
    await expect(page.getByTestId('account-button')).toContainText('Ada Lovelace');
  });

  test('usage and research use are asked at sign-up and sent only when ticked', async ({ page }) => {
    const backend = await boot(page);
    await page.getByTestId('account-button').click();
    await continueWithGoogle(page);
    await page.getByTestId('auth-accept-terms').check();
    await page.getByTestId('auth-share-usage').check();
    await page.getByTestId('auth-allow-research').check();
    await page.getByTestId('auth-submit').click();

    await expect(page.getByTestId('auth-dialog')).toHaveCount(0);
    expect(backend.register).toEqual([expect.objectContaining({ accept_terms: true, usage_analytics: true, model_research: true })]);
  });

  test('a usage answer already given in the notice is carried into the sign-up, without asking again', async ({ page }) => {
    const backend = await boot(page);
    await page.getByTestId('usage-notice-decline').click();
    await page.getByTestId('account-button').click();
    await continueWithGoogle(page);
    await expect(page.getByTestId('auth-share-usage')).toHaveCount(0);
    await page.getByTestId('auth-accept-terms').check();
    await page.getByTestId('auth-submit').click();

    await expect(page.getByTestId('auth-dialog')).toHaveCount(0);
    expect(backend.register).toEqual([expect.objectContaining({ usage_analytics: false, model_research: false })]);
  });

  test('nothing is sent before the notice is answered, and sharing sends what was held under a stable id', async ({ page }) => {
    const backend = await boot(page);
    const flush = () =>
      page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      });

    await expect(page.getByTestId('usage-notice')).toBeVisible();
    await expect(page.getByTestId('usage-notice').getByRole('button')).toHaveCount(2);
    await solvePortal(page);
    await expect(page.getByTestId('results-disclaimer')).toBeVisible();
    await expect(page.getByTestId('usage-notice')).toHaveCount(0);
    await page.getByTestId('results-disclaimer-ok').click();
    await expect(page.getByTestId('usage-notice')).toBeVisible();

    await page.getByTestId('rb-cmd-momentY').click();
    await flush();
    await page.waitForTimeout(500);
    expect(backend.events).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('stabileo-install-id'))).toBeNull();

    await page.getByTestId('usage-notice-share').click();
    await expect(page.getByTestId('usage-notice')).toHaveCount(0);
    await flush();
    await expect.poll(() => backend.events.length).toBeGreaterThan(0);
    const first = backend.events[0];
    expect(first.install_id).toBe(await page.evaluate(() => localStorage.getItem('stabileo-install-id')));
    const events = backend.events.flatMap((b) => b.events as { name: string; props: Record<string, unknown> }[]);
    expect(events.map((e) => e.name)).toEqual(expect.arrayContaining(['diagram.show', 'solve']));
    expect(events.find((e) => e.name === 'solve')!.props).toMatchObject({ outcome: 'ok', dim3: false, elements: '1-10' });
    expect(JSON.stringify(backend.events)).not.toMatch(/Portal Frame|"nodes"|"x"|coordinates/);
    expect(events.find((e) => e.name === 'example.open')?.props).toEqual({ example: 'portal-frame' });

    await page.reload();
    await page.waitForFunction(() => !!window.__stabileo && window.__stabileo.solverReady(), null, { timeout: 60_000 });
    await solvePortal(page);
    await expect(page.getByTestId('results-disclaimer')).toHaveCount(0);
    await expect(page.getByTestId('usage-notice')).toHaveCount(0);
  });

  test('not sharing drops what was held and sends nothing after', async ({ page }) => {
    const backend = await boot(page);
    await solvePortal(page);
    await page.getByTestId('results-disclaimer-ok').click();
    await page.getByTestId('usage-notice-decline').click();
    await expect(page.getByTestId('usage-notice')).toHaveCount(0);
    await page.getByTestId('rb-cmd-momentY').click();
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(500);
    expect(backend.events).toEqual([]);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('stabileo-usage-consent') ?? '{}').choice)).toBe('denied');
  });

  test('a signed-in answer to the notice is recorded on the account, and the profile turns sharing off', async ({ page }) => {
    const backend = await boot(page, { signedIn: true });
    await expect(page.getByTestId('usage-notice')).toBeVisible();
    await page.getByTestId('usage-notice-share').click();
    await expect(page.getByTestId('usage-notice')).toHaveCount(0);

    await page.getByTestId('account-button').click();
    await expect(page.getByTestId('profile-usage')).toBeChecked();
    await page.getByTestId('profile-usage').uncheck();
    await expect.poll(() => backend.consents).toEqual([
      { kind: 'usage_analytics', granted: true },
      { kind: 'usage_analytics', granted: false },
    ]);
    await page.keyboard.press('Escape');
    const before = backend.events.length;
    await solvePortal(page);
    await page.getByTestId('results-disclaimer-ok').click();
    await page.getByTestId('rb-cmd-momentY').click();
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(500);
    expect(backend.events).toHaveLength(before);
  });

  test('an account that turned usage off keeps it off in a browser that had it on', async ({ page }) => {
    const backend = await boot(page, { signedIn: true, usageOff: true });
    await expect(page.getByTestId('account-button')).toContainText('Ada Lovelace');
    await expect(page.getByTestId('usage-notice')).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('stabileo-usage-consent') ?? '{}').choice)).toBe('denied');

    await solvePortal(page);
    await page.getByTestId('results-disclaimer-ok').click();
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    });
    await page.waitForTimeout(500);
    expect(backend.events).toEqual([]);
    expect(backend.consents).toEqual([]);

    await page.getByTestId('account-button').click();
    await expect(page.getByTestId('profile-usage')).not.toBeChecked();
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
    await page.getByTestId('usage-notice-share').click();
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBeGreaterThan(0);

    await page.locator('body').press('Control+s');
    await expect(page.getByTestId('auth-reason')).toBeVisible();
    await continueWithGoogle(page);
    await page.getByTestId('auth-accept-terms').check();
    const download = page.waitForEvent('download');
    await page.getByTestId('auth-submit').click();

    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.ded$/);
    await expect(page.getByTestId('auth-dialog')).toHaveCount(0);
    expect(backend.register).toHaveLength(1);
  });

  test('with files behind an account, closing the request saves, opens, imports and exports nothing', async ({ page }) => {
    await boot(page, { saveRequiresAccount: true });
    await page.getByTestId('usage-notice-share').click();
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBe(3);
    let downloads = 0;
    page.on('download', () => void (downloads += 1));
    const refuse = async () => {
      await expect(page.getByTestId('auth-reason')).toBeVisible();
      await page.getByTestId('auth-dialog').getByRole('button', { name: 'Cancelar' }).click();
      await expect(page.getByTestId('auth-dialog')).toHaveCount(0);
    };
    const reveal = async (id: string) => {
      if (!(await page.getByTestId(id).isVisible())) await page.getByTestId('hdr-project').click();
    };

    await reveal('save-open');
    await page.getByTestId('save-open').click();
    await page.getByTestId('save-confirm').click();
    await refuse();
    await expect(page.getByTestId('save-dialog')).toBeVisible();

    for (const [opener, confirm] of [
      ['export-results', 'results-export-download'],
      ['export-report', 'calc-report-generate'],
      ['export-drawings', 'view-export-download'],
      ['xls-template', null],
    ] as const) {
      await reveal(opener);
      await page.getByTestId(opener).click();
      if (confirm) await page.getByTestId(confirm).click();
      await refuse();
      await page.keyboard.press('Escape');
    }

    await reveal('save-open');
    await page.getByTestId('project-open-file').setInputFiles({ name: 'beam.ded', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(BEAM)) });
    await refuse();
    await page.getByTestId('xls-input').setInputFiles({ name: 'model.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('not a workbook') });
    await refuse();
    expect(await page.evaluate(() => window.__stabileo.elementIds().length)).toBe(3);
    expect(downloads).toBe(0);
  });

  test('when Google sign-in fails, the save goes ahead without an account, and later ones are not asked again', async ({ page }) => {
    const backend = await boot(page, { saveRequiresAccount: true, exchangeFails: true });
    await page.getByTestId('usage-notice-share').click();
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBe(3);

    await page.locator('body').press('Control+s');
    await expect(page.getByTestId('auth-reason')).toBeVisible();
    const first = page.waitForEvent('download');
    await page.getByTestId('auth-google').click();
    expect((await first).suggestedFilename()).toMatch(/\.ded$/);
    await expect(page.getByTestId('auth-dialog')).toHaveCount(0);
    expect(backend.exchanges).toHaveLength(1);

    const second = page.waitForEvent('download');
    await page.locator('body').press('Control+s');
    expect((await second).suggestedFilename()).toMatch(/\.ded$/);
    await expect(page.getByTestId('auth-dialog')).toHaveCount(0);
  });

  test('without Google sign-in on offer, saving never asks for an account', async ({ page }) => {
    await boot(page, { saveRequiresAccount: true, googleLogin: false });
    await page.getByTestId('usage-notice-share').click();
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await expect.poll(() => page.evaluate(() => window.__stabileo.elementIds().length)).toBe(3);
    const download = page.waitForEvent('download');
    await page.locator('body').press('Control+s');
    expect((await download).suggestedFilename()).toMatch(/\.ded$/);
    await expect(page.getByTestId('auth-dialog')).toHaveCount(0);
  });

  test('opening a file asks for an account and opens it after sign-up', async ({ page }) => {
    const backend = await boot(page, { saveRequiresAccount: true });
    await page.getByTestId('usage-notice-share').click();
    await page.getByTestId('hdr-project').click();

    await page.getByTestId('project-open-file').setInputFiles({ name: 'beam.ded', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(BEAM)) });
    await expect(page.getByTestId('auth-reason')).toBeVisible();
    await continueWithGoogle(page);
    await page.getByTestId('auth-accept-terms').check();
    await page.getByTestId('auth-submit').click();

    await expect(page.getByTestId('auth-dialog')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBe(2);
    expect(backend.register).toHaveLength(1);
  });

  test('a signed-in user exports the results CSV without being asked', async ({ page }) => {
    await boot(page, { signedIn: true, saveRequiresAccount: true });
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await expect(page.getByTestId('account-button')).toContainText('Ada Lovelace');
    await page.getByTestId('hdr-project').click();
    await page.getByTestId('export-results').click();
    await page.getByTestId('results-format-csv').click();
    const download = page.waitForEvent('download');
    await page.getByTestId('results-export-download').click();
    expect((await download).suggestedFilename()).toMatch(/\.csv$/);
    await expect(page.getByTestId('auth-dialog')).toHaveCount(0);
  });

  test('in PRO, opening, importing and exporting ask for an account too', async ({ page }) => {
    await boot(page, { saveRequiresAccount: true, path: '/app/pro?e2e=1' });
    await page.getByTestId('usage-notice-share').click();
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBeGreaterThan(0);
    const nodes = await page.evaluate(() => window.__stabileo.nodeCount());
    let downloads = 0;
    page.on('download', () => void (downloads += 1));
    const refuse = async () => {
      await expect(page.getByTestId('auth-reason')).toBeVisible();
      await page.getByTestId('auth-dialog').getByRole('button', { name: 'Cancelar' }).click();
      await expect(page.getByTestId('auth-dialog')).toHaveCount(0);
    };
    const reveal = async (id: string) => {
      if (!(await page.getByTestId(id).isVisible())) await page.getByTestId('pr-project').click();
    };

    for (const [opener, confirm] of [
      ['pp-export-results', 'pro-data-export-download'],
      ['pp-export-report', 'rpt-pdf'],
      ['pp-export-drawings', 'pro-dxf-export-download'],
      ['pp-export-ifc', null],
      ['pp-xls-template', null],
    ] as const) {
      await reveal(opener);
      await page.getByTestId(opener).click();
      if (confirm) await page.getByTestId(confirm).click();
      await refuse();
      await page.keyboard.press('Escape');
    }

    await reveal('pp-export-results');
    await page.getByTestId('pp-open-file').setInputFiles({ name: 'beam.ded', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(BEAM)) });
    await refuse();
    expect(await page.evaluate(() => window.__stabileo.nodeCount())).toBe(nodes);
    expect(downloads).toBe(0);
  });

  test('someone Google already knows is signed in without a terms step', async ({ page }) => {
    const backend = await boot(page, { knownToGoogle: true });
    await page.getByTestId('account-button').click();
    await page.getByTestId('auth-google').click();

    await expect(page.getByTestId('auth-dialog')).toHaveCount(0);
    await expect(page.getByTestId('account-button')).toContainText('Ada Lovelace');
    expect(backend.register).toEqual([]);
  });

  test('a callback from another attempt, in another tab, finishes nothing; this attempt\'s does', async ({ page }) => {
    const backend = await boot(page, { knownToGoogle: true });
    let go!: () => void;
    backend.holdGoogle(new Promise<void>((resolve) => { go = resolve; }));
    await page.getByTestId('account-button').click();
    await page.getByTestId('auth-google').click();
    await expect(page.getByTestId('auth-google-waiting')).toBeVisible();
    await expect.poll(() => backend.attempts.length).toBe(1);
    expect(backend.attempts[0]).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const stray = await page.context().newPage();
    for (const query of [`code=code-1&attempt=${'x'.repeat(43)}`, 'code=code-1', `code=someone-else&attempt=${'y'.repeat(43)}`]) {
      await stray.goto(`/oauth-callback.html?${query}`);
      await expect(stray.locator('#m')).not.toHaveText('Stabileo');
    }
    await stray.close();
    await expect(page.getByTestId('auth-google-waiting')).toBeVisible();
    expect(backend.exchanges).toEqual([]);

    go();
    await expect(page.getByTestId('auth-dialog')).toHaveCount(0);
    await expect(page.getByTestId('account-button')).toContainText('Ada Lovelace');
    expect(backend.exchanges).toHaveLength(1);
    expect(backend.exchanges[0].code).toBe('code-1');
    expect(createHash('sha256').update(backend.exchanges[0].verifier).digest('base64url')).toBe(backend.attempts[0]);
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
    const backend = await boot(page, { signedIn: true, saved: [savedProject('p0', 'Viejo')], maxProjects: 1 });
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
    expect(backend.updates[0]).toMatchObject({ url: expect.stringMatching(/\/projects\/p0$/), app_mode: 'basic', element_count: 3, revision: 1 });
    const doc = JSON.parse(gunzipSync(Buffer.from(String(backend.updates[0].content), 'base64')).toString('utf8'));
    expect(doc.snapshot.elements).toHaveLength(3);
  });

  test('a cloud save over a project saved elsewhere since overwrites nothing and offers a copy or the saved version', async ({ page }) => {
    const backend = await boot(page, { signedIn: true });
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.getByTestId('hdr-project').click();
    await page.getByTestId('cloud-projects-open').first().click();
    await page.getByTestId('cloud-save').click();
    await expect(page.getByTestId('cloud-save')).toHaveText(/Guardar cambios/);

    backend.conflictNextSave();
    await page.getByTestId('cloud-save').click();
    await expect(page.getByTestId('cloud-conflict')).toBeVisible();
    expect(backend.updates).toEqual([expect.objectContaining({ url: expect.stringMatching(/\/projects\/p1$/), revision: 1 })]);
    await page.getByTestId('cloud-conflict-cancel').click();
    await expect(page.getByTestId('cloud-conflict')).toHaveCount(0);
    expect(await page.evaluate(() => window.__stabileo.elementIds().length)).toBe(3);

    backend.conflictNextSave();
    await page.getByTestId('cloud-save').click();
    await page.getByTestId('cloud-conflict-copy').click();
    await expect(page.getByTestId('cloud-conflict')).toHaveCount(0);
    expect(backend.projects).toHaveLength(2);

    await page.getByTestId('cloud-save').click();
    await expect.poll(() => backend.updates.length).toBe(3);
    expect(backend.updates[2]).toMatchObject({ url: expect.stringMatching(/\/projects\/p2$/), revision: 1 });

    backend.conflictNextSave();
    await page.getByTestId('cloud-save').click();
    await page.getByTestId('cloud-conflict-open').click();
    await expect(page.getByTestId('cloud-projects')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__stabileo.nodeCount())).toBe(2);
  });

  test('searching the cloud projects keeps the limit, which counts every saved project', async ({ page }) => {
    await boot(page, { signedIn: true, saved: [savedProject('p0', 'Viejo')], maxProjects: 1 });
    await page.evaluate(() => window.__stabileoActions.loadExample('portal-frame'));
    await page.getByTestId('hdr-project').click();
    await page.getByTestId('cloud-projects-open').first().click();
    await expect(page.getByTestId('cloud-limit')).toBeVisible();

    await page.getByTestId('cloud-search').fill('zzz');
    await expect(page.getByTestId('cloud-row')).toHaveCount(0);
    await expect(page.getByTestId('cloud-limit')).toBeVisible();
    await expect(page.getByTestId('cloud-save')).toHaveCount(0);
  });

  test('a comment from the profile opens on top, with the profile closed', async ({ page }) => {
    const backend = await boot(page, { signedIn: true });
    await page.getByTestId('usage-notice-share').click();
    await page.getByTestId('account-button').click();
    await page.getByTestId('profile-feedback-open').click();

    await expect(page.getByTestId('profile-feedback-open')).toHaveCount(0);
    await page.getByTestId('feedback-kind').selectOption('bug');
    await page.getByTestId('feedback-message').fill('El diálogo quedaba tapado');
    await page.getByTestId('feedback-send').click();
    await expect(page.getByTestId('feedback-msg')).toBeVisible();
    expect(backend.feedback).toEqual([expect.objectContaining({ kind: 'bug', message: 'El diálogo quedaba tapado' })]);
  });

  test('a comment from the contact menu reaches the inbox, asking for an account first', async ({ page }) => {
    const backend = await boot(page);
    await page.getByTestId('usage-notice-share').click();
    await page.getByTestId('contact-open').click();
    await page.getByTestId('contact-feedback').click();

    await expect(page.getByTestId('auth-reason')).toBeVisible();
    await continueWithGoogle(page);
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
    ['en', '/en/privacy/', 'The Stabileo Privacy Policy'],
    ['pt', '/pt/usage-data/', 'Quais dados de uso anônimos o Stabileo envia'],
  ] as const) {
    test(`the ${path} page is published in ${locale}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      await expect(page.locator('main, body').first()).toContainText('Stabileo');
    });
  }
});
