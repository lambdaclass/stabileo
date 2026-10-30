import { test, expect, type Page } from '@playwright/test';

/**
 * A snapshot build (`/@<commit>/`, web/scripts/snapshot.ts) under `vite preview`: every page, asset,
 * worker and WASM the site loads comes from under the prefix, navigation stays under it, and the
 * version banner points at the latest page and at the compare view on GitHub.
 */
const P = process.env.SNAPSHOT_PREFIX!; // '/@abc1234/'
const SHORT = P.slice(2, -1);

/** Every same-origin request path, to check none leaves the snapshot (including unexpected API calls). */
function watch(page: Page, baseURL: string | undefined) {
  const origin = new URL(baseURL!).origin;
  const outside: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin !== origin) return;
    // Cite this reads the snapshot index outside the build prefix.
    if (!u.pathname.startsWith(P) && u.pathname !== '/@/') outside.push(u.pathname);
  });
  return outside;
}

test('the research page is served under the prefix, with the version banner', async ({ page, baseURL }) => {
  const outside = watch(page, baseURL);
  const res = await page.goto(`${P}en/research/fracture/shauer-2025/`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Phase-field fracture of a notched plate' })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${P}en/research/fracture/shauer-2025/$`));

  const banner = page.locator('#stabileo-snapshot-banner');
  await expect(banner).toContainText(`(${SHORT})`);
  await expect(banner).toContainText('You’re viewing the version of');
  const latest = banner.getByRole('link', { name: 'The latest version is here' });
  expect(new URL((await latest.getAttribute('href'))!).pathname).toBe('/en/research/fracture/shauer-2025/');
  expect(await banner.getByRole('link', { name: /What changed since/ }).getAttribute('href')).toMatch(
    new RegExp(`^https://github.com/lambdaclass/stabileo/compare/${SHORT}[0-9a-f]*\\.\\.\\.main$`),
  );

  // Every root-relative link the page renders names the snapshot.
  const hrefs = await page.locator('a[href^="/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
  expect(hrefs.length).toBeGreaterThan(5);
  expect(hrefs.filter((h) => !h.startsWith(P))).toEqual([]);

  // Cite this names this snapshot as the permanent link.
  await expect(page.getByTestId('cite-permalink').getByRole('link')).toHaveAttribute('href', new RegExp(`${P}en/research/fracture/shauer-2025/$`));
  await expect(page.getByTestId('cite-version')).not.toContainText('not yet released');
  await expect(page.getByTestId('cite-text')).toContainText(`${P}en/research/fracture/shauer-2025/`);
  await expect(page.getByTestId('cite-bibtex')).toContainText('@misc{stabileo-shauer-2025-v1,');
  await expect(page.getByTestId('cite-bibtex')).toContainText('doi:10.1016/j.advengsoft.2025.104013');

  // The research WASM, in its worker, from the snapshot.
  const wasm: string[] = [];
  page.on('request', (r) => {
    if (r.url().endsWith('phasefield_bg.wasm')) wasm.push(new URL(r.url()).pathname);
  });
  await page.locator('#rs-tab-parameters').click();
  await page.locator('#p-mesh').selectOption('coarse');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('.rs-app')).toHaveAttribute('data-source', 'live');
  await expect.poll(async () => Number(await page.locator('.rs-app').getAttribute('data-steps')), { timeout: 60_000 }).toBeGreaterThanOrEqual(3);
  // One WASM, from this build's immutable directory under the snapshot prefix (research assets are
  // versioned by build id: research-wasm/builds/<id>/).
  expect(wasm).toHaveLength(1);
  expect(wasm[0]).toMatch(new RegExp(`^${P}research-wasm/builds/[0-9a-f]{64}/shauer-2025/phasefield_bg\\.wasm$`));
  expect(outside).toEqual([]);
});

test('navigation between public pages stays in the snapshot', async ({ page, baseURL }) => {
  const outside = watch(page, baseURL);
  await page.goto(`${P}es/research/`);
  await expect(page.getByRole('heading', { name: 'Stabileo Research' })).toBeVisible();
  await expect(page.locator('#stabileo-snapshot-banner')).toContainText('Estás viendo la versión del');
  await expect(page.getByTestId('gallery-permalink').first()).toHaveAttribute('href', new RegExp(`${P}es/research/fracture/shauer-2025/$`));
  await page.locator('a[href$="/research/fracture/shauer-2025/"]:visible').first().click();
  await expect(page).toHaveURL(new RegExp(`${P}es/research/fracture/shauer-2025/$`));
  await expect(page.locator('#stabileo-snapshot-banner a').first()).toHaveAttribute('href', /\/es\/research\/fracture\/shauer-2025\/$/);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${P}es/research/$`));
  await page.goto(P);
  await expect(page.locator('.landing')).toBeVisible();
  expect(outside).toEqual([]);
});

test('the application mounts under the prefix and loads the engine from it', async ({ page, baseURL }) => {
  const outside = watch(page, baseURL);
  const wasm: { path: string; status: number; type: string }[] = [];
  page.on('response', (r) => {
    if (/\.wasm$/.test(new URL(r.url()).pathname)) wasm.push({ path: new URL(r.url()).pathname, status: r.status(), type: r.headers()['content-type'] ?? '' });
  });
  const res = await page.goto(`${P}app/basic`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Solve', exact: true }).first()).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(new RegExp(`${P}app/basic`));
  await expect.poll(() => wasm.length, { timeout: 60_000 }).toBeGreaterThan(0);
  for (const w of wasm) {
    expect(w.path.startsWith(`${P}assets/`)).toBe(true);
    expect(w.status).toBe(200);
  }
  await expect(page.locator('#stabileo-snapshot-banner')).toContainText(SHORT);
  expect(outside).toEqual([]);
});

test('snapshot edits and closing leave production workspace and autosave untouched', async ({ page, context }) => {
  const seed = await context.newPage();
  await seed.goto(`${P}SNAPSHOT.json`);
  await seed.evaluate(async () => {
    localStorage.setItem('stabileo-workspace', 'production workspace');
    localStorage.setItem('stabileo-autosave', 'production fallback');
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('stabileo-autosave');
      request.onupgradeneeded = () => request.result.createObjectStore('sentinel');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('sentinel', 'readwrite');
        tx.objectStore('sentinel').put('production revision', 'original');
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    });
  });
  await page.goto(`${P}app/basic?example=cantilever-point`);
  await expect(page.locator('.tab.active .tab-name')).toHaveValue('Cantilever (point)');
  await page.locator('.tab.active .tab-name').fill('Snapshot edit');
  await page.locator('.tab.active .tab-name').press('Tab');
  await expect(page.getByRole('button', { name: 'Solve', exact: true }).first()).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('stabileo-workspace')), { timeout: 40_000 }).toContain('Snapshot edit');
  await page.goto(`${P}app/basic`);
  await expect(page.locator('.tab.active .tab-name')).toHaveValue('Snapshot edit');
  await page.reload();
  await expect(page.locator('.tab.active .tab-name')).toHaveValue('Snapshot edit');
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
  await page.close();
  expect(await seed.evaluate(() => [localStorage.getItem('stabileo-workspace'), localStorage.getItem('stabileo-autosave')]))
    .toEqual(['production workspace', 'production fallback']);
  expect(await seed.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('stabileo-autosave');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction('sentinel').objectStore('sentinel').get('original');
      read.onsuccess = () => { db.close(); resolve(read.result); };
      read.onerror = () => reject(read.error);
    };
  }))).toBe('production revision');
});

test('a copied model opens with the same snapshot engine', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`${P}app/basic?example=cantilever-point`);
  await expect(page.locator('.tab.active .tab-name')).toHaveValue('Cantilever (point)');
  await expect(page.getByRole('button', { name: 'Solve', exact: true }).first()).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('hdr-project').click();
  await page.getByTestId('project-share-link').click();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(url).pathname).toBe(`${P}app/basic`);
  expect(new URL(url).hash).toMatch(/^#(data|code)=/);
  const recipient = await context.newPage();
  const wasm: string[] = [];
  recipient.on('request', r => { if (new URL(r.url()).pathname.endsWith('.wasm')) wasm.push(new URL(r.url()).pathname); });
  await recipient.goto(url);
  await expect(recipient.getByRole('button', { name: 'Solve', exact: true }).first()).toBeVisible({ timeout: 60_000 });
  await expect(recipient.locator('#stabileo-snapshot-banner')).toContainText(SHORT);
  await expect.poll(() => wasm.length).toBeGreaterThan(0);
  expect(wasm.every(path => path.startsWith(`${P}assets/`))).toBe(true);
});

test('blog embeds keep their editor and WASM in the snapshot', async ({ page, baseURL }) => {
  const outside = watch(page, baseURL);
  const wasm: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('.wasm')) wasm.push(request.url());
  });
  await page.goto(`${P}en/blog/torsion-bredt-saint-venant/`);
  await page.locator('.post-embed-start').first().click();
  const iframe = page.locator('.post-embed iframe').first();
  await expect(iframe).toHaveAttribute('src', new RegExp(`^${P}app/`));
  await expect.poll(() => wasm.length, { timeout: 60_000 }).toBeGreaterThan(0);
  expect(wasm.every(url => url.startsWith(new URL(P, baseURL).href))).toBe(true);
  expect(outside).toEqual([]);
});

test('an unpatched about:blank frame cannot read live-origin storage', async ({ page, context }) => {
  const live = await context.newPage();
  const origin = 'http://localhost:5197';
  await context.route(`${origin}/**`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Live origin</title>' }));
  await live.goto(origin);
  await live.evaluate(async () => {
    localStorage.setItem('production-token', 'secret');
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('production-private');
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
  });
  await page.goto(`${P}en/research/`);
  await expect(page.locator('#stabileo-snapshot-banner')).toBeVisible();
  expect(await page.evaluate(async () => {
    const frame = document.createElement('iframe');
    frame.src = 'about:blank';
    document.body.append(frame);
    const raw = frame.contentWindow!;
    const token = raw.localStorage.getItem('production-token');
    const databases = await raw.indexedDB.databases();
    raw.localStorage.setItem('production-token', 'snapshot');
    return { token, databases: databases.map(db => db.name) };
  })).toEqual({ token: null, databases: [] });
  expect(await live.evaluate(() => localStorage.getItem('production-token'))).toBe('secret');
});

for (const locale of ['es-AR', 'pt-BR']) {
  test(`the frozen root follows browser language ${locale}`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ locale, baseURL });
    const page = await context.newPage();
    const outside = watch(page, baseURL);
    await page.goto(`${P}?campaign=research#top`);
    await expect(page).toHaveURL(new URL(`${P}${locale.slice(0, 2)}/?campaign=research#top`, baseURL).href);
    await expect(page.locator('.landing')).toBeVisible();
    expect(outside).toEqual([]);
    await context.close();
  });
}

for (const width of [390, 810]) {
  for (const locale of ['en', 'es', 'pt']) {
    test(`${locale} citation controls fit a ${width}px viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${P}${locale}/research/fracture/shauer-2025/`);
      const banner = page.locator('#stabileo-snapshot-banner');
      const dismiss = banner.getByRole('button');
      await expect(dismiss).toBeVisible();
      const dismissBox = (await dismiss.boundingBox())!;
      expect(dismissBox.width).toBeGreaterThanOrEqual(44);
      expect(dismissBox.height).toBeGreaterThanOrEqual(44);
      await dismiss.click();
      await expect(banner).toHaveCount(0);
      const cite = page.locator('section.rs-citethis');
      await cite.scrollIntoViewIfNeeded();
      const buttons = cite.getByRole('button');
      await expect(buttons).toHaveCount(3);
      for (const button of await buttons.all()) {
        await button.scrollIntoViewIfNeeded();
        const box = (await button.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        await button.click({ trial: true });
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const pre of await cite.locator('pre').all()) {
        expect(await pre.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
        expect(await pre.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(13);
      }
    });
  }
}

for (const width of [390, 810]) {
  test(`frozen online services explain their availability at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    const outside = watch(page, baseURL);
    const serviceRequests: string[] = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/') || url.hostname === 'challenges.cloudflare.com' || (['fetch', 'xhr'].includes(request.resourceType()) && url.origin !== new URL(baseURL!).origin)) serviceRequests.push(url.href);
    });
    await page.goto(`${P}app/basic?example=cantilever-point`);
    await page.evaluate(() => localStorage.setItem('stabileo-feature-accounts', '1'));
    await page.reload();
    await expect(page.getByRole('button', { name: 'Solve', exact: true }).first()).toBeVisible();
    await expect(page.locator('#stabileo-snapshot-banner [data-services]')).toContainText('Accounts, AI and feedback are unavailable');
    await page.locator('#stabileo-snapshot-banner button').click();
    await page.getByTestId('ai-open').click();
    const notice = page.getByTestId('frozen-services-notice').first();
    await expect(notice).toContainText('Use the latest version');
    expect(await notice.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.feedback-widget')).toHaveCount(0);
    await expect(page.getByTestId('account-button')).toHaveCount(0);
    expect(serviceRequests).toEqual([]);
    expect(outside).toEqual([]);
  });
}

test('deployed snapshot host has no API service', async ({ request }) => {
  test.skip(!process.env.SNAPSHOT_E2E_URL, 'Requires the deployed Caddy boundary');
  const response = await request.get('/api/v1/health');
  expect(response.status()).toBe(404);
  expect(response.headers()['content-type']).not.toContain('text/html');
});
