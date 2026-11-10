import { test, expect, type Page } from '@playwright/test';
import { drawVariant, seedFrom, type ExerciseParams } from '../src/components/edu/exercise-params';

declare global {
  interface Window {
    __stabileo?: { solverReady?: () => boolean; nodeIds?: () => number[]; nodePosition?: (id: number) => { x: number } | null };
  }
}

const EDU_URL = '/app/education';
const TITLE = 'E2E parametric beam';
const ID = 'e2e-parametric-beam';
const PARAMS: ExerciseParams = {
  values: { L: { min: 4, max: 8, step: 1, label: 'L', unit: 'm' } },
  supportChoices: [{ support: 1, types: ['rollerX', 'pinned'] }],
};

const variantFor = (legajo: string) => drawVariant(PARAMS, seedFrom(`${ID}:${legajo}`));

/** Two legajos of one class whose spans differ, so the spec does not depend on luck. */
function twoStudents(): [string, string] {
  const a = 'A1001';
  for (let i = 1002; i < 1100; i++) {
    const b = `A${i}`;
    if (variantFor(b).values.L !== variantFor(a).values.L) return [a, b];
  }
  throw new Error('no two legajos with different spans');
}

async function boot(page: Page, url: string) {
  await page.addInitScript(() => {
    try {
      if (sessionStorage.getItem('e2e-booted')) return;
      sessionStorage.setItem('e2e-booted', '1');
      localStorage.clear();
      localStorage.setItem('stabileo-lang', 'en');
      localStorage.setItem('stabileo-lang-manual', '1');
    } catch { /* private mode */ }
  });
  await go(page, url);
}

let visit = 0;

/** A fresh query on every visit: a URL that differs only in its hash would not reload the page. */
async function go(page: Page, url: string) {
  const [path, hash] = url.split('#');
  await page.goto(`${path}${path!.includes('?') ? '&' : '?'}e2e=1&visit=${++visit}${hash ? '#' + hash : ''}`);
  await expect(page.locator('.edu-panel')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => window.__stabileo?.solverReady?.() === true, null, { timeout: 45_000 });
}

async function span(page: Page): Promise<number> {
  return page.evaluate(() => {
    const h = window.__stabileo!;
    return Math.max(...h.nodeIds!().map((id) => h.nodePosition!(id)!.x));
  });
}

/** Solves the student's own beam (q = 10 kN/m over L) and hands it in as a code. */
async function solveAndHandIn(page: Page, legajo: string): Promise<{ code: string; L: number }> {
  await expect(page.getByTestId('edu-variant-gate')).toBeVisible();
  await expect(page.getByTestId('edu-practice'), 'a handed-out exercise offers no random data').toHaveCount(0);
  await page.getByTestId('edu-legajo').fill(legajo);
  await page.getByTestId('edu-legajo-start').click();
  await expect(page.locator('.exercise-view')).toHaveAttribute('data-solved', 'yes', { timeout: 30_000 });
  await expect(page.getByTestId('edu-variant-who')).toContainText(legajo);

  const L = await span(page);
  const v = variantFor(legajo);
  expect(L, 'the canvas holds the variant of this legajo').toBeCloseTo(v.values.L!, 6);
  await expect(page.locator('.exercise-description')).toContainText(`${v.values.L} m`);

  const reactions = page.locator('.dof-input');
  const pinnedB = v.supports[1] === 'pinned';
  await expect(reactions, 'support B asks for the reactions its type has').toHaveCount(pinnedB ? 4 : 3);
  const fields = reactions.locator('input');
  const values = pinnedB ? ['0', String(5 * L), '0', String(5 * L)] : ['0', String(5 * L), String(5 * L)];
  for (const [i, value] of values.entries()) await fields.nth(i).fill(value);
  await page.locator('.verify-btn').first().click();
  await expect(page.getByTestId('edu-step-1')).toHaveClass(/done/);

  await page.getByTestId('edu-step-3').click();
  await page.locator('.char-input input').first().fill(String(1.25 * L * L));
  await page.locator('.verify-btn').last().click();
  await expect(page.getByTestId('edu-step-3')).toHaveClass(/done/);

  await page.locator('.handin-name input').fill(`Student ${legajo}`);
  await page.getByTestId('edu-handin-code').click();
  return { code: await page.locator('.handin-code').inputValue(), L };
}

test.describe('@slow Education — different data for each student', () => {
  test('a teacher makes an exercise vary, two students get two beams, each is marked against their own', async ({ page }) => {
    test.setTimeout(180_000);
    const [legajoA, legajoB] = twoStudents();

    await boot(page, EDU_URL);
    await page.locator('.edu-author-btn').click();
    await page.locator('.src-tab', { hasText: /Example/i }).click();
    await page.locator('.btn-primary', { hasText: /^\s*Load\s*$/ }).click();
    await expect(page.getByTestId('author-params')).toBeVisible({ timeout: 30_000 });

    await page.locator('.author label', { hasText: 'Title' }).locator('input').fill(TITLE);
    await page.locator('.author textarea').fill('Simply supported beam of {L} m under 10 kN/m.');
    await page.locator('.preset', { hasText: 'Mmax' }).click();

    await page.getByTestId('author-params').locator('summary').click();
    await page.getByTestId('param-add').selectOption('segX:0');
    await page.getByTestId('param-min-0').fill('4');
    await page.getByTestId('param-max-0').fill('8');
    await page.getByTestId('param-step-0').fill('1');
    await page.getByTestId('param-support-1-pinned').check();
    await expect(page.getByTestId('author-params').locator('summary')).toContainText('1 values vary · 1 supports vary');
    await page.getByTestId('param-show').click();
    await expect(page.getByTestId('param-lint-ok')).toBeVisible();

    await page.locator('.btn-ghost', { hasText: 'Copy link' }).click();
    const link = await page.locator('.author input.link').inputValue();
    expect(link).toContain('#edu-ex=');
    await page.locator('.btn-primary', { hasText: 'Save to my exercises' }).click();

    const hash = '#' + link.split('#')[1];
    await go(page, EDU_URL + hash);
    const a = await solveAndHandIn(page, legajoA);
    await go(page, EDU_URL + hash);
    const b = await solveAndHandIn(page, legajoB);
    expect(a.L, 'two legajos, two structures').not.toBe(b.L);

    await go(page, EDU_URL);
    for (const [who, sub] of [[legajoA, a], [legajoB, b]] as const) {
      await page.locator('.submit-code').fill(sub.code);
      await page.getByTestId('edu-open-code').click();
      const review = page.locator('.review');
      await expect(review).toBeVisible();
      await expect(review.getByTestId('review-legajo')).toHaveText(who);
      await expect(review.getByTestId('review-variant')).toContainText(`L = ${sub.L} m`);
      await expect(review.getByTestId('review-remarked')).toBeVisible();
      await expect(review.locator('.answers .bad')).toHaveCount(0);
      await expect(review.getByTestId('review-expected').filter({ hasText: (5 * sub.L).toFixed(2) }).first()).toBeVisible();
      await expect(review.getByTestId('review-expected').filter({ hasText: (1.25 * sub.L * sub.L).toFixed(2) })).toHaveCount(1);
      await review.locator('.close').click();
    }
  });
});
