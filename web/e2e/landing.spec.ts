import { test, expect, type Page } from '@playwright/test';

/**
 * Landing-page coverage.
 *
 * Why Playwright and not Vitest: the landing is a Svelte component tree whose
 * behaviour is DOM- and routing-shaped (an overlay on `/`, a custom
 * `stabileo-enter-app` event, a locale <select>, an embedded iframe). The repo
 * has no jsdom / happy-dom / testing-library dependency and this workstream may
 * not add one, so a real browser is the only way to assert any of it.
 *
 * Tagging: `@landing`, deliberately NOT `@smoke`. CI's blocking e2e job runs
 * `--grep @smoke` and its opt-in job runs `--grep @slow`, so nothing here
 * changes what CI does. Promoting the landing suite is a shared-workflow
 * decision that has not been taken.
 *
 * Run locally:
 *   npx playwright test --grep @landing
 */

/**
 * Sections `LandingPage.svelte` composes, in DOM order.
 *
 * The order encodes the narrative rule the content pass exists to enforce: the
 * visitor meets `basic` and its `demo` before `education`, `pro` or `thesis`,
 * so the product's present state lands before any future capability. A
 * reordering that puts a developing mode ahead of the working one should fail
 * here and be argued for deliberately.
 */
const SECTIONS = [
  'hero',
  'problem',
  'what',
  'basic',
  'demo',
  'capabilities',
  'validation',
  'codes',
  'education',
  'pro',
  'thesis',
  'status',
  'docs',
  'cta',
] as const;

async function bootLanding(page: Page, opts: { locale?: string; manual?: boolean } = {}) {
  const { locale = 'en', manual = true } = opts;
  await page.addInitScript(
    ({ locale, manual }) => {
      try {
        localStorage.clear();
        if (manual) {
          localStorage.setItem('stabileo-lang', locale);
          localStorage.setItem('stabileo-lang-manual', '1');
        }
      } catch {
        /* private mode */
      }
    },
    { locale, manual },
  );
  await page.goto('/');
  await expect(page.locator('.landing')).toBeVisible();
}

test.describe('@landing landing page', () => {
  test('renders the landing overlay at /', async ({ page }) => {
    await bootLanding(page);

    await expect(page.locator('.landing')).toBeVisible();
    // The application stays mounted behind the overlay rather than unmounting.
    await expect(page.locator('.app-container.hidden-behind-landing')).toHaveCount(1);

    const h1 = page.locator('.landing h1');
    await expect(h1).toHaveCount(1);
    await expect(h1).toBeVisible();
    await expect(h1).toHaveAttribute('id', 'hero-title');

    await expect(page).toHaveTitle(/Stabileo/);
  });

  test('composes the expected section inventory, in order', async ({ page }) => {
    await bootLanding(page);

    const order = await page
      .locator('.landing > section[data-section]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-section')));
    expect(order).toEqual([...SECTIONS]);

    await expect(page.locator('.landing nav.nav')).toHaveCount(1);
    await expect(page.locator('.landing footer.lp-footer')).toHaveCount(1);
  });

  test('retired sections are gone', async ({ page }) => {
    await bootLanding(page);

    // Changelog and the standalone pricing table were removed on purpose, and
    // the fabricated testimonials with them. If any of these come back it must
    // be a deliberate change to this test.
    await expect(page.locator('.landing .changelog-section')).toHaveCount(0);
    await expect(page.locator('.landing .pricing-section')).toHaveCount(0);
    await expect(page.locator('.landing .quote-card')).toHaveCount(0);
    // No price anywhere on the page.
    const body = (await page.locator('.landing').innerText()).replace(/\s+/g, ' ');
    expect(body).not.toMatch(/\$\s?\d/);
    expect(body).not.toMatch(/\bUSD\s?\d/);
  });

  test('every section is an accessibly-named landmark', async ({ page }) => {
    await bootLanding(page);

    const named = await page.locator('.landing > section').evaluateAll((els) =>
      els.map((el) => {
        const id = el.getAttribute('aria-labelledby');
        const target = id ? el.querySelector(`#${CSS.escape(id)}`) : null;
        return { cls: el.getAttribute('data-section') ?? el.className, id, text: target?.textContent?.trim() ?? null };
      }),
    );
    for (const s of named) {
      expect(s.id, `${s.cls} has aria-labelledby`).toBeTruthy();
      expect(s.text, `${s.cls} label resolves to a heading with text`).toBeTruthy();
    }
  });

  test('reveal animation does not leave content permanently hidden', async ({ page }) => {
    await bootLanding(page);

    const cta = page.locator('.landing [data-section="cta"]');
    await cta.scrollIntoViewIfNeeded();
    await expect(cta).toHaveClass(/visible/);
    await expect(cta).toBeVisible();
  });

  test('the primary CTA enters Basic mode', async ({ page }) => {
    await bootLanding(page);

    await page.locator('.landing .hero-ctas .btn-primary').click();

    // App.svelte rewrites the query with the active tab slug (`replaceAppUrl`).
    await expect(page).toHaveURL(/\/app\/basic(\?|$)/);
    await expect(page.locator('.landing')).toHaveCount(0);
    await expect(page.locator('.app-container')).toBeVisible();
    await expect(page.locator('.app-container.hidden-behind-landing')).toHaveCount(0);
  });

  test('the nav locale switcher changes the rendered copy', async ({ page }) => {
    await bootLanding(page, { locale: 'en' });

    const h1 = page.locator('.landing h1');
    await expect(h1).toHaveText('Structural analysis, in a browser tab.');

    await page.locator('.landing select.nav-lang').selectOption('es');

    await expect(h1).toHaveText('Análisis estructural, en una pestaña del navegador.');
    // A comma, not an em-dash: the decorative dashes were removed from the
    // Spanish copy because they made it read as machine output.
    await expect(page.locator('.landing #status-title')).toHaveText('Dónde está hoy cada capacidad.');

    expect(await page.evaluate(() => localStorage.getItem('stabileo-lang'))).toBe('es');
    expect(await page.evaluate(() => localStorage.getItem('stabileo-lang-manual'))).toBe('1');
  });

  test('the landing offers English and Spanish only', async ({ page }) => {
    await bootLanding(page);

    const values = await page
      .locator('.landing select.nav-lang option')
      .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value));
    expect(values).toEqual(['en', 'es']);
  });

  test('a Spanish browser gets the Spanish landing', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'es-AR' });
    const page = await ctx.newPage();
    await bootLanding(page, { manual: false });
    await expect(page.locator('.landing h1')).toHaveText('Análisis estructural, en una pestaña del navegador.');
    await ctx.close();
  });

  test('any other browser language gets the English landing', async ({ browser }) => {
    // French is a language the *application* speaks, so this asserts the
    // landing's allow-list rather than a missing dictionary.
    const ctx = await browser.newContext({ locale: 'fr-FR' });
    const page = await ctx.newPage();
    await bootLanding(page, { manual: false });
    await expect(page.locator('.landing h1')).toHaveText('Structural analysis, in a browser tab.');
    await expect(page.locator('.landing select.nav-lang')).toHaveValue('en');
    await ctx.close();
  });

  test('no Google Fonts request is made', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => {
      const host = new URL(r.url()).host;
      if (/fonts\.(googleapis|gstatic)\.com/.test(host)) external.push(r.url());
    });
    await bootLanding(page);
    await page.locator('.landing [data-section="cta"]').scrollIntoViewIfNeeded();
    expect(external, `landing must not contact Google Fonts:\n${external.join('\n')}`).toEqual([]);
  });

  test('self-hosted fonts are served from the same origin', async ({ page }) => {
    const fonts: string[] = [];
    page.on('response', (r) => {
      if (r.url().includes('/fonts/') && r.url().endsWith('.woff2')) fonts.push(r.url());
    });
    await bootLanding(page);
    await page.waitForTimeout(1200);
    expect(fonts.length).toBeGreaterThan(0);
    for (const f of fonts) expect(new URL(f).host).toBe(new URL(page.url()).host);
  });

  /**
   * The demo used to hand the wheel to the embedded application the moment the
   * pointer crossed it, so scrolling the page zoomed the model instead. These
   * pin the locked/active contract that replaced that behaviour.
   */
  /**
   * The Live Demo. Two defects drove this contract: an iframe under the
   * pointer swallowed the wheel and turned page scrolling into camera zoom,
   * and a second application instance was booted on every visit whether or not
   * anyone wanted it. Nothing here is cosmetic — each test pins one of those.
   */
  test.describe('live demo', () => {
    const scrollTop = (page: Page) => page.evaluate(() => document.querySelector('.landing')!.scrollTop);

    /**
     * Wait until the landing has actually stopped scrolling.
     *
     * `.landing` sets `scroll-behavior: smooth`, so `scrollIntoView()` animates
     * for well over a second on a long page. A fixed wait samples the middle of
     * that animation, and the travel still to come then shows up as whatever
     * happens next — which is how "activation moved the page by 115 px" was
     * reported when activation had not moved it at all. Growing the page above
     * the demo lengthened the animation and turned a latent race into a
     * failure.
     */
    async function scrollSettled(page: Page) {
      /*
       * The initial wait is not padding: a smooth scroll is queued for the next
       * frame, so sampling the instant `scrollIntoView` returns reads the
       * position it has not left yet. Two equal samples then say "settled"
       * while 646 px of animation is still to come, and that travel gets
       * attributed to whatever the test does next.
       *
       * Three consecutive equal samples, not one comparison, because the
       * animation can momentarily flatten near its ease-out.
       */
      await page.waitForTimeout(150);
      let stable = 0;
      let last = Number.NaN;
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const now = await scrollTop(page);
        stable = now === last ? stable + 1 : 0;
        if (stable >= 3) return;
        last = now;
        await page.waitForTimeout(100);
      }
      throw new Error('the landing never stopped scrolling');
    }

    async function reachDemo(page: Page) {
      await page.evaluate(() => document.querySelector('.landing [data-section="demo"]')!.scrollIntoView());
      await scrollSettled(page);
    }
    /** True only when the control row is really lit, i.e. the demo is active. */
    const isActive = (page: Page) =>
      page.locator('.landing .demo-controls').evaluate((el) => el.classList.contains('on'));

    /**
     * Activate and wait for the frame to actually finish loading, rather than
     * for a fixed number of milliseconds. The skeleton is rendered only while
     * `phase === 'loading'`, so its disappearance is the real ready signal —
     * fixed waits were tight enough to flake when the whole suite ran serially
     * and every test was booting a second application instance.
     */
    async function activate(page: Page) {
      await page.locator('.landing .demo-cta').click();
      await expect.poll(() => isActive(page)).toBe(true);
      await expect(page.locator('.landing .demo-skeleton')).toHaveCount(0, { timeout: 45000 });
    }
    /**
     * Wheel over the device, aiming at its VISIBLE centre.
     *
     * The device is taller than most viewports, so its geometric centre is
     * frequently off-screen — and a wheel event dispatched below the viewport
     * bottom lands on nothing, which reads as "the wheel was swallowed" when
     * nothing swallowed it.
     */
    /**
     * Put the device on screen and let the scroll settle.
     *
     * Callers capture the pre-wheel scroll position themselves, so this has to
     * run BEFORE that capture — hence a separate step rather than a guard
     * inside `wheelOverDemo`. `reachDemo` aligns the section, not the device,
     * and the device sits far enough down the section that it can be wholly
     * below the fold on a short viewport.
     */
    async function showDevice(page: Page) {
      await page.locator('.landing .demo-device').scrollIntoViewIfNeeded();
      await scrollSettled(page);
    }

    async function wheelOverDemo(page: Page, dy = 380) {
      const box = (await page.locator('.landing .demo-device').boundingBox())!;
      const vh = page.viewportSize()!.height;
      const top = Math.max(box.y, 0);
      const bottom = Math.min(box.y + box.height, vh);
      expect(bottom - top, 'enough of the device is on screen to wheel over').toBeGreaterThan(80);
      await page.mouse.move(box.x + box.width / 2, (top + bottom) / 2);
      await page.mouse.wheel(0, dy);
      await page.waitForTimeout(400);
    }
    /** Bring a control into view before clicking, so Playwright's own
     *  scroll-into-view cannot be mistaken for the component moving the page. */
    async function settle(page: Page, sel: string) {
      await page.locator(sel).scrollIntoViewIfNeeded();
      await scrollSettled(page);
    }

    test('no iframe exists before activation, at any width', async ({ browser }) => {
      for (const width of [390, 768, 1024, 1440]) {
        const ctx = await browser.newContext({ viewport: { width, height: 900 } });
        const page = await ctx.newPage();
        await bootLanding(page);
        await reachDemo(page);
        // Generous: any prewarm would have fired long before this.
        await page.waitForTimeout(4000);
        await expect(page.locator('.landing iframe.demo-iframe'), `iframe at ${width}px`).toHaveCount(0);
        await expect(page.locator('.landing .demo-cta')).toBeVisible();
        await ctx.close();
      }
    });

    test('wheeling and dragging over the poster scrolls the page and never activates', async ({ page }) => {
      await bootLanding(page);
      await reachDemo(page);

      await showDevice(page);

      const before = await scrollTop(page);
      await wheelOverDemo(page);
      expect(await scrollTop(page), 'the wheel belongs to the page').toBeGreaterThan(before);

      // A flick/drag across the poster, away from the CTA.
      const box = (await page.locator('.landing .demo-device').boundingBox())!;
      await page.mouse.move(box.x + 24, box.y + 24);
      await page.mouse.down();
      await page.mouse.move(box.x + 24, box.y + 140, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(400);

      expect(await isActive(page), 'a drag over the poster must not activate').toBe(false);
      await expect(page.locator('.landing iframe.demo-iframe')).toHaveCount(0);
    });

    test('only the CTA activates, and it mounts exactly one iframe', async ({ page }) => {
      await bootLanding(page);
      await reachDemo(page);
      await activate(page);
      await expect(page.locator('.landing iframe.demo-iframe')).toHaveCount(1);
      await expect(page.locator('.landing .demo-btn-exit')).toBeVisible();
    });

    for (const key of ['Enter', 'Space'] as const) {
      test(`${key} on the CTA activates it`, async ({ page }) => {
        await bootLanding(page);
        await reachDemo(page);
        await page.locator('.landing .demo-cta').focus();
        await page.keyboard.press(key);
        await expect.poll(() => isActive(page)).toBe(true);
        await expect(page.locator('.landing iframe.demo-iframe')).toHaveCount(1);
      });
    }

    test('the activating click is consumed by the CTA and never reaches the app', async ({ page }) => {
      await bootLanding(page);
      await reachDemo(page);
      await activate(page);

      // Count real user input the embedded document sees from now on.
      // `isTrusted` is the discriminator that matters: the landing's own
      // Results-panel mitigation calls btn.click() inside this document, and
      // that synthetic click is not what this test is about.
      await page.frameLocator('.landing iframe.demo-iframe').locator('body').evaluate(() => {
        (window as unknown as { __hits: number }).__hits = 0;
        for (const type of ['pointerdown', 'mousedown', 'click']) {
          document.addEventListener(type, (e) => {
            if (e.isTrusted) (window as unknown as { __hits: number }).__hits++;
          }, true);
        }
      });

      // Leave, then activate again: the re-activating click lands on the CTA,
      // which sits over the frame. If the overlay were not consuming it, the
      // counter below would move.
      await page.keyboard.press('Escape');
      await expect(page.locator('.landing .demo-cta')).toBeVisible();
      await page.locator('.landing .demo-cta').click();
      await expect.poll(() => isActive(page)).toBe(true);
      await page.waitForTimeout(500);

      const hits = await page.frameLocator('.landing iframe.demo-iframe').locator('body')
        .evaluate(() => (window as unknown as { __hits: number }).__hits);
      expect(hits, 'the activating click must not reach the application').toBe(0);
    });

    test('the frame is inert and untabbable while locked, interactive while active', async ({ page }) => {
      await bootLanding(page);
      await reachDemo(page);
      await activate(page);
      const frame = page.locator('.landing iframe.demo-iframe');
      await expect(frame).not.toHaveAttribute('inert', '');
      await expect(frame).toHaveAttribute('tabindex', '0');

      await page.keyboard.press('Escape');
      await expect(frame).toHaveAttribute('inert', '');
      await expect(frame).toHaveAttribute('tabindex', '-1');
      await expect(frame).toHaveAttribute('aria-hidden', 'true');
    });

    test('Escape exits, restores focus and returns the wheel to the page', async ({ page }) => {
      await bootLanding(page);
      await reachDemo(page);
      await activate(page);

      await page.keyboard.press('Escape');
      await expect(page.locator('.landing .demo-cta')).toBeVisible();
      expect(await page.evaluate(() => document.activeElement?.className ?? '')).toContain('demo-cta');

      await showDevice(page);

      const before = await scrollTop(page);
      await wheelOverDemo(page);
      expect(await scrollTop(page)).toBeGreaterThan(before);
    });

    test('exiting keeps the frame mounted but locked', async ({ page }) => {
      await bootLanding(page);
      await reachDemo(page);
      await activate(page);
      await page.locator('.landing .demo-btn-exit').click();
      // Deliberate: re-entry is instant and the locked frame cannot be reached.
      await expect(page.locator('.landing iframe.demo-iframe')).toHaveCount(1);
      await expect(page.locator('.landing iframe.demo-iframe')).toHaveAttribute('inert', '');
      await expect(page.locator('.landing .demo-cta')).toBeVisible();
    });

    test('Reset reloads the same example, shows loading and stays active', async ({ page }) => {
      await bootLanding(page);
      await reachDemo(page);
      await activate(page);
      const srcBefore = await page.locator('.landing iframe.demo-iframe').getAttribute('src');

      const sawLoading = page.evaluate(() => new Promise<boolean>((res) => {
        let saw = false;
        const iv = setInterval(() => { if (document.querySelector('.landing .demo-skeleton')) saw = true; }, 30);
        setTimeout(() => { clearInterval(iv); res(saw); }, 2500);
      }));
      await page.locator('.landing .demo-btn', { hasText: /Reset|Reiniciar/ }).click({ noWaitAfter: true });
      expect(await sawLoading, 'the loading state must be shown during reset').toBe(true);

      expect(await isActive(page), 'reset must not drop interactive mode').toBe(true);
      await expect(page.locator('.landing iframe.demo-iframe')).toHaveAttribute('src', srcBefore!);
    });

    test('switching example while active stays active and loads the new example', async ({ page }) => {
      await bootLanding(page);
      await reachDemo(page);
      await activate(page);

      await page.locator('.landing [role="tab"]').nth(2).click();
      expect(await isActive(page), 'switching must not drop interactive mode').toBe(true);
      await expect(page.locator('.landing iframe.demo-iframe'))
        .toHaveAttribute('src', '/app/basic?embed&example=truss');
      await expect(page.locator('.landing .demo-btn-exit')).toBeVisible();
      await expect(page.locator('.landing .demo-btn', { hasText: /Reset|Reiniciar/ })).toBeVisible();
    });

    test('switching example while locked does not mount anything', async ({ page }) => {
      await bootLanding(page);
      await reachDemo(page);
      await page.locator('.landing [role="tab"]').nth(1).click();
      await expect(page.locator('.landing [role="tab"]').nth(1)).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('.landing iframe.demo-iframe')).toHaveCount(0);
      // …and the continuation link follows the new selection.
      await expect(page.locator('.landing .demo-bar a.link-arrow'))
        .toHaveAttribute('href', '/app/basic?example=portal-frame');
    });

    test('every state transition preserves the landing scroll position', async ({ page }) => {
      await bootLanding(page);
      await reachDemo(page);

      await settle(page, '.landing .demo-cta');
      const a0 = await scrollTop(page);
      await activate(page);
      expect(Math.abs((await scrollTop(page)) - a0), 'activation').toBeLessThanOrEqual(2);

      await settle(page, '.landing .demo-controls');
      const a1 = await scrollTop(page);
      await page.locator('.landing .demo-btn', { hasText: /Reset|Reiniciar/ }).click({ noWaitAfter: true });
      await page.waitForTimeout(1200);
      expect(Math.abs((await scrollTop(page)) - a1), 'reset').toBeLessThanOrEqual(2);

      await settle(page, '.landing .demo-bar');
      const a2 = await scrollTop(page);
      await page.locator('.landing [role="tab"]').nth(3).click({ noWaitAfter: true });
      await page.waitForTimeout(1200);
      expect(Math.abs((await scrollTop(page)) - a2), 'example switch').toBeLessThanOrEqual(2);

      const a3 = await scrollTop(page);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      expect(Math.abs((await scrollTop(page)) - a3), 'exit').toBeLessThanOrEqual(2);
    });

    test('a frame that never loads fails over to a retry, which mounts a fresh one', async ({ page }) => {
      // Black-hole the embed so the load event can never fire.
      await page.route('**/app/basic?embed*', () => { /* never resolved */ });
      await bootLanding(page);
      await reachDemo(page);
      await page.locator('.landing .demo-cta').click();

      const failure = page.locator('.landing .demo-fallback');
      await expect(failure, 'failure state after the 8s timeout').toBeVisible({ timeout: 12000 });
      await expect(failure).toContainText(/could not load|no pudo cargarse/i);
      // Nothing invisible is left intercepting input.
      await expect(page.locator('.landing iframe.demo-iframe')).toHaveCount(0);

      await page.unroute('**/app/basic?embed*');
      /*
       * Bring the retry button into view BEFORE the baseline is taken. The
       * fallback replaces the device, which moves the control, and Playwright
       * scrolls a control into view as part of clicking it — so a baseline
       * captured first turns that scroll into a 388 px "the retry moved the
       * page" failure. It only showed up in a full run, where the preceding
       * tests leave the page at a different offset.
       */
      await settle(page, '.landing .demo-fallback button');
      const before = await scrollTop(page);
      await page.locator('.landing .demo-fallback button').click({ noWaitAfter: true });
      await expect(page.locator('.landing iframe.demo-iframe')).toHaveCount(1);
      await expect(page.locator('.landing .demo-fallback')).toHaveCount(0);
      expect(Math.abs((await scrollTop(page)) - before), 'retry keeps the scroll').toBeLessThanOrEqual(4);
      // The selected example survived the round trip.
      await expect(page.locator('.landing iframe.demo-iframe'))
        .toHaveAttribute('src', '/app/basic?embed&example=cantilever');
    });

    test('the Results panel cleanup runs after every fresh load and never throws', async ({ page }) => {
      /**
       * Asserts the OUTCOME, not an instant. The embedded app opens the panel
       * roughly 1.3 s after the frame loads and the mitigation's retry closes
       * it by ~2.1 s, so sampling at load time is a race — it caught this test
       * out when PR16-PR18 shifted the app's render timing.
       *
       * The `.mrp-reopen` assertion is the one that matters for the debt: it
       * proves the panel was really opened and really closed, so the day the
       * app's markup changes and the mitigation starts silently no-opping, this
       * fails instead of passing vacuously.
       */
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      const app = page.frameLocator('.landing iframe.demo-iframe');

      await bootLanding(page);
      await reachDemo(page);
      await activate(page);
      await expect
        .poll(() => app.locator('.mrp-panel').count(), { timeout: 15000, message: 'panel closed after activation' })
        .toBe(0);
      await expect(app.locator('.mrp-reopen'), 'the panel was opened and then closed by the mitigation')
        .toHaveCount(1);

      await page.locator('.landing [role="tab"]').nth(1).click();
      await expect
        .poll(() => app.locator('.mrp-panel').count(), { timeout: 15000, message: 'panel closed after an example change' })
        .toBe(0);
      await expect(app.locator('.mrp-reopen')).toHaveCount(1);

      expect(errors, `the cleanup must be failure-safe:\n${errors.join('\n')}`).toEqual([]);
    });

    test('the demo does not trap keyboard focus', async ({ page }) => {
      await bootLanding(page);
      await reachDemo(page);
      await page.locator('.landing .demo-cta').focus();
      for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
      const inDevice = await page.evaluate(() => !!document.activeElement?.closest('.demo-device'));
      expect(inDevice).toBe(false);
    });

    test('the embed uses the application mobile layout at every width', async ({ browser }) => {
      // The app switches at window.innerWidth < 768 (ui.svelte.ts). The device
      // is capped below that: real mobile UI, no user-agent spoofing, no new
      // query parameter. Checked at every QA width, including the two phone
      // sizes where the frame only mounts after an explicit tap.
      for (const [width, height] of [[360, 780], [390, 844], [768, 1024], [1024, 768], [1440, 900]]) {
        const ctx = await browser.newContext({ viewport: { width, height } });
        const page = await ctx.newPage();
        await bootLanding(page);
        await reachDemo(page);
        await activate(page);
        const inner = await page
          .frameLocator('.landing iframe.demo-iframe')
          .locator('body')
          .evaluate(() => window.innerWidth);
        expect(inner, `embed viewport at ${width}px`).toBeLessThan(768);
        // …and the desktop chrome that goes with the wider layout never appears.
        await expect(
          page.frameLocator('.landing iframe.demo-iframe').locator('.sidebar-toggle-btn'),
          `desktop sidebar toggles at ${width}px`,
        ).toHaveCount(0);
        await ctx.close();
      }
    });

    /**
     * The embed is capped below 768 px, so on a wide page it is necessarily
     * narrower than the column. It used to sit inside a second bordered box
     * that stretched the full width — 238 px of empty frame each side at 1440,
     * the device only 60 % of it. These pin the composition that replaced it.
     */
    test('the demo stage has no empty framed gutter around the device', async ({ browser }) => {
      for (const width of [768, 1024, 1440]) {
        const ctx = await browser.newContext({ viewport: { width, height: 900 } });
        const page = await ctx.newPage();
        await bootLanding(page);
        await reachDemo(page);
        await activate(page);

        const m = await page.evaluate(() => {
          const stage = document.querySelector('.landing .demo-stage') as HTMLElement;
          const dev = document.querySelector('.landing .demo-device') as HTMLElement;
          const cs = getComputedStyle(stage);
          const used = [...stage.children].reduce((a, c) => a + c.getBoundingClientRect().width, 0);
          const cols = cs.gridTemplateColumns.split(' ').filter(Boolean).length;
          const gap = parseFloat(cs.columnGap) || 0;
          return {
            stageW: stage.getBoundingClientRect().width,
            devW: dev.getBoundingClientRect().width,
            unused: stage.getBoundingClientRect().width - used - (cols > 1 ? gap : 0),
            borderW: parseFloat(cs.borderTopWidth) || 0,
            padding: parseFloat(cs.paddingLeft) || 0,
          };
        });

        // The stage is layout only: one frame in this section, not two.
        expect(m.borderW, `stage border at ${width}px`).toBe(0);
        expect(m.padding, `stage padding at ${width}px`).toBe(0);
        // Nothing of consequence left over horizontally.
        expect(m.unused, `unused stage width at ${width}px`).toBeLessThanOrEqual(4);
      }
    });

    test('the activation overlay lines up with the frame it covers', async ({ browser }) => {
      for (const width of [390, 1024, 1440]) {
        const ctx = await browser.newContext({ viewport: { width, height: 900 } });
        const page = await ctx.newPage();
        await bootLanding(page);
        await reachDemo(page);
        const d = await page.evaluate(() => {
          const dev = document.querySelector('.landing .demo-device')!.getBoundingClientRect();
          const lock = document.querySelector('.landing .demo-lock')!.getBoundingClientRect();
          return { dx: lock.x - dev.x, dy: lock.y - dev.y, dw: lock.width - dev.width, dh: lock.height - dev.height };
        });
        // Inside the device's 1 px border on every edge, nothing more.
        for (const [k, v] of Object.entries(d)) {
          expect(Math.abs(v), `overlay ${k} at ${width}px`).toBeLessThanOrEqual(2);
        }
        await ctx.close();
      }
    });

    test('the embed is rendered at native size, never transform-scaled', async ({ page }) => {
      // Scaling a sub-768 viewport up would blur the canvas and shift pointer
      // coordinates inside the transformed hit area. If a transform ever
      // appears here, the interaction guarantees below stop holding.
      await bootLanding(page);
      await reachDemo(page);
      await activate(page);
      const transforms = await page.evaluate(() => {
        const out: string[] = [];
        let el: HTMLElement | null = document.querySelector('.landing iframe.demo-iframe');
        while (el && !el.classList.contains('demo')) {
          out.push(getComputedStyle(el).transform);
          el = el.parentElement;
        }
        return out;
      });
      for (const t of transforms) expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(t);

      // Pointer coordinates land where they look: the app sees the click at
      // the same place the host page aimed it.
      const box = (await page.locator('.landing .demo-device').boundingBox())!;
      await page.frameLocator('.landing iframe.demo-iframe').locator('body').evaluate(() => {
        (window as unknown as { __pt: { x: number; y: number } | null }).__pt = null;
        document.addEventListener('pointerdown', (e) => {
          (window as unknown as { __pt: { x: number; y: number } }).__pt = { x: e.clientX, y: e.clientY };
        }, true);
      });
      /*
       * Aim at the device's VISIBLE centre, clamped to the viewport.
       * `box.y + height * 0.6` used to be on screen; adding the Basic-mode
       * scope line above the stage pushed the device down far enough that the
       * point fell below the viewport bottom, where `elementFromPoint` returns
       * null and the click reaches nothing. That failed as "the app must
       * receive the click", which reads like a broken embed rather than a
       * probe aimed off-screen.
       */
      const vh = page.viewportSize()!.height;
      const visTop = Math.max(box.y, 0);
      const visBottom = Math.min(box.y + box.height, vh);
      expect(visBottom - visTop, 'enough of the device is on screen to click').toBeGreaterThan(80);
      const aimX = Math.round(box.x + box.width * 0.5);
      const aimY = Math.round(visTop + (visBottom - visTop) * 0.5);
      await page.mouse.click(aimX, aimY);
      await page.waitForTimeout(300);
      const seen = await page.frameLocator('.landing iframe.demo-iframe').locator('body')
        .evaluate(() => (window as unknown as { __pt: { x: number; y: number } | null }).__pt);
      expect(seen, 'the app must receive the click').not.toBeNull();
      expect(Math.abs(seen!.x - (aimX - box.x)), 'pointer x offset').toBeLessThanOrEqual(3);
      expect(Math.abs(seen!.y - (aimY - box.y)), 'pointer y offset').toBeLessThanOrEqual(3);
    });

    test('no horizontal overflow at any QA width, locked or active', async ({ browser }) => {
      for (const [width, height] of [[360, 780], [390, 844], [768, 1024], [1024, 768], [1440, 900]]) {
        const ctx = await browser.newContext({ viewport: { width, height } });
        const page = await ctx.newPage();
        await bootLanding(page);
        await reachDemo(page);
        const over = () => page.evaluate(() => {
          const l = document.querySelector('.landing') as HTMLElement;
          return Math.max(0, l.scrollWidth - window.innerWidth);
        });
        expect(await over(), `locked at ${width}px`).toBeLessThanOrEqual(1);
        await activate(page);
        expect(await over(), `active at ${width}px`).toBeLessThanOrEqual(1);
        await ctx.close();
      }
    });

    test('the example tablist stays complete and keyboard-operable', async ({ page }) => {
      await bootLanding(page);
      await reachDemo(page);
      const tabs = page.locator('.landing [role="tab"]');
      await expect(tabs).toHaveCount(4);
      await expect(page.locator('.landing #demo-panel')).toHaveAttribute('role', 'tabpanel');
      const tabIndexes = await tabs.evaluateAll((els) => els.map((e) => e.getAttribute('tabindex')));
      expect(tabIndexes.filter((t) => t === '0')).toHaveLength(1);

      await tabs.first().focus();
      await page.keyboard.press('ArrowRight');
      await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('End');
      await expect(tabs.nth(3)).toHaveAttribute('aria-selected', 'true');
    });

    test('continue-in-editor still tracks the selection', async ({ page }) => {
      await bootLanding(page);
      await reachDemo(page);
      const cont = page.locator('.landing .demo-bar a.link-arrow');
      await expect(cont).toHaveAttribute('href', '/app/basic?example=cantilever');
      await page.locator('.landing [role="tab"]').nth(2).click();
      await expect(cont).toHaveAttribute('href', '/app/basic?example=truss');
    });

    /**
     * The guided alternative. /demo is an existing route that redirects into
     * Basic mode and starts the 14-step tour; the landing only links to it.
     */
    test('the guided-tour CTA reads correctly in both languages', async ({ page }) => {
      await bootLanding(page);
      await reachDemo(page);
      const cta = page.locator('.landing .demo-tour-btn');
      await expect(cta).toHaveText('Learn the basics');
      await expect(page.locator('.landing .demo-tour-copy')).toHaveText('Take a guided tour of Basic mode.');

      await page.locator('.landing select.nav-lang').selectOption('es');
      await expect(cta).toHaveText('Aprendé lo básico');
      await expect(page.locator('.landing .demo-tour-copy'))
        .toHaveText('Hacé un recorrido guiado por el modo Básico.');
    });

    test('the guided-tour CTA is a same-tab anchor to /demo', async ({ page }) => {
      await bootLanding(page);
      await reachDemo(page);
      const cta = page.locator('.landing .demo-tour-btn');
      await expect(cta).toHaveAttribute('href', '/demo');
      // No target: a guided tour that steals a tab is a worse guided tour.
      expect(await cta.getAttribute('target')).toBeNull();
      expect(await cta.evaluate((el) => el.tagName)).toBe('A');
    });

    test('the guided-tour CTA launches Basic mode with the tour running', async ({ page }) => {
      await bootLanding(page);
      await reachDemo(page);
      const pagesBefore = page.context().pages().length;

      await page.locator('.landing .demo-tour-btn').click();

      await expect(page).toHaveURL(/\/app\/basic/);
      await expect(page.locator('.tour-card')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('.tour-counter')).toHaveText('1 / 14');
      await expect(page.locator('.landing')).toHaveCount(0);
      expect(page.context().pages().length, 'must not open a new tab').toBe(pagesBefore);
    });

    test('the guided-tour CTA does not mount the live demo first', async ({ page }) => {
      await bootLanding(page);
      await reachDemo(page);
      await expect(page.locator('.landing iframe.demo-iframe')).toHaveCount(0);
      await page.locator('.landing .demo-tour-btn').hover();
      await page.waitForTimeout(500);
      // Hovering or reaching the CTA must not boot a second application.
      await expect(page.locator('.landing iframe.demo-iframe')).toHaveCount(0);
      expect(await isActive(page)).toBe(false);
    });

    test('the CTA hierarchy sits beside the demo on wide screens and below it on mobile', async ({ browser }) => {
      for (const [width, height, expected] of [[390, 844, 'below'], [768, 1024, 'below'], [1440, 900, 'beside']] as const) {
        const ctx = await browser.newContext({ viewport: { width, height } });
        const page = await ctx.newPage();
        await bootLanding(page);
        await reachDemo(page);
        const g = await page.evaluate(() => {
          const dev = document.querySelector('.landing .demo-device')!.getBoundingClientRect();
          const btn = document.querySelector('.landing .demo-tour-btn')!.getBoundingClientRect();
          const link = document.querySelector('.landing .demo-bar a.link-arrow')!.getBoundingClientRect();
          const l = document.querySelector('.landing') as HTMLElement;
          return {
            beside: btn.left >= dev.right - 2,
            below: btn.top >= dev.bottom - 2,
            height: btn.height,
            groupedWithEditorLink: Math.abs(btn.top - link.bottom) < 160,
            overflow: Math.max(0, l.scrollWidth - window.innerWidth),
          };
        });
        expect(g[expected], `tour CTA ${expected} the demo at ${width}px`).toBe(true);
        // Comfortable touch target, everywhere.
        expect(g.height, `touch target at ${width}px`).toBeGreaterThanOrEqual(44);
        expect(g.overflow, `overflow at ${width}px`).toBeLessThanOrEqual(1);
        if (expected === 'below') {
          expect(g.groupedWithEditorLink, 'grouped with the editor link on mobile').toBe(true);
        }
        await ctx.close();
      }
    });

    test('the three demo actions keep their distinct weights and all still work', async ({ page }) => {
      await bootLanding(page);
      await reachDemo(page);

      // Exactly one filled/primary button in the section: the activation CTA.
      const primaries = await page.locator('.landing [data-section="demo"] .demo-cta, .landing [data-section="demo"] .btn-primary').count();
      expect(primaries, 'one primary action only').toBe(1);
      // The tour is the secondary (outlined) one, the editor link is quiet.
      await expect(page.locator('.landing .demo-tour-btn')).toHaveClass(/btn-ghost/);
      await expect(page.locator('.landing .demo-bar a.link-arrow')).toBeVisible();

      // Activation still works and the editor link still tracks the selection.
      await activate(page);
      await expect(page.locator('.landing iframe.demo-iframe')).toHaveCount(1);
      await page.locator('.landing [role="tab"]').nth(2).click();
      await expect(page.locator('.landing .demo-bar a.link-arrow'))
        .toHaveAttribute('href', '/app/basic?example=truss');
      expect(await isActive(page)).toBe(true);
    });

    test('the Spanish demo copy is complete', async ({ page }) => {
      await bootLanding(page, { locale: 'es' });
      await reachDemo(page);
      await expect(page.locator('.landing .demo-cta')).toHaveText('Iniciar la demo interactiva');
      await expect(page.locator('.landing .demo-lock-hint')).toHaveText(/Carga el editor dentro de esta página/i);
      await activate(page);
      await expect(page.locator('.landing .demo-btn', { hasText: 'Reiniciar' })).toBeVisible();
      await expect(page.locator('.landing .demo-btn-exit')).toContainText('Salir');
      await expect(page.locator('.landing .demo-status')).toHaveText(/la demo recibe la rueda/i);
      await page.keyboard.press('Escape');
      await expect(page.locator('.landing .demo-cta')).toHaveText('Tocá para interactuar');
    });
  });

  test('the status section labels every capability and names no price', async ({ page }) => {
    await bootLanding(page);
    const status = page.locator('.landing [data-section="status"]');
    await status.scrollIntoViewIfNeeded();

    await expect(status.locator('.badge-today')).toHaveCount(1);
    await expect(status.locator('.badge-partial')).toHaveCount(1);
    await expect(status.locator('.badge-roadmap')).toHaveCount(1);

    // Hosted services appear only under the roadmap badge.
    const roadmap = status.locator('.status-group', { has: page.locator('.badge-roadmap') });
    await expect(roadmap).toContainText('Remote solving');
    await expect(roadmap).toContainText('Stabileo AI credits');
    await expect(roadmap).toContainText('Cloud workspace');

    const today = status.locator('.status-group', { has: page.locator('.badge-today') });
    await expect(today).not.toContainText('Remote solving');
    await expect(today).not.toContainText('Cloud workspace');

    await expect(status.locator('.access')).toContainText('AGPL-3.0');
  });

  test('the evidence counters settle on their real values', async ({ browser }) => {
    // Regression: these counted up from an IntersectionObserver left on the
    // default root. `.landing` is a fixed-position scroll container, so that
    // observer never fired and every figure rendered a permanent 0. Checked at
    // a short viewport too, where the section cannot reach a high ratio.
    for (const [width, height] of [[1440, 900], [1440, 700], [390, 844]]) {
      const ctx = await browser.newContext({ viewport: { width, height } });
      const page = await ctx.newPage();
      await bootLanding(page);
      await page.locator('.landing [data-section="validation"]').scrollIntoViewIfNeeded();
      const nums = page.locator('.landing .stat-num');
      await expect(nums.nth(0), `tests counter at ${width}x${height}`).toHaveText('5,655', { timeout: 8000 });
      await expect(nums.nth(1), `examples counter at ${width}x${height}`).toHaveText('55', { timeout: 8000 });
      await ctx.close();
    }
  });

  test('the hero truss animates, and it is the only truss figure on the page', async ({ page }) => {
    await bootLanding(page);

    // Hero: one figure, one moving load.
    const hero = page.locator('.landing .hero-figure .truss-fig');
    await expect(hero).toHaveCount(1);
    const loadX = () =>
      page.locator('.landing .hero-figure .tf-load').evaluate((g) => g.getAttribute('transform'));
    /*
     * Poll for movement rather than sampling once after a fixed delay.
     *
     * The sweep is driven by requestAnimationFrame, so a fixed 1200 ms window
     * asserts a frame rate, not a behaviour: with several workers competing for
     * CPU and video capture running, rAF can miss the whole window and the
     * transform is byte-identical — a green animation reported as broken. The
     * claim under test is "it moves at all", so wait for exactly that.
     */
    const first = await loadX();
    await expect
      .poll(async () => (await loadX()) !== first, {
        message: 'the hero load must actually move',
        timeout: 15000,
      })
      .toBe(true);

    /*
     * The real-time section carried three still comparison frames of the same
     * truss. That section was removed — live re-solving is now a Basic feature
     * bullet — and the frames went with it, so the hero animation is the only
     * truss on the page and the only place the moving load is drawn.
     */
    await expect(page.locator('.landing .truss-fig')).toHaveCount(1);
    await expect(page.locator('.landing .rt-states')).toHaveCount(0);
    await expect(page.locator('.landing [data-section="realtime"]')).toHaveCount(0);
  });

  test('the moving load is the arrow alone — no caption in either language', async ({ browser }) => {
    // The arrow used to carry a "UNIT MOVING LOAD" caption. It was removed; the
    // meaning now lives only in the SVG <desc>, which is not rendered text.
    for (const [locale, phrase] of [['en', 'unit moving load'], ['es', 'carga móvil unitaria']] as const) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      await bootLanding(page, { locale });

      await page.locator('.landing .hero-figure').scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);

      const visible = (await page.locator('.landing').innerText()).toLowerCase();
      expect(visible, `"${phrase}" must not be visible in ${locale}`).not.toContain(phrase);

      // Nothing took its place next to the arrow, in either variant.
      await expect(page.locator('.landing .tf-load text')).toHaveCount(0);
      await expect(page.locator('.landing .tf-load-label')).toHaveCount(0);

      // …but a screen reader still learns what the arrow means.
      // textContent, not innerText: <desc> is an SVGElement and is never rendered.
      const desc = (await page.locator('.landing .hero-figure svg desc').textContent()) ?? '';
      expect(desc.toLowerCase()).toMatch(locale === 'en' ? /unit load/ : /carga unitaria/);
      expect(desc.toLowerCase()).toMatch(locale === 'en' ? /downward/ : /descendente/);

      // The legend and the comparison captions are untouched.
      const legend = await page.locator('.landing .hero-figure .tf-legend').innerText();
      expect(legend).toContain('+');
      expect(legend).toContain('\u2212');
      await ctx.close();
    }
  });

  test('the hero animation pauses on hover', async ({ page }) => {
    await bootLanding(page);
    const svg = page.locator('.landing .hero-figure svg');
    await svg.hover();
    await page.waitForTimeout(400);
    const a = await page.locator('.landing .hero-figure .tf-load').getAttribute('transform');
    await page.waitForTimeout(1200);
    const b = await page.locator('.landing .hero-figure .tf-load').getAttribute('transform');
    expect(b, 'hovering must freeze the sweep').toBe(a);
  });

  test('reduced motion gets a static, representative state', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await bootLanding(page);
    const load = page.locator('.landing .hero-figure .tf-load');
    const a = await load.getAttribute('transform');
    await page.waitForTimeout(1500);
    expect(await load.getAttribute('transform'), 'no sweep under reduced motion').toBe(a);
    // and it is a loaded state, not the blank over-a-support one
    const coloured = await page.locator('.landing .hero-figure .tf-members line').evaluateAll((ls) =>
      ls.filter((l) => (l.getAttribute('stroke') ?? '').includes('tension') || (l.getAttribute('stroke') ?? '').includes('compression')).length);
    expect(coloured, 'the static state must show real forces').toBeGreaterThan(8);
    await ctx.close();
  });

  test('the truss figure is an accessibly named image with a description', async ({ page }) => {
    await bootLanding(page);
    const svg = page.locator('.landing .hero-figure svg');
    await expect(svg).toHaveAttribute('role', 'img');
    const labelled = await svg.getAttribute('aria-labelledby');
    expect(labelled).toBeTruthy();
    for (const id of labelled!.split(/\s+/)) {
      await expect(page.locator(`.landing #${id}`)).not.toBeEmpty();
    }
    // The legend must not depend on colour alone.
    const legend = await page.locator('.landing .hero-figure .tf-legend').innerText();
    expect(legend).toContain('+');
    expect(legend).toContain('\u2212');
    expect(legend.toLowerCase()).toContain('zero');
  });

  test('the published test count carries its provenance', async ({ page }) => {
    await bootLanding(page);
    const validation = page.locator('.landing [data-section="validation"]');
    await validation.scrollIntoViewIfNeeded();
    await expect(validation).toContainText('6c3369d6');
    await expect(validation).toContainText('2026-08-01');
    // The stale figure must not reappear.
    await expect(validation).not.toContainText('1117');
  });

  /**
   * The product narrative.
   *
   * These tests guard claims rather than layout. Each one exists because the
   * page previously said something the repository does not support, or said it
   * in an order that let a visitor mistake a developing layer for a shipped
   * one. They should fail when the copy over-claims again, which is the only
   * failure mode that matters here.
   */
  test.describe('product narrative', () => {
    const sectionText = (page: Page, section: string) =>
      page.locator(`.landing [data-section="${section}"]`).innerText();

    test('the hero positions the platform and its three modes, not live re-solving', async ({ page }) => {
      await bootLanding(page);

      // The lead is also the meta description, so it carries the positioning.
      const lead = await page.locator('.landing .hero-copy .lead').innerText();
      expect(lead).toMatch(/free and open/i);
      expect(lead).toMatch(/Basic/);
      expect(lead).toMatch(/Education/);
      expect(lead).toMatch(/PRO/);

      // The old positioning claimed the solver re-runs on every edit as the
      // headline. That belongs to the realtime section now, not the hero.
      expect(lead).not.toMatch(/on every edit/i);

      const modes = page.locator('.landing .hero-modes li');
      await expect(modes).toHaveCount(3);
      const names = await page.locator('.landing .hero-mode-name').allInnerTexts();
      expect(names).toEqual(['Basic', 'Education', 'PRO']);

      // Each mode carries its own status, so the hero cannot read as three-ready.
      const states = await page.locator('.landing .hero-mode-st').allInnerTexts();
      expect(states[0]).toMatch(/available today/i);
      expect(states[1]).toMatch(/in development/i);
      expect(states[2]).toMatch(/in development/i);
    });

    /**
     * The mode overview reads as a growing platform, not as a list of things
     * that do not work yet.
     *
     * Status accuracy is unchanged — the badges still say what ships and what
     * does not — so this test guards the framing and the retired sentences
     * together: a future rewrite that reintroduces "cannot", "does not exist"
     * or "not available" for a developing layer should fail here.
     */
    test('the modes and agent layer are introduced as a growing platform', async ({ page }) => {
      await bootLanding(page);
      const what = page.locator('.landing [data-section="what"]');
      await what.scrollIntoViewIfNeeded();

      const lead = await what.locator('.modes-lead').innerText();
      expect(lead).toMatch(/same solver/i);
      expect(lead).toMatch(/Basic is the structural-analysis mode you can use today/i);
      expect(lead).toMatch(/Education, PRO and Stabileo AI extend it/i);

      // Each row still carries its own status badge, so nothing is promoted.
      const rows = what.locator('.mode-row');
      await expect(rows).toHaveCount(4);
      await expect(what.locator('.mode-row .badge-today')).toHaveCount(1);
      await expect(what.locator('.mode-row .badge-dev')).toHaveCount(3);

      const modes = await what.locator('.mode-list').innerText();
      expect(modes).toMatch(/Predefined exercises run today/i);
      expect(modes).toMatch(/teacher-created assignments and correction are in development/i);
      expect(modes).toMatch(/CIRSOC reinforced concrete has basic support today/i);
      expect(modes).toMatch(/steel design in development/i);

      // The retired defensive constructions, page-wide.
      const body = (await page.locator('.landing').innerText()).replace(/\s+/g, ' ');
      for (const gone of [
        /\bit is not a finished product\b/i,
        /\bdo not exist\b/i,
        /\bnot available to try\b/i,
        /\bchecking only\b/i,
        /\bthis page carries no analytics\b/i,
        /\bnone of them proposes a design\b/i,
        /\bis deliberately narrow\b/i,
      ]) {
        expect(body, `retired phrase ${gone}`).not.toMatch(gone);
      }

      // And no timeline was invented in the process.
      expect(body).not.toMatch(/\b(soon|next month|next quarter|by \d{4}|coming in \d{4})\b/i);
    });

    test('Basic mode has its own section, with the four screenshots and their descriptions', async ({ page }) => {
      await bootLanding(page);

      const basic = page.locator('.landing [data-section="basic"]');
      await basic.scrollIntoViewIfNeeded();

      await expect(basic.locator('.badge-today')).toHaveCount(1);

      // The four images moved here from the solver-capabilities section, where
      // they were read as evidence for capabilities Basic cannot reach.
      const cards = basic.locator('.card-media');
      await expect(cards).toHaveCount(4);
      for (const stem of ['2d-moments', '3d-industrial', '2d-section-analysis', '3d-section-analysis']) {
        await expect(basic.locator(`img[src*="${stem}"]`)).toHaveCount(1);
      }
      // Each image keeps a real description, not a bare caption.
      for (let i = 0; i < 4; i++) {
        const card = cards.nth(i);
        await expect(card.locator('h3')).not.toBeEmpty();
        expect((await card.locator('.card-body p').innerText()).length).toBeGreaterThan(40);
        await expect(card.locator('img')).toHaveAttribute('alt', /.{20,}/);
      }
      // And they are gone from where they used to be.
      await expect(page.locator('.landing [data-section="capabilities"] .card-media')).toHaveCount(0);

      const text = await sectionText(page, 'basic');
      expect(text).toMatch(/2D and 3D/i);
      /*
       * The demo is placed in context positively: it runs Basic, and the other
       * layers extend the same foundation. The earlier phrasing ("not PRO, not
       * Education") said the same thing by subtraction, which made the working
       * mode read as a reduced preview of the ones that do not ship yet.
       */
      expect(text).toMatch(/runs the working Basic mode/i);
      expect(text).toMatch(/same structural-analysis foundation/i);
      expect(text).not.toMatch(/\bnot PRO\b/i);
    });

    test('the live demo is explicitly Basic mode', async ({ page }) => {
      await bootLanding(page);

      const demo = page.locator('.landing [data-section="demo"]');
      await demo.scrollIntoViewIfNeeded();

      await expect(demo.locator('.pill-basic')).toHaveText(/basic mode/i);
      const text = await sectionText(page, 'demo');
      expect(text).toMatch(/Basic mode/);
      // It must still place the other two, now as extensions rather than exclusions.
      expect(text).toMatch(/Education and PRO extend the same foundation/i);

      // The embed really is the Basic route, so the claim is not just copy.
      await page.locator('.landing .demo-cta').click();
      await expect(page.locator('.landing iframe.demo-iframe')).toHaveAttribute('src', /\/app\/basic\?embed/);
    });

    test('Education is labelled in development and does not claim teacher tooling', async ({ page }) => {
      await bootLanding(page);

      const edu = page.locator('.landing [data-section="education"]');
      await edu.scrollIntoViewIfNeeded();
      await expect(edu.locator('.badge-dev')).toHaveText(/in development/i);

      const text = await sectionText(page, 'education');
      // What exists today.
      expect(text).toMatch(/predefined exercises/i);
      expect(text).toMatch(/tolerance/i);
      /*
       * The teacher side must still be unmistakably future. Stated as work in
       * progress rather than as a list of absences — but the words "in
       * development" have to be attached to it, or the section would read as
       * though authoring and grading already ship.
       */
      expect(text).toMatch(/teacher side is in development/i);
      expect(text).toMatch(/being built on top of the exercises that already run/i);
      expect(text).not.toMatch(/teachers can (now|already)/i);
      expect(text).not.toMatch(/grading (is|are) available/i);
      // The free-for-education commitment is phrased as intent, not as a live offer.
      expect(text).toMatch(/intended to stay free for educational use/i);
    });

    test('PRO separates what it does now from what it does not', async ({ page }) => {
      await bootLanding(page);

      const pro = page.locator('.landing [data-section="pro"]');
      await pro.scrollIntoViewIfNeeded();
      await expect(pro.locator('.badge-dev')).toHaveText(/in development/i);

      const cols = pro.locator('.split-col');
      await expect(cols).toHaveCount(2);
      expect(await cols.nth(0).innerText()).toMatch(/usable now/i);
      expect(await cols.nth(1).innerText()).toMatch(/in development/i);

      const now = await cols.nth(0).innerText();
      expect(now).toMatch(/finite[- ]element/i);
      expect(now).toMatch(/CIRSOC 201/);

      /*
       * The END STATE of the detailing pipeline stays on the future side.
       * Partial drawing and schedule support does live in the `now` column —
       * see the dedicated coverage test below — so these assertions name the
       * whole-structure outputs specifically rather than the words "drawings"
       * and "schedules", which now legitimately appear on both sides.
       */
      const next = await cols.nth(1).innerText();
      expect(next).toMatch(/full floor-plan drawings/i);
      expect(next).toMatch(/complete structural plans and schedules/i);

      const text = await sectionText(page, 'pro');
      /*
       * The heading leads on what PRO already does, and the lead names the
       * genuine gap: design to the regulations, which is the step many
       * finite-element packages stop short of. Both halves matter — dropping
       * the second would turn an honest position into a finished claim.
       */
      expect(text).toMatch(/already runs complex calculations/i);
      expect(text).toMatch(/at the level you would expect from a professional package/i);
      expect(text).toMatch(/design to the regulations/i);
      expect(text).toMatch(/next step/i);
      // "production-ready" may appear ONLY as a future item, never as a claim.
      expect(next).toMatch(/production[- ]ready/i);
      expect(await cols.nth(0).innerText()).not.toMatch(/production[- ]ready/i);
    });

    /**
     * The design/detailing boundary, guarded in both directions.
     *
     * The families the merge made reachable (slabs, walls, pad footings) and the
     * drawing and schedule output for five element families are acknowledged —
     * under-claiming is its own dishonesty. But each acknowledgement must carry
     * the provisional qualifier, and the structure-wide end state must stay in
     * the future column. This test fails if either half drifts.
     */
    test('design and detailing coverage is acknowledged without claiming the end state', async ({ page }) => {
      await bootLanding(page);
      const pro = page.locator('.landing [data-section="pro"]');
      await pro.scrollIntoViewIfNeeded();
      const now = await pro.locator('.split-col').nth(0).innerText();
      const next = await pro.locator('.split-col').nth(1).innerText();

      // Reachable today: the three families the merge wired up, named as provisional.
      expect(now).toMatch(/slabs/i);
      expect(now).toMatch(/walls/i);
      expect(now).toMatch(/footings/i);
      expect(now).toMatch(/provisional/i);

      // Drawings and schedules exist, and the scope is stated as element families.
      expect(now).toMatch(/drawings/i);
      expect(now).toMatch(/DXF/);
      expect(now).toMatch(/SVG/);
      expect(now).toMatch(/XLSX/);
      expect(now).toMatch(/schedule/i);
      // Not "all drawings": the count of families is explicit.
      expect(now).toMatch(/five element families/i);

      // The end state stays future, and is not implied by the partial support.
      expect(next).toMatch(/structure[- ]wide/i);
      expect(next).toMatch(/full floor[- ]plan/i);
      expect(next).toMatch(/every supported family/i);
      expect(next).toMatch(/Diaphragms/i);

      // The `now` column must never claim the whole-building outputs.
      expect(now).not.toMatch(/complete (set of )?structural (plans|documents)/i);
      expect(now).not.toMatch(/structure[- ]wide/i);
      expect(now).not.toMatch(/whole (floor|building)/i);

      // The gap is still named, as the next step rather than as a shortfall.
      const text = await sectionText(page, 'pro');
      expect(text).toMatch(/building-wide documentation is the next step/i);

      // The source note records WHY these statuses read the way they do.
      expect(text).toMatch(/maturity model/i);
      expect(text).toMatch(/independent external benchmark/i);
      expect(text).toMatch(/labelled provisional/i);
    });

    test('CIRSOC 201 states the provisional families and still excludes diaphragms', async ({ page }) => {
      await bootLanding(page);
      const codes = page.locator('.landing [data-section="codes"]');
      await codes.scrollIntoViewIfNeeded();
      const row = codes.locator('.cirsoc-row[data-code="CIRSOC 201"]');
      const text = await row.innerText();

      // Slabs, walls and footings are designed — the first pass wrongly said they were not.
      expect(text).toMatch(/slabs, walls and pad footings are designed/i);
      expect(text).toMatch(/provisional/i);
      /*
       * The row is now compressed to a status line, so the detail moved rather
       * than vanished: the badge says PARTIAL and the note says the work is
       * still being tested. What must never happen is this row reading as
       * finished RC coverage.
       */
      expect(await row.locator('.badge').innerText()).toMatch(/partial/i);
      expect(text).toMatch(/being tested against real projects/i);
      expect(text).not.toMatch(/fully (supported|compliant)/i);
      expect(text).not.toMatch(/complete (detailing|coverage)/i);
      // Diaphragms stay out of the supported families, in the PRO future column.
      expect(await sectionText(page, 'pro')).toMatch(/diaphragms/i);
    });

    test('the status table keeps drawings and schedules in the partial tier', async ({ page }) => {
      await bootLanding(page);
      const status = page.locator('.landing [data-section="status"]');
      await status.scrollIntoViewIfNeeded();

      const partial = await status.locator('.status-group').nth(1).innerText();
      const today = await status.locator('.status-group').nth(0).innerText();

      expect(partial).toMatch(/drawings and bar schedules/i);
      // Structure-wide plans stay future — now phrased as work under way.
      expect(partial).toMatch(/structure-wide plans in development/i);
      expect(partial).toMatch(/labelled provisional/i);
      // They must NOT be promoted into the "available today" group, which is
      // reserved for capabilities with no qualifier attached.
      expect(today).not.toMatch(/bar schedules/i);
      expect(today).not.toMatch(/drawings/i);
    });

    test('the CIRSOC statuses are not overstated', async ({ page }) => {
      await bootLanding(page);

      const codes = page.locator('.landing [data-section="codes"]');
      /*
       * Scroll directly rather than through `scrollIntoViewIfNeeded`. This is
       * the tallest section on the page, and its reveal transition animates
       * `transform` for 600 ms — Playwright waits for a stable box before it
       * will scroll, so on a section this size the actionability check can
       * outlast the test timeout. Nothing here needs actionability; it only
       * needs the section rendered.
       */
      await page.evaluate(() => {
        document.querySelector('.landing [data-section="codes"]')!.scrollIntoView();
      });
      await page.waitForTimeout(900);

      const row = (code: string) => codes.locator(`.cirsoc-row[data-code="${code}"]`);
      for (const code of ['CIRSOC 101', 'CIRSOC 102', 'CIRSOC 201', 'CIRSOC 301', 'INPRES-CIRSOC 103']) {
        await expect(row(code), `${code} has a row`).toHaveCount(1);
        await expect(row(code).locator('.badge'), `${code} carries a status badge`).toHaveCount(1);
      }

      /*
       * The load codes are shipped and read as shipped. CIRSOC 201 is green
       * too, but its badge still says PARTIAL and its note says it is being
       * tested — progress, not a finished claim. 301 and 103 stay below that.
       */
      await expect(row('CIRSOC 101').locator('.badge-today')).toHaveCount(1);
      await expect(row('CIRSOC 102').locator('.badge-today')).toHaveCount(1);
      await expect(row('CIRSOC 201').locator('.badge-testing')).toHaveCount(1);
      expect(await row('CIRSOC 201').locator('.badge').innerText()).toMatch(/partial/i);
      await expect(row('CIRSOC 301').locator('.badge-partial')).toHaveCount(1);
      await expect(row('INPRES-CIRSOC 103').locator('.badge-dev')).toHaveCount(1);

      // Each row still carries a forward-looking status note, so nothing reads
      // as complete just because the paragraph got shorter.
      expect(await row('CIRSOC 102').innerText()).toMatch(/will be added/i);
      expect(await row('CIRSOC 201').innerText()).toMatch(/being tested against real projects/i);
      expect(await row('CIRSOC 301').innerText()).toMatch(/design in development/i);
      expect(await row('INPRES-CIRSOC 103').innerText()).toMatch(/seismic workflow in development/i);

      const limits = await codes.locator('.cirsoc-limit').allInnerTexts();
      expect(limits).toHaveLength(5);
      for (const l of limits) expect(l.trim().length).toBeGreaterThan(10);

      const text = await sectionText(page, 'codes');

      /*
       * The section now opens internationally and explains why CIRSOC leads,
       * rather than asserting it. The roadmap it states is for code-based
       * DESIGN — checking already spans the international codes, so a roadmap
       * that read "Argentina, then Europe, then the US" without that
       * distinction would contradict the grid immediately below it.
       */
      expect(text).toMatch(/member checking already spans the main international codes/i);
      expect(text).toMatch(/Argentine regulatory framework/i);
      expect(text).toMatch(/continues with the Eurocodes, and then with the United States codes/i);

      // The international codes are grouped by issuing country, not listed flat.
      // Lower-cased: the region headings are uppercased by CSS, so innerText
      // reports them that way regardless of the string in the dictionary.
      const regions = (await codes.locator('.intl-region').allInnerTexts()).map((s) => s.toLowerCase());
      expect(regions).toEqual(['united states', 'europe']);
      /*
       * Four cells for the United States, not five: timber and masonry share
       * one, which keeps the group to a single row on a desktop viewport and
       * stops the least-reached checkers from reading as two headline codes.
       */
      await expect(codes.locator('.intl-group').nth(0).locator('.code-cell')).toHaveCount(4);
      await expect(codes.locator('.intl-group').nth(1).locator('.code-cell')).toHaveCount(2);
      await expect(codes.locator('.code-cell', { hasText: 'NDS · TMS 402' })).toHaveCount(1);
      // IFC is an exchange format, so it sits outside the code groups.
      expect(text).toMatch(/IFC is not a design code/i);
      await expect(codes.locator('.code-cell', { hasText: 'IFC' })).toHaveCount(0);

      // Retired blocks stay retired.
      expect(text).not.toMatch(/six different claims/i);
      expect(text).not.toMatch(/in and out/i);
      expect(text).not.toMatch(/none of them proposes/i);
    });

    test('Stabileo AI is introduced before the detailed AI section', async ({ page }) => {
      await bootLanding(page);

      const intro = page.locator('.landing .mode-row[data-mode="ai"]');
      await expect(intro).toHaveCount(1);
      await expect(intro.locator('.badge-dev')).toHaveCount(1);

      const introText = await intro.innerText();
      expect(introText).toMatch(/Stabileo AI/);
      // Same solver, same numbers — the point that keeps it from reading as a
      // second opinion about mechanics, now stated positively.
      expect(introText).toMatch(/same solver and the same numbers/i);
      expect(introText).toMatch(/in development/i);

      // Introduced in `what` (03), detailed in `thesis` (12).
      const [introTop, detailTop] = await page.evaluate(() => [
        (document.querySelector('.landing .mode-row[data-mode="ai"]') as HTMLElement).offsetTop,
        (document.querySelector('.landing [data-section="thesis"]') as HTMLElement).offsetTop,
      ]);
      expect(introTop).toBeLessThan(detailTop);

      // The intro must not present the agent layer as something usable now.
      expect(introText).not.toMatch(/\b(try|use|open) (it|Stabileo AI)\b/i);

      /*
       * The detailed section states where the agent layer actually runs, and
       * that the public deployment exposes no backend for it. `client.ts`
       * defaults VITE_AI_BACKEND_URL to http://localhost:3001 and the Pages
       * workflow never sets it, so there is genuinely nothing to reach.
       */
      const thesis = await sectionText(page, 'thesis');
      expect(thesis).toMatch(/in active development/i);
      expect(thesis).toMatch(/development and testing/i);
      // The backend's absence from the public site is still stated plainly —
      // this is the claim that stops the section reading as a live service.
      expect(thesis).toMatch(/not part of the public site yet/i);
      expect(thesis).toMatch(/describes the direction rather than a service you can open today/i);
      // No autonomy, no certification: the engineer signs.
      expect(thesis).toMatch(/engineer still signs the work/i);
      expect(thesis).not.toMatch(/\bautonomous\b/i);

      /*
       * Its intended role stays framed by the solver's truth. "same engine" is
       * the INTRO's wording (asserted above); the detailed section makes the
       * same point through the generator/verifier split, so assert that rather
       * than expecting the intro's phrasing to be repeated verbatim.
       */
      expect(thesis).toMatch(/source of truth/i);
      expect(thesis).toMatch(/deterministic solver/i);

      /*
       * No control invites the visitor to USE the agent layer, because there is
       * no backend for it to reach. Scoped to invitation verbs rather than the
       * word "AI": the docs card "AI modelling workflow" is a link to a
       * repository document explaining the boundary, which is exactly the kind
       * of honest AI mention the page should keep.
       */
      const aiCtas = await page.locator('.landing button, .landing a').evaluateAll((els) =>
        els
          .map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim())
          .filter((s) =>
            /\b(try|use|launch|start|run)\s+(the\s+)?(stabileo\s+)?(ai|agent|assistant)\b/i.test(s)
            || /\b(chat|talk)\s+(with|to)\b/i.test(s)
            || /\bask\s+(the\s+)?(ai|stabileo)\b/i.test(s)),
      );
      expect(aiCtas, 'no control offers the agent layer for use').toEqual([]);
    });

    test('the status table uses four tiers and keeps hosted services on the roadmap', async ({ page }) => {
      await bootLanding(page);

      const status = page.locator('.landing [data-section="status"]');
      await status.scrollIntoViewIfNeeded();

      await expect(status.locator('.status-group')).toHaveCount(4);
      for (const tone of ['today', 'partial', 'dev', 'roadmap']) {
        await expect(status.locator(`.badge-${tone}`)).toHaveCount(1);
      }

      // Every listed capability sits inside a badged group — nothing unlabelled.
      const items = await status.locator('.status-list li').count();
      expect(items).toBeGreaterThan(15);

      const roadmap = await status.locator('.status-group').nth(3).innerText();
      for (const service of ['Remote solving', 'credits', 'Cloud workspace']) {
        expect(roadmap).toContain(service);
      }
      // Roadmap services are still ahead, and never required.
      expect(await status.innerText()).toMatch(/still ahead/i);
      expect(await status.innerText()).toMatch(/never depend on them/i);
    });

    test('no unsupported superlative, autonomy, certification or adoption claim appears', async ({ page }) => {
      await bootLanding(page);

      // Read the whole page, including the sections that only reveal on scroll.
      const body = (await page.locator('.landing').innerText()).replace(/\s+/g, ' ');

      // No "first" claim about the product. Scoped to a product noun on
      // purpose: "load at the first panel point" and "your first ten minutes"
      // are ordinary engineering prose, and a blanket /the first/ ban would
      // forbid them and teach the next author to work around the test.
      expect(body).not.toMatch(
        /\b(the|world'?s|argentina'?s|latin\s+america'?s)\s+first\s+(\w+[- ]){0,3}(platform|software|tool|application|app|solver|product|suite|program)\b/i,
      );
      expect(body).not.toMatch(/\bfirst\s+(ever|and only)\b/i);
      expect(body).not.toMatch(/\bthe\s+only\s+(platform|software|tool|solver)\b/i);
      // No autonomy or certification claim for the agent layer.
      expect(body).not.toMatch(/\bfully autonomous\b/i);
      expect(body).not.toMatch(/\b(certified|certifies)\s+(by|design|structures?)\b/i);
      expect(body).not.toMatch(/\bcode[- ]certified\b/i);
      /*
       * No production-readiness CLAIM. The phrase itself is allowed to appear,
       * because "production-ready export of complete structural plans" is a
       * named roadmap item and naming the goal is how the page stays honest
       * about not having reached it. What is banned is the assertive form, and
       * the scoped tests above prove it never sits in a "usable now" column.
       */
      expect(body).not.toMatch(/\b(is|are|now|already)\s+production[- ]ready\b/i);
      expect(body).not.toMatch(/\bproduction[- ]ready\s+(service|product|platform|today)\b/i);
      // No user or customer counts, which nothing in the repository supports.
      expect(body).not.toMatch(/\b\d[\d.,]*\s*(\+\s*)?(users|engineers|firms|customers|students|universities|downloads)\b/i);
      /*
       * No price for Stabileo. Currency-and-figure only: the Problem section
       * describes what the incumbent tools cost ("one seat runs into the
       * thousands per year"), which is the point of that section, so banning
       * "per seat" or "per year" outright would forbid honest prose about
       * someone else's pricing rather than catch a price for this product.
       */
      expect(body).not.toMatch(/\$\s?\d/);
      expect(body).not.toMatch(/\bUSD\s?\d/);
      expect(body).not.toMatch(/\b\d+\s*(USD|ARS|EUR)\s*\/\s*(seat|month|mo|year|yr)\b/i);
      // And no pricing-plan furniture, which is what the retired table had.
      expect(body).not.toMatch(/\b(free tier|pro plan|per[- ]seat pricing|subscribe now|start free trial)\b/i);

      // The numbers that DO appear keep their provenance.
      const validation = await sectionText(page, 'validation');
      expect(validation).toContain('5,655');
      expect(validation).toMatch(/measured at 6c3369d6/);
      expect(validation).toMatch(/22–89×/);
      expect(validation).toMatch(/against Stabileo’s own dense path/);

      /*
       * The example count is read off the shipped fixture index, so it drifts
       * whenever a fixture is added — merging the CIRSOC load-code work took it
       * from 54 to 55 while every surrounding sentence still said 54. Asserting
       * the rendered figure against the source of truth means the next drift
       * fails here instead of shipping.
       */
      const stats = page.locator('.landing [data-section="validation"] .stat');
      const examples = stats.filter({ hasText: /example models/i });
      await expect(examples.locator('.stat-num')).toHaveText('55');
      await expect(examples).toContainText('37 in the examples menu');
    });

    test('the same product status is communicated in Spanish', async ({ page }) => {
      await bootLanding(page, { locale: 'es' });

      const body = (await page.locator('.landing').innerText()).replace(/\s+/g, ' ');

      // The three modes and their states.
      expect(body).toMatch(/Básico/);
      expect(body).toMatch(/Disponible hoy/i);
      expect(body).toMatch(/En desarrollo/i);
      // Same disclaimers as English.
      // Case-insensitive: the pill is uppercased by CSS, so innerText reports it that way.
      expect(body).toMatch(/100% modo Básico/i);
      // Same forward-looking statuses as the English page.
      expect(body).toMatch(/el lado docente está en desarrollo/i);
      expect(body).toMatch(/en desarrollo activo/i);
      expect(body).toMatch(/no un servicio que puedas abrir hoy/i);
      expect(body).toMatch(/ya sirve para cálculos complejos/i);
      expect(body).toMatch(/diseño según normativa/i);
      // The codes section reads internationally in Spanish too.
      expect(body).toMatch(/marco normativo argentino/i);
      expect(body).toMatch(/Eurocódigos, y después con las normativas de Estados Unidos/i);
      expect(body).toMatch(/Recálculo en vivo/i);
      // The corrected design/detailing scope reads the same in Spanish.
      expect(body).toMatch(/las losas, los tabiques y las zapatas también se diseñan/i);
      expect(body).toMatch(/provisorios/i);
      expect(body).toMatch(/cinco familias de elementos/i);
      expect(body).toMatch(/testeándose frente a casos reales/i);
      // And the defensive constructions are gone from the Spanish page too.
      expect(body).not.toMatch(/no es PRO/i);
      expect(body).not.toMatch(/ninguno propone un diseño/i);
      expect(body).not.toMatch(/esta página no tiene analítica/i);
      // Same badge tiers.
      for (const tone of ['today', 'partial', 'dev', 'roadmap']) {
        expect(await page.locator(`.landing [data-section="status"] .badge-${tone}`).count()).toBe(1);
      }
      // No price in Spanish either.
      // As in English: a currency figure, not prose about what the incumbents cost.
      expect(body).not.toMatch(/\$\s?\d/);
      expect(body).not.toMatch(/\b\d+\s*(USD|ARS)\s*\/\s*(mes|año|puesto)\b/i);
    });

    test('the corrected Spanish wording is the wording that ships', async ({ page }) => {
      await bootLanding(page, { locale: 'es' });
      const body = (await page.locator('.landing').innerText()).replace(/\s+/g, ' ');

      // Each of these was a specific defect: a calque, a wrong term, or a
      // decorative em-dash that made the copy read as machine output.
      expect(body).toMatch(/Durante décadas, el cálculo estructural dependió de software/);
      expect(body).toContain('Miles de USD');
      expect(body).toMatch(/El ingeniero debe firmar algo que no puede inspeccionar/);
      expect(body).toContain('postesado');
      expect(body).not.toContain('postensado');
      // "Fluencia" alone means yielding; creep is "fluencia lenta".
      expect(body).toContain('Fluencia lenta');
      // "llave de licencia" is a calque of "licence key".
      expect(body).not.toMatch(/llaves? de licencia/i);
      expect(body).not.toMatch(/— todo en una pestaña/);
      // Voseo, consistently: the page says movés, cambiás, elegí — so apretés.
      expect(body).not.toMatch(/que aprietes/);
    });

    test('both public locales render every landing key they reference', async ({ page }) => {
      for (const locale of ['en', 'es']) {
        await bootLanding(page, { locale });
        // Scroll the whole page so every lazily-revealed section renders.
        await page.evaluate(async () => {
          const el = document.querySelector('.landing')!;
          for (let y = 0; y < el.scrollHeight; y += 600) {
            el.scrollTop = y;
            await new Promise((r) => requestAnimationFrame(r));
          }
        });
        const body = await page.locator('.landing').innerText();
        // An unresolved key renders as its own id, which is the failure to catch.
        const raw = body.match(/landing\.[A-Za-z0-9]+/g) ?? [];
        expect(raw, `${locale} renders no raw translation keys`).toEqual([]);
        expect(body).not.toMatch(/\bundefined\b/);
      }
    });
  });

  /**
   * The landing is client-rendered, so index.html is the only metadata a
   * crawler that does not run JavaScript ever sees. It must be correct on its
   * own, and hydration must refine it in place rather than append a second,
   * contradictory set — which is what it used to do.
   */
  test.describe('metadata', () => {
    const SOCIAL = 'https://stabileo.com/og/stabileo-social.png';
    const EN_TITLE = 'Stabileo — Structural analysis, in a browser tab.';

    function readHead(page: Page) {
      return page.evaluate(() => {
        const byKey: Record<string, string[]> = {};
        for (const m of document.querySelectorAll('meta[name], meta[property]')) {
          const k = m.getAttribute('name') ?? m.getAttribute('property')!;
          (byKey[k] ??= []).push(m.getAttribute('content') ?? '');
        }
        return {
          title: document.title,
          headTitles: document.querySelectorAll('head > title').length,
          lang: document.documentElement.lang,
          canonicals: [...document.querySelectorAll('link[rel="canonical"]')].map((l) => l.getAttribute('href')),
          meta: byKey,
        };
      });
    }
    const one = (h: Awaited<ReturnType<typeof readHead>>, k: string) => {
      expect(h.meta[k], `${k} must exist exactly once`).toHaveLength(1);
      return h.meta[k][0];
    };

    test('a crawler with no JavaScript gets a complete, correct English head', async ({ browser }) => {
      const ctx = await browser.newContext({ javaScriptEnabled: false });
      const page = await ctx.newPage();
      await page.goto('/');
      const h = await readHead(page);

      expect(h.headTitles).toBe(1);
      expect(h.title).toBe(EN_TITLE);
      expect(h.lang).toBe('en');
      expect(h.canonicals).toEqual(['https://stabileo.com/']);

      expect(one(h, 'description')).toMatch(/free and open-source/i);
      expect(one(h, 'theme-color')).toBe('#0c1620');
      expect(one(h, 'og:type')).toBe('website');
      expect(one(h, 'og:url')).toBe('https://stabileo.com/');
      expect(one(h, 'og:site_name')).toBe('Stabileo');
      expect(one(h, 'og:locale')).toBe('en_US');
      expect(one(h, 'og:locale:alternate')).toBe('es_AR');
      expect(one(h, 'og:title')).toBe(EN_TITLE);
      expect(one(h, 'twitter:card')).toBe('summary_large_image');
      expect(one(h, 'twitter:title')).toBe(EN_TITLE);

      // Absolute URL: crawlers do not reliably resolve a relative og:image.
      expect(one(h, 'og:image')).toBe(SOCIAL);
      expect(one(h, 'twitter:image')).toBe(SOCIAL);
      expect(one(h, 'og:image:type')).toBe('image/png');
      expect(one(h, 'og:image:width')).toBe('1200');
      expect(one(h, 'og:image:height')).toBe('630');
      expect(one(h, 'og:image:alt').length).toBeGreaterThan(30);
      expect(one(h, 'twitter:image:alt').length).toBeGreaterThan(30);
      await ctx.close();
    });

    test('the legacy screenshot is no longer referenced as a social image', async ({ browser }) => {
      const ctx = await browser.newContext({ javaScriptEnabled: false });
      const page = await ctx.newPage();
      await page.goto('/');
      const html = await page.content();
      expect(html).not.toContain('3d-industrial.png');
      await ctx.close();
    });

    test('hydration refines the head in place, with no duplicates', async ({ page }) => {
      await bootLanding(page);
      const h = await readHead(page);

      expect(h.headTitles, 'exactly one <title> in the head').toBe(1);
      // Every social key appears exactly once — `one()` throws otherwise.
      for (const k of ['description', 'theme-color', 'og:type', 'og:title', 'og:description',
        'og:image', 'og:locale', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) {
        one(h, k);
      }
      expect(h.canonicals).toEqual(['https://stabileo.com/']);
      expect(h.title).toBe(EN_TITLE);
      expect(one(h, 'og:title')).toBe(EN_TITLE);
      // The description sharpens to the live hero copy.
      expect(one(h, 'og:description')).toBe(one(h, 'description'));
      expect(one(h, 'og:image')).toBe(SOCIAL);
    });

    test('the Spanish landing carries Spanish metadata', async ({ page }) => {
      await bootLanding(page);
      await page.locator('.landing select.nav-lang').selectOption('es');
      await expect(page.locator('.landing h1')).toHaveText('Análisis estructural, en una pestaña del navegador.');
      const h = await readHead(page);

      expect(h.headTitles).toBe(1);
      expect(h.lang).toBe('es');
      expect(h.title).toBe('Stabileo — Análisis estructural, en una pestaña del navegador.');
      expect(one(h, 'og:title')).toBe(h.title);
      expect(one(h, 'og:locale')).toBe('es_AR');
      expect(one(h, 'og:locale:alternate')).toBe('en_US');
      // The description is the hero lead, which now carries the positioning:
      // a free, open platform with three modes, rather than live re-solving.
      expect(one(h, 'description')).toMatch(/plataforma gratuita y abierta/);
      expect(one(h, 'description')).toMatch(/Básico.*Educativo.*PRO/);
      expect(one(h, 'twitter:description')).toBe(one(h, 'description'));
      // The canonical and the social image do not vary by locale.
      expect(h.canonicals).toEqual(['https://stabileo.com/']);
      expect(one(h, 'og:image')).toBe(SOCIAL);
    });

    test('a Spanish browser gets Spanish metadata without touching the switcher', async ({ browser }) => {
      const ctx = await browser.newContext({ locale: 'es-AR' });
      const page = await ctx.newPage();
      await bootLanding(page, { manual: false });
      const h = await readHead(page);
      expect(h.lang).toBe('es');
      expect(h.title).toMatch(/Análisis estructural/);
      expect(h.headTitles).toBe(1);
      await ctx.close();
    });

    test('entering the application leaves no landing copy behind', async ({ page }) => {
      await bootLanding(page);
      await page.locator('.landing select.nav-lang').selectOption('es');
      await page.waitForTimeout(300);
      await page.locator('.landing .hero-ctas .btn-primary').click();
      await expect(page.locator('.landing')).toHaveCount(0);

      const h = await readHead(page);
      expect(h.headTitles).toBe(1);
      expect(h.title, 'restored to the static English title').toBe(EN_TITLE);
      expect(h.lang).toBe('en');
      expect(one(h, 'og:locale')).toBe('en_US');
      expect(one(h, 'description')).toMatch(/free and open-source/i);
    });

    test('the social card exists, resolves, and is a 1200x630 PNG', async ({ page }) => {
      const res = await page.request.get('/og/stabileo-social.png');
      expect(res.status(), 'social card must be served').toBe(200);
      expect(res.headers()['content-type']).toContain('image/png');

      const body = await res.body();
      // PNG signature, then IHDR width/height as big-endian uint32.
      expect([...body.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(body.readUInt32BE(16)).toBe(1200);
      expect(body.readUInt32BE(20)).toBe(630);
      // Comfortably inside every platform's social-card size limit.
      expect(body.length).toBeLessThan(1_000_000);
    });

    test('deep links and the landing overlay still behave', async ({ page }) => {
      // The 404.html -> /?route= recovery and the overlay are untouched by this
      // pass; this is the guard that says so.
      await bootLanding(page);
      await expect(page.locator('.landing')).toBeVisible();
      await expect(page.locator('.app-container.hidden-behind-landing')).toHaveCount(1);

      await page.goto('/app/basic');
      await expect(page.locator('.landing')).toHaveCount(0);
      await expect(page.locator('.app-container')).toBeVisible();
    });
  });

  test('every landing image resolves', async ({ page }) => {
    await bootLanding(page);
    await page.locator('.landing [data-section="cta"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);

    const broken = await page.locator('.landing img').evaluateAll((els) =>
      els
        .filter((el) => {
          const img = el as HTMLImageElement;
          return img.complete && img.naturalWidth === 0;
        })
        .map((el) => (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src),
    );
    expect(broken).toEqual([]);
  });

  test('no horizontal overflow at the QA widths', async ({ browser }) => {
    for (const width of [360, 390, 768, 1024, 1440]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      await bootLanding(page);
      const overflow = await page.evaluate(() => {
        const el = document.querySelector('.landing') as HTMLElement;
        return { scrollW: el.scrollWidth, inner: window.innerWidth };
      });
      expect(overflow.scrollW, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(overflow.inner + 1);
      await ctx.close();
    }
  });
});
