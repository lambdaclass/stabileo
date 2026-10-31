import { test, expect, type Page } from '@playwright/test';
import validation from '../../research/numerical-methods/riks-crisfield/reference-results/VALIDATION.json' with { type: 'json' };
import native from '../../research/numerical-methods/riks-crisfield/reference-results/native-results.json' with { type: 'json' };
import { translations } from '../src/components/research/riksCrisfield/article';

const LOCALES = ['en', 'es', 'pt', 'de', 'fr', 'tr'] as const;
const route = (locale: string) => `/${locale}/research/benchmarks/riks-crisfield/`;
const fmt = (v: number, sig: number, locale: string) =>
  new Intl.NumberFormat(locale, { useGrouping: false, maximumSignificantDigits: sig }).format(v).replace('-', '−');
const summary = (id: string) => validation.caseSummaries.find((s) => s.caseId === id)!;
const nativeCase = (id: string) => native.cases.find((c) => c.id === id)!;

async function pathRows(page: Page) {
  return page.locator('#rs-panel-path tbody tr').evaluateAll((rows) =>
    rows.map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent!.trim())),
  );
}

test.describe('@smoke research riks-crisfield', () => {
  test('the native replay shows every validated number for both cases', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(route('en'));
    const copy = translations.en;
    const app = page.locator('.rs-app');
    const vm = summary('von-mises-truss');
    await expect(app).toHaveAttribute('data-case', 'von-mises-truss');
    await expect(app).toHaveAttribute('data-source', 'replay');
    await expect(app).toHaveAttribute('data-steps', String(vm.steps));
    await expect(page.getByTestId('benchmark-headline')).toHaveText(`${copy.limitHeadline}: 3/3 ${copy.passed}`);
    await expect(page.locator('.sfv canvas').first()).toBeVisible();
    await expect(page.locator('.rs-shell-article')).not.toContainText(/Questions for the authors|full text|pending|provisional|Not compared/);
    await expect(page.locator('.rs-verify')).toContainText(copy.scopeText);
    await expect(page.locator('.rs-citebox')).toContainText(`${copy.arcLengthSnapThroughRiksAndCrisfield}${copy.citationRelation} `);
    await expect(page.locator('table.rs-checks td.pass')).toHaveCount(3);

    await page.locator('#rs-tab-path').click();
    await expect(page.locator('#rs-panel-path svg path')).toHaveCount(2);
    expect(await pathRows(page)).toEqual([
      [copy.limitLoad, fmt(vm.referenceLimitLoad, 6, 'en'), fmt(vm.measuredLimitLoad!, 6, 'en'), `${fmt(vm.limitLoadRelativeError! * 100, 3, 'en')}%`, copy.pass],
      [copy.limitDisplacement, fmt(vm.referenceLimitDisplacement, 6, 'en'), fmt(vm.measuredLimitDisplacement!, 6, 'en'), `${fmt(vm.limitDisplacementRelativeError! * 100, 3, 'en')}%`, copy.pass],
      [copy.pathError, '0', fmt(vm.maxEquilibriumPathError, 6, 'en'), `${fmt(vm.maxEquilibriumPathError * 100, 3, 'en')}%`, copy.pass],
    ]);
    const run = nativeCase('von-mises-truss');
    await expect(page.locator('#rs-panel-path .rs-note')).toHaveText(
      `${run.totalIterations}${copy.totalNewtonIterations}${vm.steps}${copy.convergedPathPointsFinalLoadFactor}${fmt(run.finalLoadFactor, 7, 'en')}${copy.solverConvergedFlag}${run.converged ? copy.yes : copy.no}.`,
    );
    const labels = await page.locator('#rs-panel-path .limit-label').evaluateAll((els) => els.map((el) => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, text: el.textContent }; }));
    expect(labels.map((l) => l.text)).toEqual([copy.referenceLimit, copy.measuredLimit]);
    expect(labels[0].bottom <= labels[1].top || labels[1].bottom <= labels[0].top).toBe(true);
    await expect(page.locator('#rs-panel-path svg')).toHaveAttribute('aria-label', new RegExp(`${copy.referenceLimit}: `));

    await page.locator('#rs-tab-parameters').click();
    await page.locator('#p-case').selectOption('shallow-toggle');
    const st = summary('shallow-toggle');
    await expect(app).toHaveAttribute('data-case', 'shallow-toggle');
    await expect(app).toHaveAttribute('data-steps', String(st.steps));
    await expect(app).toHaveAttribute('data-source', 'replay');
    await expect(app).toHaveAttribute('data-status', 'idle');
    await expect(page.getByTestId('benchmark-headline')).toHaveText(`${copy.frameHeadline}: 1/1 ${copy.passed}`);
    await page.locator('#rs-tab-path').click();
    expect(await pathRows(page)).toEqual([[copy.pathError, '0', fmt(st.maxEquilibriumPathError, 6, 'en'), `${fmt(st.maxEquilibriumPathError * 100, 3, 'en')}%`, copy.pass]]);
    await expect(page.locator('#rs-panel-path .limit-label')).toHaveCount(0);
    await expect(app).toHaveAttribute('data-source', 'replay');
  });

  test('controls recompute through the production WASM wrapper', async ({ page }) => {
    await page.goto(`${route('en')}?case=shallow-toggle&tab=parameters`);
    await page.locator('#p-rise').fill('0.04');
    await page.locator('#p-rise').blur();
    const app = page.locator('.rs-app');
    await expect(app).toHaveAttribute('data-source', 'live');
    await expect(app).toHaveAttribute('data-status', 'done', { timeout: 60_000 }); // slow-ok: The production WASM wrapper completes the 100-step shallow-toggle continuation.
    await expect(app).toHaveAttribute('data-steps', '100');
    await expect(page.locator('.rs-status')).toHaveText(translations.en.done);
    await page.locator('#rs-tab-path').click();
    await expect(page.locator('#rs-panel-path svg path')).toHaveCount(2);
    await expect(page.locator('#rs-panel-path .rs-note')).toContainText(translations.en.totalNewtonIterations);
    await expect(page.locator('#rs-panel-path td.pass')).toHaveCount(1);
  });

  test('Open in Stabileo restores the shared model in the editor', async ({ page }) => {
    await page.goto(route('en'));
    await expect(page.locator('.sfv canvas').first()).toBeVisible();
    await page.getByRole('button', { name: 'Open in the editor', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/basic#code=/);
    await page.goto(page.url().replace('#', '?e2e=1#'));
    await page.waitForFunction(() => !!window.__stabileo, null, { timeout: 10_000 });
    const model = await page.evaluate(() => ({ nodes: window.__stabileo.nodeIds().length, elements: window.__stabileo.elementIds().length }));
    expect(model).toEqual({ nodes: 3, elements: 2 });
  });

  for (const locale of LOCALES) {
    test(`renders the ${locale} page in its own language`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(route(locale));
      const copy = translations[locale];
      const vm = summary('von-mises-truss');
      await expect(page.locator('h1')).toHaveText(copy.arcLengthSnapThroughRiksAndCrisfield);
      await expect(page.locator('h1')).toHaveAttribute('lang', locale);
      await expect(page.locator('.rs-app')).toHaveAttribute('lang', locale);
      await expect(page.getByTestId('benchmark-headline')).toHaveText(`${copy.limitHeadline}: 3/3 ${copy.passed}`);
      await expect(page.getByTestId('rs-mode')).toHaveText(copy.replay);
      await page.locator('#rs-tab-path').click();
      const rows = await pathRows(page);
      expect(rows[0]).toEqual([copy.limitLoad, fmt(vm.referenceLimitLoad, 6, locale), fmt(vm.measuredLimitLoad!, 6, locale), `${fmt(vm.limitLoadRelativeError! * 100, 3, locale)}%`, copy.pass]);
      if (locale !== 'en') await expect(page.locator('.rs-shell')).not.toContainText(translations.en.limitLoad);
    });
  }

  for (const viewport of [{ width: 360, height: 780 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 810, height: 1080 }]) {
    test(`fits, keeps 44 px targets and 12 px text at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(route('en'));
      await expect(page.locator('.sfv canvas').first()).toBeVisible();
      const viewer = (await page.locator('.rs-viewer-slot').boundingBox())!;
      expect(viewer.y + 120).toBeLessThanOrEqual(viewport.height);
      await page.screenshot({ path: testInfo.outputPath(`riks-${viewport.width}x${viewport.height}-page.png`) });

      await page.locator('#rs-tab-viewer').focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('#rs-tab-path')).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('#rs-tab-path')).toBeFocused();

      for (const tab of ['viewer', 'path', 'parameters']) {
        await page.locator(`#rs-tab-${tab}`).click();
        const small = await page.locator('.rs-app').evaluate((root) =>
          [...root.querySelectorAll<HTMLElement>('button, select, input')]
            .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
            .map((el) => ({ el: el.id || el.className || el.tagName, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }))
            .filter((b) => b.width < 44 || b.height < 44),
        );
        expect(small, `${tab} targets`).toEqual([]);
        const tiny = await page.locator('.rs-shell').evaluate((root) => {
          const out: string[] = [];
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const el = n.parentElement!;
            if (!n.textContent!.trim() || !el.getClientRects().length) continue;
            if (parseFloat(getComputedStyle(el).fontSize) < 12) out.push(`${el.tagName}.${el.getAttribute('class')} ${getComputedStyle(el).fontSize}: ${n.textContent!.trim().slice(0, 30)}`);
          }
          return out;
        });
        expect(tiny, `${tab} text`).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (tab === 'path') {
          const labels = await page.locator('#rs-panel-path .limit-label').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
          expect(labels).toHaveLength(2);
          const [a, b] = labels;
          expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true);
        }
        await page.locator('.rs-app').screenshot({ path: testInfo.outputPath(`riks-${viewport.width}x${viewport.height}-${tab}.png`) });
      }
    });
  }
});
