import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const replay = JSON.parse(readFileSync(new URL('../../../research/stability/feher-sipos-varkonyi-2026/reference-results/replay.json', import.meta.url)));
const knownWrong = { skip: process.env.IGNORED ? false : 'known wrong result: #2099' };
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function open(extended = true) {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.addInitScript(({ replay, extended }) => {
    localStorage.setItem('stabileo-feature-research', extended ? '1' : '0');
    window.requests = [];
    window.Worker = class {
      postMessage(settings) { this.settings = settings; window.requests.push(this); }
      terminate() { this.terminated = true; }
      complete(error) {
        const s = this.settings;
        const result = { ...replay, load: s.q, elements: s.elements, distribution: s.half ? 'asymmetric' : 'uniform', corner: [s.theta, s.delta],
          frames: replay.frames.map(f => ({ ...f, ux: Array(s.elements + 1).fill(0), uz: Array(s.elements + 1).fill(0), curvature: Array(s.elements + 1).fill(0) })) };
        this.onmessage({ data: error ? { error } : { result } });
      }
    };
  }, { replay, extended });
  await page.goto(`${process.env.BAUTISTA_URL ?? 'http://127.0.0.1:4099'}/en/research/stability/feher-sipos-varkonyi-2026/`);
  await page.locator('#shape-theta').waitFor();
  return page;
}

async function change(page, id, value, complete = false) {
  await page.locator(`#shape-${id}`).evaluate((el, value) => {
    el.value = String(value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  if (complete) await page.evaluate(() => window.requests.at(-1).complete());
}

async function stale(page, expected) {
  const notice = page.locator('.result-stale');
  assert.equal(await notice.isVisible(), expected);
  assert.equal(await page.locator('.shape-app').getAttribute('data-stale'), String(expected));
}

async function caption(page, text) {
  assert.match(await page.locator('.result-settings').innerText(), text);
}

test('known wrong result: #2099 — completed q=1.5 remains named after q=2 is cancelled', knownWrong, async () => {
  const page = await open();
  try {
    await change(page, 'q', 1.5, true);
    await stale(page, false);
    await change(page, 'q', 2);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await stale(page, true);
    await caption(page, /q = 1\.5/);
    await caption(page, /60/);
    await caption(page, /uniform/i);
    await caption(page, /Θ = 1\.30, Δ = 1\.30/);
    assert.equal(await page.evaluate(() => window.requests.at(-1).terminated), true);
    await page.evaluate(() => window.requests.at(-1).complete());
    await stale(page, true);
    await caption(page, /q = 1\.5/);
  } finally { await page.close(); }
});

for (const [parameter, value] of [['members', 30], ['theta', 1.4], ['delta', 1.4], ['distribution', true]]) {
  test(`known wrong result: #2099 — ${parameter} mismatch stays visible in both result tabs after cancellation or error`, knownWrong, async () => {
    const page = await open();
    try {
      if (parameter === 'distribution') await page.getByRole('radio').nth(1).click();
      else await change(page, parameter, value);
      await stale(page, true);
      await page.evaluate(() => window.requests.at(-1).complete('solver'));
      await stale(page, true);
      await caption(page, /q = 2\.5/);
      await caption(page, /60/);
      await caption(page, /uniform/i);
      await caption(page, /Θ = 1\.30, Δ = 1\.30/);
      await page.locator('[role=tab]').nth(1).click();
      await stale(page, true);
      await page.getByRole('button', { name: 'Recompute live', exact: true }).click();
      await page.evaluate(() => window.requests.at(-1).complete());
      await stale(page, false);
    } finally { await page.close(); }
  });
}

test('known wrong result: #2099 — input during computation, start refusal, paper reset and replay selection track the actual result', knownWrong, async () => {
  const page = await open();
  try {
    await change(page, 'q', 1.5);
    await page.locator('#shape-q').evaluate(el => {
      el.value = '2';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.evaluate(() => window.requests.at(-1).complete());
    await stale(page, true);
    await caption(page, /q = 1\.5/);
    await page.getByRole('button', { name: 'Recompute live', exact: true }).click();
    await page.evaluate(() => window.requests.at(-1).complete('start'));
    await stale(page, true);
    await page.getByRole('button', { name: 'Back to the paper', exact: true }).click();
    await stale(page, false);
    await caption(page, /q = 2\.5/);
    await change(page, 'q', 1.5, true);
    await stale(page, false);
    await page.getByRole('link', { name: 'Shape 1', exact: true }).first().click();
    await stale(page, true);
    await caption(page, /q = 2\.5/);
  } finally { await page.close(); }
});

test('known wrong result: #2099 — baseline corner controls also mark a cancelled result stale', knownWrong, async () => {
  const page = await open(false);
  try {
    await stale(page, false);
    await change(page, 'theta', 1.4);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await stale(page, true);
    await caption(page, /Θ = 1\.30, Δ = 1\.30/);
    await page.getByRole('button', { name: 'Recompute live', exact: true }).click();
    await page.evaluate(() => window.requests.at(-1).complete());
    await stale(page, false);
    await caption(page, /Θ = 1\.40, Δ = 1\.30/);
  } finally { await page.close(); }
});
