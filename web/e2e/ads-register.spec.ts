import { test, expect } from './fixtures';
import type { Page, Route } from '@playwright/test';
import { createHash } from 'node:crypto';

const ACCOUNT = {
  id: '6f1c2c0e-0000-4000-8000-0000000000ad',
  email: 'ada@gmail.test',
  name: 'Ada Lovelace',
  company: null,
  job_title: null,
  country: null,
  locale: 'es',
  email_verified_at: '2026-11-02T12:00:00Z',
  inserted_at: '2026-11-02T12:00:00Z',
  consents: { terms: { version: '2026-10-27', accepted_at: '2026-11-02T12:00:00Z' }, terms_current: true, usage_analytics: true, model_research: true },
};

const SESSION = { access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 900, account: ACCOUNT };

interface Backend {
  attempts: string[];
  register: Record<string, unknown>[];
  trackers: string[];
}

async function boot(page: Page, query: string): Promise<Backend> {
  const backend: Backend = { attempts: [], register: [], trackers: [] };
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    try {
      if (sessionStorage.getItem('booted')) return;
      sessionStorage.setItem('booted', '1');
      localStorage.clear();
      localStorage.setItem('stabileo-lang', 'es');
      localStorage.setItem('stabileo-lang-manual', '1');
      localStorage.setItem('stabileo-feature-accounts', '1');
    } catch {
      /* storage blocked */
    }
  });
  const body = (r: Route) => (r.request().postData() ? JSON.parse(r.request().postData()!) : undefined);
  const json = (r: Route, status: number, data: unknown) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

  await page.context().route(/connect\.facebook\.net|googletagmanager\.com/, (r) => {
    backend.trackers.push(r.request().url());
    return r.abort();
  });
  await page.route('**/api/v1/marketing/tracking', (r) => json(r, 200, { data: { meta_pixel_id: '123456789', gtm_container_id: 'GTM-ABC123' } }));
  await page.route('**/api/v1/marketing/activity', (r) => json(r, 200, { data: { recorded: [] } }));
  await page.route('**/api/v1/auth/config', (r) =>
    json(r, 200, { user_login_enabled: true, terms_version: '2026-10-27', usage_telemetry_enabled: false, cloud_projects_enabled: true, save_requires_account: true, google_login: true }),
  );
  await page.context().route(/\/api\/v1\/auth\/google(\?|$)/, (r) => {
    const attempt = new URL(r.request().url()).searchParams.get('attempt') ?? '';
    backend.attempts.push(attempt);
    return r.fulfill({ status: 302, headers: { location: `/oauth-callback.html?code=code-1&attempt=${attempt}` } });
  });
  await page.route('**/api/v1/auth/google/exchange', (r) => {
    const b = body(r);
    const attempt = createHash('sha256').update(b.verifier ?? '').digest('base64url');
    if (!backend.attempts.includes(attempt)) return json(r, 401, { error: 'invalid_or_expired_code', message: 'expired' });
    return json(r, 200, { signup_required: true, signup_token: 'signup-1', email: 'ada@gmail.test', name: 'Ada Lovelace' });
  });
  await page.route('**/api/v1/auth/google/register', (r) => {
    backend.register.push(body(r));
    return json(r, 201, SESSION);
  });
  await page.route('**/api/v1/auth/refresh', (r) => json(r, 200, SESSION));
  await page.route('**/api/v1/insights/events', (r) => json(r, 202, { accepted: 0, rejected: 0, enabled: false }));
  await page.goto(`/es/register/${query}`);
  return backend;
}

test.describe('the ads sign-up page', () => {
  test('from a Meta ad: one click to Google, the terms, an account that carries its ad, and the editor on the portal frame', async ({ page }) => {
    const backend = await boot(page, '?utm_source=ig&utm_medium=paid&utm_campaign=120210&utm_term=120220&utm_content=120230&fbclid=IwAR123');
    await expect(page.getByTestId('register-page')).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    expect(backend.trackers).toEqual([]);
    await page.getByTestId('ad-consent-accept').click();
    await expect(page.getByTestId('ad-consent')).toHaveCount(0);

    await page.getByTestId('register-cta-hero').click();
    await expect(page.getByTestId('register-terms-email')).toContainText('ada@gmail.test');
    await expect(page.getByTestId('register-terms-submit')).toBeDisabled();
    await page.getByTestId('register-accept-terms').check();
    await page.getByTestId('register-terms-submit').click();

    await expect(page).toHaveURL(/\/app\/basic\?example=portal-frame/);
    expect(backend.register).toHaveLength(1);
    const sent = backend.register[0] as { source: Record<string, string>; attribution: Record<string, unknown>; accept_terms: boolean };
    expect(sent.accept_terms).toBe(true);
    expect(sent.source).toMatchObject({ utm_source: 'ig', utm_medium: 'paid', utm_campaign: '120210', utm_term: '120220', utm_content: '120230', fbclid: 'IwAR123', landing: '/es/register/', trigger: 'register.hero' });
    expect(sent.attribution.consent).toBe(true);
    expect(sent.attribution.fbc).toMatch(/^fb\.1\.\d+\.IwAR123$/);

    const queue = await page.evaluate(() => (window as unknown as { fbq?: { queue: unknown[] } }).fbq?.queue ?? []);
    expect(queue).toEqual(expect.arrayContaining([
      ['set', 'autoConfig', false, '123456789'],
      ['trackCustom', 'SignUpClick', { placement: 'hero' }],
      ['track', 'CompleteRegistration', {}, { eventID: createHash('sha256').update(ACCOUNT.id).digest('hex') }],
    ]));
    const layer = await page.evaluate(() => (window as unknown as { dataLayer?: Record<string, unknown>[] }).dataLayer ?? []);
    expect(layer).toEqual(expect.arrayContaining([expect.objectContaining({ event: 'sign_up', event_id: createHash('sha256').update(ACCOUNT.id).digest('hex'), utm_campaign: '120210' })]));
    expect(backend.trackers.some((u) => u.includes('fbevents.js'))).toBe(true);
  });

  test('declining advertising cookies: no tracker, no cookie, and the account still knows its campaign', async ({ page }) => {
    const backend = await boot(page, '?utm_source=ig&utm_medium=paid&utm_campaign=120210&fbclid=IwAR123');
    await page.getByTestId('ad-consent-decline').click();
    await expect(page.getByTestId('ad-consent')).toHaveCount(0);

    await page.getByTestId('register-cta-hero').click();
    await page.getByTestId('register-accept-terms').check();
    await page.getByTestId('register-terms-submit').click();
    await expect(page).toHaveURL(/\/app\/basic\?example=portal-frame/);

    const sent = backend.register[0] as { source: Record<string, string>; attribution: Record<string, unknown> };
    expect(sent.source).toMatchObject({ utm_source: 'ig', utm_campaign: '120210', trigger: 'register.hero' });
    expect(sent.attribution).toEqual({});
    expect(backend.trackers).toEqual([]);
    const cookies = await page.context().cookies();
    expect(cookies.map((c) => c.name)).not.toContain('stb_visit');
    expect(await page.evaluate(() => 'fbq' in window)).toBe(false);
  });

  test('the wheel scrolls down to the editor, which loads only when asked, on the portal frame', async ({ page }) => {
    await boot(page, '');
    await expect(page.getByTestId('register-editor')).toHaveCount(0);
    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, 1600);
    await expect(page.getByTestId('register-open-editor')).toBeInViewport();
    await page.getByTestId('register-open-editor').click();
    await expect(page.getByTestId('register-editor')).toHaveAttribute('src', /\/app\/basic\?(embed&)?example=portal-frame/);
  });

  test('closing the Google window leaves the page as it was, with nothing sent', async ({ page }) => {
    const backend = await boot(page, '');
    await page.context().unroute(/\/api\/v1\/auth\/google(\?|$)/);
    await page.context().route(/\/api\/v1\/auth\/google(\?|$)/, (r) => r.fulfill({ status: 302, headers: { location: '/oauth-callback.html?error=provider_error' } }));
    await page.getByTestId('register-cta-final').click();
    await expect(page.getByTestId('register-error')).toBeVisible();
    await expect(page.getByTestId('register-terms')).toHaveCount(0);
    expect(backend.register).toEqual([]);
    await expect(page).toHaveURL(/\/es\/register\//);
  });
});
