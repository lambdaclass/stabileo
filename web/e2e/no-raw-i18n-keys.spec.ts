/**
 * No raw i18n key is ever visible (#719), in es, en and pt.
 *
 * The desktop app showed `tabBar.newStructure` as the project name and the window title
 * (2026-10-27): `t()` was asked for the key before its dictionary was registered, and `t()`
 * answers a key it cannot find with the key itself. Nothing failed, because nothing read the
 * screen for keys.
 *
 * This walks the main screens in each offered language — Basic empty, its settings, its project
 * panel, a solved model and its results, a dialog; PRO with design off, its settings, a solved
 * model, the automatic loads dialog; PRO with design on and its desk — and reads what a person is
 * shown there: the visible text, every `title` (tooltips), `aria-label`, `placeholder` and `alt`
 * of a visible element, and the document title. Each word is checked against the dictionaries'
 * own key list (`src/lib/i18n/raw-keys.ts`): a word that is a key, or that has a key's shape
 * under one of the dictionaries' namespaces, fails the test with where it was found.
 *
 * The detector's negative case (a known key fed to it is found) is a unit test,
 * `src/lib/i18n/__tests__/raw-keys.test.ts`. Not covered here: the desktop build (a separate
 * shell around the same bundle) and text drawn on the canvas (node and member labels, diagram
 * values), which is not in the DOM.
 */
import { test, expect, bootPro, loadModel, alSection, PRO_URL } from './fixtures';
import type { Page } from '@playwright/test';
import es from '../src/lib/i18n/locales/es';
import en from '../src/lib/i18n/locales/en';
import pt from '../src/lib/i18n/locales/pt';
import steelEs from '../src/lib/i18n/locales/steel/es';
import steelEn from '../src/lib/i18n/locales/steel/en';
import steelPt from '../src/lib/i18n/locales/steel/pt';
import { stepsEs, stepsEn, stepsPt } from '../src/lib/i18n/locales/steps';
import fullDe from '../src/lib/i18n/locales/full/de';
import fullFr from '../src/lib/i18n/locales/full/fr';
import fullTr from '../src/lib/i18n/locales/full/tr';
import { rawKeyIndex, findRawKeys } from '../src/lib/i18n/raw-keys';
import { OFFERED_LOCALES, PUBLIC_LOCALES, type Locale } from '../src/lib/i18n/offered';

const INDEX = rawKeyIndex([
  { ...es, ...steelEs, ...stepsEs },
  { ...en, ...steelEn, ...stepsEn },
  { ...pt, ...steelPt, ...stepsPt },
  fullDe, fullFr, fullTr,
] as Array<Record<string, string>>);

const LOCALES = OFFERED_LOCALES;

/**
 * A fresh project's name, in each language, from the dictionaries: «New structure», «Nueva
 * estructura», «Nova estrutura». The tab shows it in its name field, where the key once stood.
 */
const DICTS: Record<Locale, Record<string, string>> = { es, en, pt, de: fullDe, fr: fullFr, tr: fullTr } as never;
const NEW_STRUCTURE = (locale: Locale): string => DICTS[locale]['tabBar.newStructure'];

/** The project tab names a fresh project in the reader's language. */
async function expectNewProjectName(page: Page, locale: Locale): Promise<void> {
  expect(NEW_STRUCTURE(locale), `the ${locale} dictionary names a new structure`).toBeTruthy();
  await expect(page.locator('input.tab-name').first()).toHaveValue(NEW_STRUCTURE(locale));
}

/** Everything a person is shown, with where: visible text, tooltips, labels, the window title. */
function shown(page: Page): Promise<Array<{ where: string; text: string }>> {
  return page.evaluate(() => {
    const out: Array<{ where: string; text: string }> = [{ where: 'document.title', text: document.title }];
    out.push({ where: 'visible text', text: document.body.innerText });
    const ATTRS = ['title', 'aria-label', 'placeholder', 'alt', 'aria-description'];
    for (const el of document.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(','))) {
      const visible = typeof (el as HTMLElement).checkVisibility === 'function'
        ? (el as HTMLElement).checkVisibility({ visibilityProperty: true } as never) : true;
      if (!visible) continue;
      const id = (el as HTMLElement).dataset?.testid;
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (v) out.push({ where: `<${el.tagName.toLowerCase()}${id ? ` data-testid="${id}"` : ''}> ${a}`, text: v });
      }
    }
    // The live value of every visible text-entry control: `innerText` does not include it, and
    // the project's name is one (the tab's `<input>`, `TabBar.svelte`), the very place the
    // desktop app showed `tabBar.newStructure`.
    for (const el of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'input:not([type]), input[type="text"], input[type="search"], input[type="number"], textarea',
    )) {
      const visible = typeof el.checkVisibility === 'function' ? el.checkVisibility({ visibilityProperty: true } as never) : true;
      if (!visible || !el.value) continue;
      const id = el.dataset?.testid;
      out.push({ where: `<${el.tagName.toLowerCase()}${id ? ` data-testid="${id}"` : ''}${el.className ? ` class="${el.className}"` : ''}> value`, text: el.value });
    }
    // SVG tooltips.
    for (const t of document.querySelectorAll('svg title')) out.push({ where: 'svg <title>', text: t.textContent ?? '' });
    return out;
  });
}

/** Fail, naming each raw key and where it was, if the screen shows one. */
async function expectNoRawKeys(page: Page, screen: string): Promise<void> {
  const hits: string[] = [];
  for (const { where, text } of await shown(page)) {
    for (const h of findRawKeys(text, INDEX)) hits.push(`${h.text} (${h.kind === 'key' ? 'a key' : 'not a key, in a key namespace'}) — ${where}`);
  }
  expect([...new Set(hits)], `raw i18n keys visible on ${screen}`).toEqual([]);
}

/** Basic, booted in a language, nothing else stored. */
async function bootBasic(page: Page, locale: string): Promise<void> {
  await page.addInitScript((loc) => {
    try {
      localStorage.clear();
      localStorage.setItem('stabileo-lang', loc);
      localStorage.setItem('stabileo-lang-manual', '1');
    } catch { /* private mode */ }
  }, locale);
  await page.goto('/app/basic?e2e=1');
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => window.__stabileo?.solverReady() ?? false), { timeout: 60_000 }).toBe(true);
}

/** PRO with its design setting off (the default a new user gets), in a language. */
async function bootProDesignOff(page: Page, locale: string): Promise<void> {
  await page.addInitScript((loc) => {
    try {
      localStorage.clear();
      localStorage.setItem('stabileo-lang', loc);
      localStorage.setItem('stabileo-lang-manual', '1');
    } catch { /* private mode */ }
  }, locale);
  await page.goto(PRO_URL);
  await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => window.__stabileo?.solverReady() ?? false), { timeout: 60_000 }).toBe(true);
}

async function solved(page: Page, before: number): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__stabileo.solveCount()), { timeout: 90_000 }).toBeGreaterThan(before);
}

for (const locale of PUBLIC_LOCALES) {
  test(`@smoke no raw i18n key on the changelog — ${locale}`, async ({ page }) => {
    await page.goto(`/${locale}/changelog/`);
    await expect(page.getByTestId('changelog-entry').first()).toBeVisible({ timeout: 30_000 });
    await expectNoRawKeys(page, `changelog (${locale})`);
  });
}

for (const locale of LOCALES) {
  test.describe(`@smoke no raw i18n key is visible — ${locale}`, () => {
    test(`Basic: empty, settings, project, a solved model, a dialog (${locale})`, async ({ page }) => {
      await bootBasic(page, locale);
      await expect(page.getByTestId('ribbon')).toBeVisible();
      await expectNewProjectName(page, locale);
      await expectNoRawKeys(page, `Basic, empty (${locale})`);

      await page.getByTestId('rb-settings').click();
      await expect(page.locator('[data-testid="basic-panel"][data-panel="settings"]')).toBeVisible();
      await expectNoRawKeys(page, `Basic settings (${locale})`);

      await page.getByTestId('hdr-project').click();
      await expect(page.locator('[data-testid="basic-panel"][data-panel="project"]')).toBeVisible();
      await expectNoRawKeys(page, `Basic project panel (${locale})`);

      await loadModel(page, 'frame-cirsoc-dl');
      await page.getByTestId('rb-cmd-solve').click();
      await expect(page.locator('[data-testid="basic-panel"][data-panel="results"]')).toBeVisible();
      // The result commands come on with results.
      await expect(page.getByTestId('rb-cmd-deformed')).toBeEnabled({ timeout: 60_000 });
      await expectNoRawKeys(page, `Basic results (${locale})`);

      // A dialog: switching a 3D model to 2D.
      await loadModel(page, '3d-portal-frame');
      await page.getByTestId('rb-cmd-dim').click();
      await expect(page.locator('.s2d')).toBeVisible();
      await expectNoRawKeys(page, `the switch-to-2D dialog (${locale})`);
      await page.getByTestId('s2d-cancel').click();
    });

    test(`PRO, design off: empty, settings, a solved model, the automatic loads dialog (${locale})`, async ({ page }) => {
      await bootProDesignOff(page, locale);
      await expect(page.getByTestId('pr-stage-model')).toBeVisible();
      await expectNewProjectName(page, locale);
      await expectNoRawKeys(page, `PRO, empty (${locale})`);

      await page.getByTestId('pro-settings').click();
      await expect(page.getByTestId('cfg-design-in-pro')).toBeVisible();
      await expectNoRawKeys(page, `PRO settings (${locale})`);

      await loadModel(page, 'rc-design-qa-8');
      const before = await page.evaluate(() => window.__stabileo.solveCount());
      await page.getByTestId('pr-stage-analyse').click();
      await page.getByTestId('pr-cmd-solve').click();
      await solved(page, before);
      await expect(page.getByTestId('pr-cmd-axial')).toBeEnabled();
      await page.getByTestId('pr-cmd-axial').click();
      await expectNoRawKeys(page, `PRO results (${locale})`);

      await page.getByTestId('pr-stage-model').click();
      await page.getByTestId('pr-cmd-loads').click();
      await page.getByTestId('pro-auto-loads-btn').click();
      await alSection(page, 'regulations');
      await expect(page.getByTestId('al-regulations')).toBeVisible();
      await expectNoRawKeys(page, `the automatic loads dialog (${locale})`);
    });

    test(`PRO, design on: a solved model and the design desk (${locale})`, async ({ page }) => {
      await bootPro(page, locale);
      await loadModel(page, 'rc-design-qa-8');
      const before = await page.evaluate(() => window.__stabileo.solveCount());
      await page.getByTestId('pr-stage-analyse').click();
      await page.getByTestId('pr-cmd-solve').click();
      await solved(page, before);
      await expectNoRawKeys(page, `PRO results with design on (${locale})`);

      await page.getByTestId('pr-stage-design').click();
      await expect(page.getByTestId('design-desk')).toBeVisible();
      await expectNoRawKeys(page, `the design desk (${locale})`);
    });
  });
}

/*
 * The check itself, on a page: a key put in the window title, a tooltip and the visible text is
 * found in each, so a green run above means the screens had none, not that the reading missed them.
 */
test('@smoke the check finds a raw key in the title, a tooltip and the visible text', async ({ page }) => {
  await bootBasic(page, 'en');
  await page.evaluate(() => {
    document.title = 'tabBar.newStructure';
    const b = document.createElement('button');
    b.textContent = 'design.banner.rerunCodeCheck';
    b.setAttribute('title', 'ribbon.settings');
    b.dataset.testid = 'planted-raw-key';
    document.body.prepend(b);
  });
  // The tab's own name field, as the desktop app showed it: only its live value is the key; the
  // text and the tooltips around it stay clean.
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('input.tab-name');
    if (!input) throw new Error('the project tab has no name field');
    input.value = 'tabBar.newStructure';
  });
  const hits = (await shown(page)).flatMap(({ where, text }) => findRawKeys(text, INDEX).map((h) => `${h.text} @ ${where}`));
  expect(hits).toEqual(expect.arrayContaining([
    'tabBar.newStructure @ document.title',
    'design.banner.rerunCodeCheck @ visible text',
    'ribbon.settings @ <button data-testid="planted-raw-key"> title',
  ]));
  // The tab's value is found as the field's value, and not through the visible text or a title.
  const fromField = hits.filter((h) => h.startsWith('tabBar.newStructure @ <input'));
  expect(fromField).toHaveLength(1);
  expect(fromField[0]).toMatch(/class="tab-name[^"]*"> value$/);
});

test('@smoke the check reads the live value of a text field, and nothing else needs to show the key', async ({ page }) => {
  await bootBasic(page, 'en');
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'text';
    input.dataset.testid = 'planted-raw-key-input';
    input.title = 'Project name';
    document.body.prepend(input);
    input.value = 'tabBar.newStructure';
  });
  const hits = (await shown(page)).flatMap(({ where, text }) => findRawKeys(text, INDEX).map((h) => `${h.text} @ ${where}`));
  expect(hits).toEqual(['tabBar.newStructure @ <input data-testid="planted-raw-key-input"> value']);
});
