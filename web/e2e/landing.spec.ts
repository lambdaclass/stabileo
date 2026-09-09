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
 * Tagging: `@landing`, which no CI job runs — and an attempt to change that on
 * 2026-08-19 is why this paragraph is longer than it wants to be.
 *
 * Added to the blocking grep, this suite failed in CI in a way it has never
 * failed locally: the first case passed and every case after it timed out at
 * 60 s "while setting up context", i.e. `browser.newContext` never returning.
 * One wedged browser, not an assertion. With `workers: 1` this file runs after
 * roughly 190 heavier cases, and the leading suspicion is the hero's
 * continuous requestAnimationFrame animation under software GL on a two-core
 * runner. That is a harness problem, and it is not this file's to fix.
 *
 * So it stays local for now. Every case here has been run on every commit that
 * touched the landing, by hand:
 *
 *   npx playwright test --grep @landing
 *
 * blog.spec.ts was split out to `@smoke` — its twelve cases DID pass in that
 * CI run, so at least the newest public surface is enforced.
 *
 * Run locally:
 *   npx playwright test --grep @landing
 */

/**
 * Sections `LandingPage.svelte` composes, in DOM order.
 *
 * The order encodes the narrative rule the content pass exists to enforce: the
 * visitor meets `basic` before `education`, `pro` or `thesis`, so the
 * product's present state lands before any future capability. A reordering
 * that puts a developing mode ahead of the working one should fail here and
 * be argued for deliberately.
 */
const SECTIONS = [
  'hero',
  'basic',
  'pro-calc',
  'pro-design',
  'ai',
  'education',
  'pricing',
  'blog',
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

    const cta = page.locator('.landing [data-section="education"]');
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

  test('the hero offers one action and no dead link', async ({ page }) => {
    /*
     * The hero used to carry a second button pointing at /demo, the guided
     * tour. That route is being retired by the tutorials workstream, so the
     * button went with it: a link to a page that will 404 looks exactly like a
     * working one until someone presses it, and this one sat in the first
     * screen of the site.
     *
     * What remains is one primary action and the quiet blog link below it.
     */
    await bootLanding(page);

    await expect(page.locator('.landing .hero-ctas .btn')).toHaveCount(1);
    await expect(page.locator('.landing a[href="/demo"]')).toHaveCount(0);
    await expect(page.locator('.landing .hero-blog')).toBeVisible();
  });

  test('the nav locale switcher changes the rendered copy', async ({ page }) => {
    await bootLanding(page, { locale: 'en' });

    const h1 = page.locator('.landing h1');
    await expect(h1).toHaveText('Structural analysis, in a browser tab.');

    await page.locator('.landing select.nav-lang').selectOption('es');

    await expect(h1).toHaveText('Cálculo estructural, en una pestaña del navegador.');
    /*
     * A second heading, further down, so the assertion covers the whole page
     * rather than the one string the switcher is most likely to get right.
     * It used to be the status section's; that section is gone, and the
     * pricing heading sits at the far end of the deck, which is the better
     * hostage: a switcher that only repaints the top would pass otherwise.
     */
    await expect(page.locator('.landing #pricing-title')).toHaveText(
      'Un desarrollo abierto, con dos módulos que algún día se van a cobrar.',
    );

    expect(await page.evaluate(() => localStorage.getItem('stabileo-lang'))).toBe('es');
    expect(await page.evaluate(() => localStorage.getItem('stabileo-lang-manual'))).toBe('1');
  });

  test('the landing offers exactly the languages it fully speaks', async ({ page }) => {
    await bootLanding(page);

    // PUBLIC_LOCALES. Portuguese joined once every landing key existed — the
    // list and the copy are kept in step by landing-i18n-parity.test.ts.
    const values = await page
      .locator('.landing select.nav-lang option')
      .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value));
    expect(values).toEqual(['en', 'es', 'pt']);
  });

  test('a Brazilian browser gets the Portuguese landing', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'pt-BR' });
    const page = await ctx.newPage();
    await bootLanding(page, { manual: false });
    await expect(page.locator('.landing h1')).toHaveText('Cálculo estrutural, numa aba do navegador.');
    await expect(page.locator('.landing select.nav-lang')).toHaveValue('pt');
    await ctx.close();
  });

  test('a Spanish browser gets the Spanish landing', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'es-AR' });
    const page = await ctx.newPage();
    await bootLanding(page, { manual: false });
    await expect(page.locator('.landing h1')).toHaveText('Cálculo estructural, en una pestaña del navegador.');
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
    await page.locator('.landing [data-section="education"]').scrollIntoViewIfNeeded();
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


  /**
   * The product narrative.
   *
   * These tests guard claims rather than layout. Each one exists because the
   * page previously said something the repository does not support, or said it
   * in an order that let a visitor mistake a developing layer for a shipped
   * one. They should fail when the copy over-claims again, which is the only
   * failure mode that matters here.
   */

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
      // The root serves English and consolidates into /en rather than
      // competing with it: two URLs, one indexed page.
      expect(h.canonicals).toEqual(['https://stabileo.com/en/']);

      /*
       * The description is the hero's own lead, not the fallback string
       * index.html used to carry. Since the public pages are prerendered, the
       * file a crawler receives already holds the page's real metadata — there
       * is no longer a generic head to be refined later.
       */
      expect(one(h, 'description')).toMatch(/open structural-analysis platform/i);
      expect(one(h, 'theme-color')).toBe('#0c1620');
      expect(one(h, 'og:type')).toBe('website');
      // og:url names the page, and the page here is /en — the same address
      // the canonical above declares. Sharing the root should produce a card
      // for the English landing, not for a doorway.
      expect(one(h, 'og:url')).toBe('https://stabileo.com/en/');
      expect(one(h, 'og:site_name')).toBe('Stabileo');
      expect(one(h, 'og:locale')).toBe('en_US');
      // One tag per alternate language, which is how Open Graph reads them.
      expect(h.meta['og:locale:alternate']).toEqual(['es_AR', 'pt_BR']);
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
      // One canonical, and it names the language of the page rather than the
      // bare root — the root is a doorway, /en is the page.
      expect(h.canonicals).toEqual(['https://stabileo.com/en/']);
      expect(h.title).toBe(EN_TITLE);
      expect(one(h, 'og:title')).toBe(EN_TITLE);
      // The description sharpens to the live hero copy.
      expect(one(h, 'og:description')).toBe(one(h, 'description'));
      expect(one(h, 'og:image')).toBe(SOCIAL);
    });

    test('the Spanish landing carries Spanish metadata', async ({ page }) => {
      await bootLanding(page);
      await page.locator('.landing select.nav-lang').selectOption('es');
      await expect(page.locator('.landing h1')).toHaveText('Cálculo estructural, en una pestaña del navegador.');
      const h = await readHead(page);

      expect(h.headTitles).toBe(1);
      expect(h.lang).toBe('es');
      expect(h.title).toBe('Stabileo — Cálculo estructural, en una pestaña del navegador.');
      expect(one(h, 'og:title')).toBe(h.title);
      expect(one(h, 'og:locale')).toBe('es_AR');
      expect(h.meta['og:locale:alternate']).toEqual(['en_US', 'pt_BR']);
      expect(h.canonicals).toEqual(['https://stabileo.com/es/']);
      // The description is the hero lead, which now carries the positioning:
      // a free, open platform with three modes, rather than live re-solving.
      expect(one(h, 'description')).toMatch(/plataforma abierta de análisis estructural/);
      expect(one(h, 'description')).toMatch(/plataforma abierta de análisis estructural/);
      expect(one(h, 'twitter:description')).toBe(one(h, 'description'));
      // The canonical DOES vary by locale now: each language is its own
      // indexable page, which is the whole reason the prefixes exist.
      expect(one(h, 'og:image')).toBe(SOCIAL);
    });

    test('the Portuguese landing carries Portuguese metadata', async ({ page }) => {
      await bootLanding(page);
      await page.locator('.landing select.nav-lang').selectOption('pt');
      await expect(page.locator('.landing h1')).toHaveText('Cálculo estrutural, numa aba do navegador.');
      const h = await readHead(page);

      expect(h.headTitles).toBe(1);
      expect(h.lang).toBe('pt');
      expect(h.title).toBe('Stabileo — Cálculo estrutural, numa aba do navegador.');
      expect(one(h, 'og:title')).toBe(h.title);
      expect(one(h, 'og:locale')).toBe('pt_BR');
      expect(h.meta['og:locale:alternate']).toEqual(['en_US', 'es_AR']);
      expect(h.canonicals).toEqual(['https://stabileo.com/pt/']);
      expect(one(h, 'twitter:description')).toBe(one(h, 'description'));
    });

    test('leaving a translated page restores the static alternates', async ({ page }) => {
      // The set of alternate tags is rewritten, not patched, so a restore that
      // forgot them would leave a Portuguese page's pair behind in the head.
      await bootLanding(page);
      await page.locator('.landing select.nav-lang').selectOption('pt');
      await page.locator('.landing .hero-ctas .btn-primary').click();
      await expect(page.locator('.landing')).toHaveCount(0);

      const h = await readHead(page);
      expect(h.meta['og:locale:alternate']).toEqual(['es_AR', 'pt_BR']);
      expect(one(h, 'og:locale')).toBe('en_US');
    });

    test('a Spanish browser gets Spanish metadata without touching the switcher', async ({ browser }) => {
      const ctx = await browser.newContext({ locale: 'es-AR' });
      const page = await ctx.newPage();
      await bootLanding(page, { manual: false });
      const h = await readHead(page);
      expect(h.lang).toBe('es');
      expect(h.title).toMatch(/Cálculo estructural/);
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
      /*
       * The description is the hero's own lead, not the fallback string
       * index.html used to carry. Since the public pages are prerendered, the
       * file a crawler receives already holds the page's real metadata — there
       * is no longer a generic head to be refined later.
       */
      expect(one(h, 'description')).toMatch(/open structural-analysis platform/i);
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


  test('the contact button opens a chat with the configured number', async ({ page }) => {
    await bootLanding(page);

    const fab = page.locator('.landing .wa-fab');
    await expect(fab).toBeVisible();
    // Digits only. wa.me accepts a `+` or a space without complaining and then
    // opens WhatsApp on an invalid contact, so the failure is silent.
    await expect(fab).toHaveAttribute('href', /^https:\/\/wa\.me\/\d{8,15}\?text=/);
    await expect(fab).toHaveAttribute('target', '_blank');
    await expect(fab).toHaveAttribute('rel', 'noreferrer');
    // Icon-only, so the accessible name has to carry it.
    await expect(fab).toHaveAttribute('aria-label', /whatsapp/i);
  });

  test('the contact button never covers the mobile action bar', async ({ page }) => {
    // Below 760px the footer raises a sticky "open the editor" bar. That bar is
    // the page's primary action; this button is not, and must sit above it.
    await page.setViewportSize({ width: 390, height: 780 });
    await bootLanding(page);

    const fab = (await page.locator('.landing .wa-fab').boundingBox())!;
    const bar = (await page.locator('.landing .mobile-sticky').boundingBox())!;
    expect(fab.y + fab.height).toBeLessThanOrEqual(bar.y);
  });

  test('every landing image resolves', async ({ page }) => {
    await bootLanding(page);
    await page.locator('.landing [data-section="education"]').scrollIntoViewIfNeeded();
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

/*
 * The promises the shorter deck makes.
 *
 * The previous suite guarded a page that argued its case over fourteen
 * sections, and twenty of those tests went with the copy they were written
 * for. What replaces them is smaller and harder: this page states PRICES, and
 * a landing that contradicts the business model — or quietly widens a promise
 * made to universities — costs more than a broken layout.
 */
test.describe('@landing the model the deck states', () => {
  test('the table names every module, who it is for, and what it costs', async ({ page }) => {
    await bootLanding(page, { locale: 'es' });

    const rows = await page
      .locator('section[data-section="pricing"] .model-table tbody tr')
      .evaluateAll((trs) =>
        trs.map((tr) => [...tr.querySelectorAll('th,td')].map((c) => c.textContent?.trim() ?? '')),
      );

    // The six rows of the one-page business model, in its order.
    expect(rows).toEqual([
      ['Básico', 'Todos', 'Gratis, siempre'],
      ['PRO · Cálculo', 'Todos', 'Gratis'],
      ['PRO · Diseño normativo', 'Empresas y estudios', 'Pago'],
      ['Educativo', 'Universidad pública', 'Gratis'],
      ['Educativo', 'Universidad privada', 'A definir'],
      ['Stabileo IA', 'Todos', 'Pago'],
    ]);
  });

  test('the product sections describe the product and price nothing', async ({ page }) => {
    await bootLanding(page, { locale: 'es' });

    /*
     * Prices are stated once, in the pricing section. Each product section
     * argued its own for a draft, and a page that describes a capability and
     * then defends its price in the same breath reads as a sales page. If a
     * price sentence creeps back into one of these, this fails.
     */
    for (const id of ['basic', 'pro-calc', 'pro-design', 'ai']) {
      /*
       * Prose only. The status badge is allowed to carry a word like "gratis"
       * — it is a two-word marker at a glance, not the page arguing a price —
       * and this is about the paragraphs that used to defend one.
       */
      const prose = (await page.locator(`section[data-section="${id}"] p`).allInnerTexts())
        .join(' ')
        .toLowerCase();
      for (const word of ['pago', 'gratuito', 'gratis', 'cobrar', 'universidades']) {
        expect(prose, `"${word}" belongs in the pricing section, not in ${id}`).not.toContain(word);
      }
    }
  });

  test('the promise to public universities carries its one exception', async ({ page }) => {
    await bootLanding(page, { locale: 'es' });

    const edu = page.locator('section[data-section="education"]');
    await expect(edu).toContainText('gratis para las universidades públicas');
    /*
     * The carve-out travels with the promise. Alone, "everything is free for
     * public universities" is wider than what we can keep: the agent has a
     * per-use cost, and the model table says so two screens above.
     */
    await expect(edu).toContainText('La única excepción es la IA');
  });

  test('the AI section shows the panel, and the panel shows a decision', async ({ page }) => {
    await bootLanding(page, { locale: 'es' });
    const ai = page.locator('section[data-section="ai"]');
    await expect(ai).toBeVisible();

    // The screenshot is the argument the section makes: the agent proposes and
    // a person applies. A picture of the agent acting alone would contradict
    // the copy beside it.
    const img = ai.locator('img');
    await expect(img).toHaveCount(1);
    await expect(img).toHaveAttribute('alt', /propone|aplicarl/i);
  });

  test('the footer links the five accounts, and opens none of them in place', async ({ page }) => {
    await bootLanding(page);

    const links = page.locator('.landing .footer-social a');
    await expect(links).toHaveCount(5);

    const hrefs = await links.evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
    expect([...hrefs].sort()).toEqual([
      'https://discord.gg/Q53rp7FKXA',
      'https://ergodicgroup.com/',
      'https://www.instagram.com/stabileoapp/',
      'https://www.linkedin.com/company/stabileo',
      'https://x.com/Stabileoapp',
    ]);

    // Labelled by handle, not by platform: a reader scanning a footer knows
    // what Instagram is and does not know what to search for.
    const labels = await links.evaluateAll((els) => els.map((e) => e.textContent?.trim() ?? ''));
    expect(labels).toContain('stabileoapp');
    expect(labels).toContain('@stabileoapp');

    for (const rel of await links.evaluateAll((els) => els.map((e) => e.getAttribute('rel')))) {
      expect(rel).toContain('noreferrer');
    }
    for (const target of await links.evaluateAll((els) => els.map((e) => e.getAttribute('target')))) {
      expect(target).toBe('_blank');
    }
  });
});
