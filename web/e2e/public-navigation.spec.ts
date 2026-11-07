import { test, expect } from '@playwright/test';

for (const width of [390, 1440]) {
  for (const destination of ['research', 'tools']) {
    test(`@smoke public navigation to ${destination} stays visible and resets scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      // Disable speculative loads to exercise the cold-click path as well as a slow network.
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } });
      });
      await page.route('**/assets/*.js', async route => {
        if (/\/(?:load-page|ResearchPage|ToolsPage)-/.test(route.request().url())) {
          await new Promise(resolve => setTimeout(resolve, 750));
        }
        await route.continue();
      });
      await page.goto('/en/');
      const scroller = page.locator('#app .landing');
      await expect(scroller).toBeVisible();
      await scroller.evaluate(el => el.scrollTo({ top: 1000, behavior: 'instant' }));
      await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(100);
      if (width === 390) await page.locator('#app .nav-toggle').click();
      await page.evaluate(() => {
        const state = { samples: [] as number[], timer: 0 };
        const sample = () => state.samples.push((document.querySelector<HTMLElement>('#app .landing')?.innerText ?? '').trim().length);
        sample();
        state.timer = window.setInterval(sample, 50);
        (window as typeof window & { navSamples?: typeof state }).navSamples = state;
      });
      await page.locator(`#app .site-header [data-nav="${destination}"]`).click();
      await expect(page.locator(`#app .site-header[data-current="${destination}"]`)).toBeVisible();
      await expect(page.locator('#app .landing h1')).toBeVisible();
      await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBe(0);
      const samples = await page.evaluate(() => {
        const state = (window as typeof window & { navSamples?: { samples: number[]; timer: number } }).navSamples!;
        clearInterval(state.timer);
        return state.samples;
      });
      expect(samples.length).toBeGreaterThan(1);
      expect(samples.every(length => length > 0), `Empty public page in samples: ${samples}`).toBe(true);
      // Back uses the same deferred router and deliberately resets to top.
      await page.goBack();
      await expect(page.locator('#app .site-header .nav-brand').first()).toBeVisible();
      await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBe(0);
    });
  }
}

for (const width of [1440, 390]) {
  test(`@smoke public header stays mounted and identical through the public circuit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } });
    });
    await page.route('**/assets/*.js', async route => {
      if (/\/(?:load-page|ResearchPage|ToolsPage|ExamplesPage|BlogPage)-/.test(route.request().url())) {
        await new Promise(resolve => setTimeout(resolve, 750));
      }
      await route.continue();
    });
    await page.goto('/en/');
    await expect(page.locator('#app .landing h1')).toBeVisible();
    const header = page.locator('#app .site-header');
    await expect(header).toBeVisible();
    // Capture the original DOM node as well as its appearance: a replacement with
    // identical dimensions must fail, even if it happens between interval samples.
    await page.evaluate(() => {
      const original = document.querySelector<HTMLElement>('#app .site-header')!;
      const read = () => {
        const header = document.querySelector<HTMLElement>('#app .site-header');
        const first = header?.querySelector('a');
        const menuLink = header?.querySelector('[data-nav]');
        const menuStyle = menuLink && getComputedStyle(menuLink);
        const style = first && getComputedStyle(first);
        const rect = header?.getBoundingClientRect();
        return {
          present: !!header && header === original && original.isConnected &&
            document.querySelectorAll('#app .site-header').length === 1 &&
            getComputedStyle(header).visibility === 'visible' && rect!.top === 0 && rect!.width > 0,
          height: rect?.height,
          fontSize: style?.fontSize,
          fontFamily: style?.fontFamily,
          menuFontSize: menuStyle?.fontSize,
          menuFontFamily: menuStyle?.fontFamily,
          links: Array.from(header?.querySelectorAll('a') ?? [], a => ({
            href: a.getAttribute('href'),
            // The GitHub count is asynchronous; its accessible name is stable. The brand's name
            // depends on the page and is asserted per destination below.
            label: a.classList.contains('nav-brand') ? a.textContent?.trim() : a.getAttribute('aria-label') ?? a.textContent?.trim(),
          })),
        };
      };
      const baseline = read();
      const samples = [baseline];
      const timer = window.setInterval(() => samples.push(read()), 50);
      Object.assign(window, { headerProbe: { baseline, samples, timer, read } });
    });
    for (const destination of ['research', 'tools', 'examples', 'blog', '']) {
      if (width === 390 && destination) await header.locator('.nav-toggle').click();
      await header.locator(destination ? `[data-nav="${destination}"]` : '.nav-brand').click();
      await expect(header).toHaveAttribute('data-current', destination);
      await expect(page).toHaveURL(new RegExp(`/en/${destination ? destination + '/' : ''}$`));
      await expect(page.locator('#app .landing h1')).toBeVisible();
      if (destination) await expect(header.locator('.nav-brand')).not.toHaveAttribute('aria-label', /.*/);
      else await expect(header.locator('.nav-brand')).toHaveAttribute('aria-label', 'Back to top');
      if (width === 390) await expect(header.locator('.nav-toggle')).toHaveAttribute('aria-expanded', 'false');
      // Keep sampling after commit to catch late CSS loading / font changes.
      await page.waitForTimeout(300);
    }
    const probe = await page.evaluate(() => {
      const state = (window as any).headerProbe;
      clearInterval(state.timer);
      state.samples.push(state.read());
      return { baseline: state.baseline, samples: state.samples };
    });
    expect(probe.baseline.present).toBe(true);
    expect(probe.baseline.height).toBe(58);
    expect(probe.baseline.links).toHaveLength(13);
    expect(probe.samples.length).toBeGreaterThan(20);
    for (const sample of probe.samples) expect(sample).toEqual(probe.baseline);
  });
}

test('@smoke moving through history onto another language shows that language with its addresses, never English under them', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/en/tools/');
  await expect(page.locator('#app .landing h1')).toBeVisible();
  await page.route(/\/assets\/es-[^/]+\.js$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
  await page.evaluate(() => {
    const samples: Array<{ href: string | null; text: string }> = [];
    const read = () => {
      const link = document.querySelector('#app .site-header [data-nav="tools"]');
      samples.push({ href: link?.getAttribute('href') ?? null, text: link?.textContent?.trim() ?? '' });
    };
    (window as unknown as { langSamples: typeof samples; langTimer: number }).langSamples = samples;
    (window as unknown as { langTimer: number }).langTimer = window.setInterval(read, 25);
    history.pushState(null, '', '/es/tools/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('#app .site-header [data-nav="tools"]')).toHaveText('Herramientas', { timeout: 10_000 });
  const samples = await page.evaluate(() => {
    const w = window as unknown as { langSamples: Array<{ href: string | null; text: string }>; langTimer: number };
    clearInterval(w.langTimer);
    return w.langSamples;
  });
  expect(samples.length).toBeGreaterThan(20);
  for (const s of samples) if (s.href?.startsWith('/es/')) expect(s.text).toBe('Herramientas');
});

for (const rootSize of [16, 20, 24]) {
  test(`@smoke the public page starts exactly under the header with a ${rootSize}px root font size`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en/');
    await page.addStyleTag({ content: `html { font-size: ${rootSize}px !important; }` });
    const header = page.locator('#app .site-header');
    await expect(header).toBeVisible();
    const edges = await page.evaluate(() => ({
      header: document.querySelector('#app .site-header')!.getBoundingClientRect().bottom,
      inner: document.querySelector('#app .site-header .nav-inner')!.getBoundingClientRect().bottom,
      landing: document.querySelector('#app .landing')!.getBoundingClientRect().top,
    }));
    expect(edges.header).toBeCloseTo(rootSize * 3.625, 0);
    expect(edges.landing).toBeCloseTo(edges.header, 1);
    expect(edges.inner).toBeLessThanOrEqual(edges.header);
  });
}

for (const width of [390, 1440]) {
  test(`@smoke a header section link from another page opens the landing at that section at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/en/tools/');
    await expect(page.locator('#app .landing h1')).toBeVisible();
    const header = page.locator('#app .site-header');
    if (width === 390) await header.locator('.nav-toggle').click();
    await header.locator('[data-nav="pricing"]').click();
    await expect(page).toHaveURL(/\/en\/#pricing$/);
    const section = page.locator('#app .landing #pricing');
    await expect(section).toBeVisible();
    await expect.poll(() => section.evaluate((el) => Math.round(el.getBoundingClientRect().top - document.querySelector('#app .landing')!.getBoundingClientRect().top))).toBeLessThan(80);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
}

test('@smoke a direct load whose language fails to download still opens a working page, in English', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let aborted = 0;
  await page.route(/\/assets\/es-[^/]+\.js$/, (route) => { aborted++; return route.abort(); });
  await page.goto('/es/tools/');
  await expect(page.locator('#prerender')).toHaveCount(0);
  await expect(page.locator('#app .site-header')).toHaveAttribute('data-current', 'tools');
  await expect(page.locator('#app .tools-wrap')).toBeVisible();
  await expect(page.locator('#app .site-header [data-nav="tools"]')).toHaveText('Tools');
  expect(aborted).toBeGreaterThan(0);
});

test('@smoke a public page whose code fails to load is opened by a full load, never left under the old page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } });
  });
  await page.goto('/en/');
  await expect(page.locator('#app .landing h1')).toBeVisible();
  let aborted = 0;
  await page.route(/\/assets\/(?:load-page|ToolsPage)-[^/]*\.js$/, async (route) => {
    if (aborted++ === 0) return route.abort();
    await route.continue();
  });
  const reloaded = page.waitForEvent('load');
  await page.locator('#app .site-header [data-nav="tools"]').click();
  await reloaded;
  await expect(page).toHaveURL(/\/en\/tools\/$/);
  await expect(page.locator('#app .site-header')).toHaveAttribute('data-current', 'tools');
  await expect(page.locator('#app .tools-wrap')).toBeVisible();
  await expect(page.locator('#app [data-section="pricing"]')).toHaveCount(0);
  expect(aborted).toBeGreaterThan(0);
});

for (const [path, chunk, ready] of [
  ['/en/tools/', /\/assets\/(?:load-page|ToolsPage)-[^/]*\.js$/, '#app .tools-wrap'],
  ['/en/', /\/assets\/(?:load-page|LandingPage)-[^/]*\.js$/, '#app .landing h1'],
] as const) {
  test(`@smoke a first visit to ${path} whose page code fails to load says so, and its retry works`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    let blocked = true;
    await page.route(chunk, (route) => (blocked ? route.abort() : route.continue()));
    await page.goto(path);
    await expect(page.locator('#app [data-public-load-failed]')).toHaveText('This page could not be loaded. Check your connection and try again.');
    await expect(page.locator('#prerender')).toHaveCount(0);
    await expect(page.locator('#app [aria-busy="true"]')).toHaveCount(0);
    blocked = false;
    const reloaded = page.waitForEvent('load');
    await page.locator('#app button', { hasText: 'Try again' }).click();
    await reloaded;
    await expect(page.locator(ready)).toBeVisible();
    await expect(page.locator('#app [data-public-load-failed]')).toHaveCount(0);
  });
}

test('@smoke a first visit whose page code failed loads it by itself once the browser is back online', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let blocked = true;
  await page.route(/\/assets\/(?:load-page|ToolsPage)-[^/]*\.js$/, (route) => (blocked ? route.abort() : route.continue()));
  await page.goto('/en/tools/');
  await expect(page.locator('#app [data-public-load-failed]')).toBeVisible();
  blocked = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('#app .tools-wrap')).toBeVisible();
  await expect(page.locator('#app [data-public-load-failed]')).toHaveCount(0);
});
