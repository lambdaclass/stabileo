import { test, expect, type Page } from '@playwright/test';
import replay from '../../research/stability/ferrari-sigmund-2025/results/stabileo_results.json' with { type: 'json' };

const disclaimer: Record<string, string> = {
  en: 'Research, not a design tool.',
  es: 'Investigación, no una herramienta de diseño.',
  pt: 'Pesquisa, não uma ferramenta de projeto.',
};
const canvas = (page: Page) => page.locator('.sfv-canvas canvas');
async function expectFrame(page: Page, displacement: number[]) {
  // These diagnostics are written only after a WebGL render: fat frame lines submit triangles.
  await expect.poll(async () => Number(await canvas(page).getAttribute('data-rendered-triangles'))).toBeGreaterThan(0);
  const points = replay.nodes.map((v, i) => v + displacement[i]);
  const xs = points.filter((_, i) => i % 2 === 0);
  const ys = points.filter((_, i) => i % 2 === 1);
  const expected = [Math.min(...xs), Math.min(...ys), 0, Math.max(...xs), Math.max(...ys), 0];
  await expect.poll(async () => {
    const actual: number[] = JSON.parse(await canvas(page).getAttribute('data-geometry-bounds') ?? '[]').flat();
    return actual.length === 6 ? Math.max(...actual.map((v, i) => Math.abs(v - expected[i]))) : Infinity;
  }).toBeLessThan(1e-5);
}

test.describe('Ferrari research', () => {
  test('@slow replays production results, recomputes and can stop and restart', async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/en/research/stability/ferrari-sigmund-2025/');
    await expect(page.getByTestId('ferrari-buckling')).toContainText('2.431356');
    await expect(page.getByTestId('ferrari-source')).toContainText('Precomputed replay');
    // With reduced motion the replay does not autoplay: it opens on the final load step.
    await expectFrame(page, replay.frames.at(-1)!.displacement);
    const slider = page.getByRole('slider');
    await slider.press('End');
    await expectFrame(page, replay.frames.at(-1)!.displacement);
    await slider.press('Home');
    await expectFrame(page, replay.frames[0].displacement);
    await expect(page.getByTestId('ferrari-reference')).toContainText('2.4313');
    await page.getByRole('button', { name: 'Recompute live', exact: true }).click();
    await expect(page.getByTestId('ferrari-source')).toContainText('Cached result', { timeout: 90_000 });
    await expect(page.getByTestId('ferrari-buckling')).toContainText('2.431356');
    await expect(page.getByTestId('ferrari-experiment')).toContainText('0.48837');
    await expectFrame(page, replay.frames.at(-1)!.displacement);
    await page.getByRole('button', { name: 'Recompute live', exact: true }).click();
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Recompute live', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Restart replay', exact: true }).click();
    await expect(page.getByTestId('ferrari-source')).toContainText('Precomputed replay');
  });
  test('@smoke preserves slider selection while live frames arrive', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/en/research/stability/ferrari-sigmund-2025/');
    await expectFrame(page, replay.frames.at(-1)!.displacement);
    // A controlled worker keeps this race deterministic, independent of solver speed.
    await page.evaluate(() => {
      const RealWorker = window.Worker;
      window.Worker = class extends RealWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          this.terminate();
          (window as unknown as { sendFerrari: (data: unknown) => void }).sendFerrari =
            data => this.dispatchEvent(new MessageEvent('message', { data }));
        }
        postMessage() {}
      };
    });
    await page.getByRole('button', { name: 'Recompute live', exact: true }).click();
    const send = (data: unknown) => page.evaluate(data =>
      (window as unknown as { sendFerrari: (data: unknown) => void }).sendFerrari(data), data);
    await send({ kind: 'buckling', lambda: replay.lambda });
    await send({ kind: 'frame', frame: replay.frames[1] });
    await expect(page.getByRole('slider')).toHaveValue('1');
    await page.getByRole('slider').press('Home');
    await send({ kind: 'frame', frame: replay.frames[2] });
    await expect(page.getByRole('slider')).toHaveAttribute('max', '2');
    await expect(page.getByRole('slider')).toHaveValue('0');
    await expectFrame(page, replay.frames[0].displacement);
    await send({ kind: 'done' });
  });
  for (const [width, height] of [[360, 800], [390, 844], [844, 390], [810, 1080]]) {
    for (const locale of ['en', 'es', 'pt']) {
      test(`@smoke ${locale} layout ${width}x${height}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(`/${locale}/research/stability/ferrari-sigmund-2025/`);
        await expectFrame(page, replay.frames.at(-1)!.displacement);
        const experiment = page.getByTestId('ferrari-experiment');
        expect(await page.evaluate(() => scrollY)).toBe(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        // No scrolling before these assertions: controls must be fully usable and a substantial
        // part of the actual model canvas must appear, not merely the experiment's container.
        for (const control of await experiment.locator('.controls button').all()) {
          await expect(control).toBeInViewport({ ratio: 1 });
        }
        await expect(canvas(page)).toBeInViewport({ ratio: 0.5 });
        const run = await experiment.locator('.run').boundingBox();
        const view = await canvas(page).boundingBox();
        expect(run && view).toBeTruthy();
        const overlap = Math.max(0, Math.min(run!.x + run!.width, view!.x + view!.width) - Math.max(run!.x, view!.x))
          * Math.max(0, Math.min(run!.y + run!.height, view!.y + view!.height) - Math.max(run!.y, view!.y));
        expect(overlap).toBe(0);
        await expect(experiment.getByText(disclaimer[locale], { exact: true })).toBeInViewport();
        const content = page.locator('.ferrari-page');
        async function checkTargetsAndText() {
          const violations = await content.evaluate(root => {
            const errors: string[] = [];
            for (const el of root.querySelectorAll('*')) {
              const style = getComputedStyle(el);
              const box = el.getBoundingClientRect();
              if (!box.width || !box.height || style.visibility === 'hidden' || style.display === 'none') continue;
              const label = `${el.tagName}.${el.className}: ${el.textContent?.trim().slice(0, 60)}`;
              const text = [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
              if (text && parseFloat(style.fontSize) < 12) errors.push(`small text ${label}: ${style.fontSize}`);
              const target = el.matches('button, input, select, textarea, a[href], [role="button"], [tabindex="0"]');
              const inlineLink = el.matches('a[href]') && style.display === 'inline';
              if (target && !inlineLink && (box.width < 44 || box.height < 44)) errors.push(`small target ${label}: ${box.width}x${box.height}`);
            }
            return errors;
          });
          expect(violations).toEqual([]);
        }
        await checkTargetsAndText();
        // Explicitly include status values, and the camera menu's otherwise hidden targets.
        for (const value of await experiment.locator('.sfv-status .status-value').all()) {
          expect(await value.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
        }
        await testInfo.attach('initial-viewport', { body: await page.screenshot(), contentType: 'image/png' });
        await experiment.locator('.cam-cube').click();
        await checkTargetsAndText();
        await testInfo.attach('camera-menu', { body: await page.screenshot(), contentType: 'image/png' });
      });
    }
  }
});
