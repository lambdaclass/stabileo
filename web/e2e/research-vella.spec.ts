import { test, expect } from '@playwright/test';
import study from '../../research/mechanics/vella-2024/reference-results/study.json' with { type: 'json' };
import replay from '../../research/mechanics/vella-2024/reference-results/replay.json' with { type: 'json' };

const PAGE = '/en/research/mechanics/vella-2024/';

test('@smoke research snap-through: the replay shows a seeded strip that snaps asymmetrically, with the paper comparison', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  const app = page.locator('.snap-app');
  await expect(app).toHaveAttribute('data-source', 'replay');
  await expect(page.locator('.sfv canvas').first()).toBeVisible();
  await expect(app).toHaveAttribute('data-below-threshold', 'false');
  await expect(app.locator('.summary').last()).toContainText('A ≥ 2');
  await expect(page.locator('table.checks').first()).toContainText('ω of the natural state at µ = 1/4');
  await expect(page.locator('table.checks').first()).toContainText('57.86');
  await expect(page.getByText('Research, not a design tool.')).toBeVisible();
  const verify = page.locator('.rs-verify');
  await expect(verify).toContainText('10 of 10 checks pass');
  await expect(verify).toContainText('13 of 16 checks pass');
  await expect(verify.locator('.fail')).toHaveCount(1);
  await expect(page.locator('table.checks tr.failed')).toHaveCount(3);
  await expect(page.locator('table.checks').first()).toContainText('Fig. 2c amplification factor A');
  await page.getByRole('button', { name: 'Show the stability diagram' }).click();
  await expect(app).toHaveAttribute('data-tab', 'stability');
  await page.locator('#rs-tab-rates').click();
  await expect(app).toHaveAttribute('data-tab', 'rates');
  await expect(app).toContainText('Paper, simulations (Fig. 2c)');
});

test('@smoke research snap-through: a fast live release snaps symmetrically, and back to the replay', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  const app = page.locator('.snap-app');
  await page.getByRole('button', { name: 'Try |µ̇| = 0.3' }).click();
  await expect(app).toHaveAttribute('data-source', 'live', { timeout: 60000 }); // slow-ok: the WASM worker traces the static path and integrates the snap in the browser.
  await expect(app).toHaveAttribute('data-rate', '0.3');
  await expect(app).toHaveAttribute('data-below-threshold', 'true');
  await expect(app).toHaveAttribute('data-stale', 'false');
  await app.getByRole('button', { name: 'Back to the replay’s setting' }).click();
  await expect(app).toHaveAttribute('data-source', 'replay');
  await expect(app).toHaveAttribute('data-below-threshold', 'false');
});

test('@smoke research snap-through: the one-clamp protocol recomputes live without a seed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  const app = page.locator('.snap-app');
  await app.getByRole('radio', { name: 'One clamp' }).click();
  await expect(app).toHaveAttribute('data-source', 'live', { timeout: 60000 }); // slow-ok: the WASM worker runs statics and dynamics in the browser.
  await expect(app).toHaveAttribute('data-one-end', 'true');
  await expect(app.locator('#snap-seed')).toBeDisabled();
});

test('@smoke research snap-through: Stop during a live run keeps the shown result and marks the settings as not computed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  const app = page.locator('.snap-app');
  await page.locator('#snap-alpha').fill('0.35');
  await page.locator('#snap-alpha').dispatchEvent('change');
  await expect(app).toHaveAttribute('data-busy', 'true');
  await app.getByRole('button', { name: 'Stop' }).click();
  await expect(app).toHaveAttribute('data-busy', 'false');
  await expect(app).toHaveAttribute('data-source', 'replay');
  await expect(app).toHaveAttribute('data-stale', 'true');
  await expect(app.locator('.result-stale')).toBeVisible();
  await expect(app.locator('.result-stale')).toContainText('Computed with');
  await app.getByRole('button', { name: 'Recompute live' }).click();
  await expect(app).toHaveAttribute('data-source', 'live', { timeout: 60000 }); // slow-ok: a new clamp angle reruns the static path in the browser.
  await expect(app).toHaveAttribute('data-alpha', '0.35');
  await expect(app).toHaveAttribute('data-stale', 'false');
});

test('@smoke reviewed study settings, branch markers and internal checks are inspectable', async ({ page }) => {
  await page.goto(PAGE);
  const own = page.locator('a[href="#internal-checks"]').first();
  await expect(own).toBeVisible();
  await own.click();
  await expect(page.locator('#internal-checks + table tbody tr')).toHaveCount(10);
  await page.locator('#rs-tab-rates').click();
  await expect(page.locator('[data-rate-provenance]')).toContainText('θ₀');
  await page.locator('#rs-tab-stability').click();

  const branch = study.diagram.inverted;
  for (const [chart, mode] of (['omega2_antisymmetric', 'omega2_symmetric'] as const).entries()) {
    const k = branch.findIndex((p, i) => i > 0 && p.spectrum[mode] <= 0 && branch[i - 1].spectrum[mode] > 0);
    const marker = Number(await page.locator('.snap-app [data-marker]').nth(chart).getAttribute('data-marker'));
    expect(Math.abs(marker - branch[k].mu)).toBeLessThanOrEqual(Math.abs(branch[k].mu - branch[k - 1].mu) + 1e-6);
  }
});

test('@smoke only the pending snap request can update playback or report a failure', async ({ page }) => {
  test.fail(true, 'known wrong result: #2320');
  await page.addInitScript(run => {
    const requests: { worker: Worker; requestId: number; settings: typeof run.settings }[] = [];
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, ...options) {
      const settings = message.settings ?? message;
      if (!('oneEnd' in settings)) return Reflect.apply(post, this, [message, ...options]);
      requests.push({ worker: this, requestId: message.requestId, settings });
    };
    window.addEventListener('snap-test-reply', event => {
      const { index, error, truncated } = (event as CustomEvent).detail;
      const { requestId, settings } = requests[index];
      const result = { ...run, settings, outcome: { ...run.outcome, truncated } };
      requests[requests.length - 1].worker.dispatchEvent(new MessageEvent('message', {
        data: error ? { requestId, error } : { requestId, result },
      }));
    });
  }, replay);
  const reply = (index: number, error = false, truncated = false) => page.evaluate(detail => {
    window.dispatchEvent(new CustomEvent('snap-test-reply', { detail }));
  }, { index, error, truncated });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  const app = page.locator('.snap-app');
  await page.getByRole('button', { name: 'Try |µ̇| = 0.3' }).click();
  await reply(0);
  await expect(app).toHaveAttribute('data-source', 'live');
  await app.getByRole('button', { name: 'Recompute live' }).click();
  await reply(0);
  await reply(0, true);
  await expect(app).toHaveAttribute('data-busy', 'true');
  await expect(app.getByRole('alert')).toHaveCount(0);
  await reply(1, false, true);
  await expect(app).toHaveAttribute('data-busy', 'false');
  await expect(app.getByRole('status')).toContainText('Integration stopped early');
  await reply(1, true);
  await expect(app.getByRole('alert')).toHaveCount(0);
  await app.getByRole('button', { name: 'Recompute live' }).click();
  await reply(2, true);
  await expect(app.getByRole('alert')).toBeVisible();
});

test('@smoke the live snap worker seeks a trace-only crossing and rejects missing completion metadata', async ({ page, context }) => {
  test.fail(true, 'known wrong result: #2320');
  const crossing = replay.trace.height.findIndex(height => height > 0);
  const trace = { ...replay.trace, height: replay.trace.height.map((h, i) => i === crossing ? h : Math.min(h, 0)) };
  const frames = [replay.frames[0], ...[trace.t[crossing], trace.t.at(-1)!].map(t => ({ ...replay.frames[0], t }))];
  const sample = { ...replay, frames, trace };
  await context.route('**/research-wasm/vella-2024/*/snap.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `const run = ${JSON.stringify(sample)};
      let first = true;
      export default function init() {}
      export function simulation_run(settings) {
        run.settings = JSON.parse(settings);
        if (first) run.outcome.truncated = true;
        else delete run.outcome.truncated;
        first = false;
        return JSON.stringify(run);
      }`,
  }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(PAGE);
  const app = page.locator('.snap-app');
  await page.getByRole('button', { name: 'Try |µ̇| = 0.3' }).click();
  await expect(app).toHaveAttribute('data-source', 'live');
  await expect(app).toHaveAttribute('data-step', '1');
  await expect(app.getByRole('status')).toContainText('Integration stopped early');
  await app.getByRole('button', { name: 'Recompute live' }).click();
  await expect(app.getByRole('alert')).toBeVisible();
  await expect(app.getByRole('status')).toContainText('Integration stopped early');
});
