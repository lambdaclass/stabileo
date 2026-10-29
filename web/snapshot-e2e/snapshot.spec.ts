import { test, expect, type Page } from '@playwright/test';

/**
 * A snapshot build (`/@<commit>/`, web/scripts/snapshot.ts) under `vite preview`: every page, asset,
 * worker and WASM the site loads comes from under the prefix, navigation stays under it, and the
 * version banner points at the latest page and at the compare view on GitHub.
 */
const P = process.env.SNAPSHOT_PREFIX!; // '/@abc1234/'
const SHORT = P.slice(2, -1);

/** Every same-origin request path, to check none leaves the snapshot (the backend's /api excepted). */
function watch(page: Page, baseURL: string | undefined) {
  const origin = new URL(baseURL!).origin;
  const outside: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin !== origin) return;
    // The backend and the snapshot index (/@/, which Cite this reads) are the only addresses outside.
    if (!u.pathname.startsWith(P) && !u.pathname.startsWith('/api/') && u.pathname !== '/@/') outside.push(u.pathname);
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
  expect(wasm).toEqual([`${P}research-wasm/shauer-2025/phasefield_bg.wasm`]);
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
