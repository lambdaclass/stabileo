import { test, expect, type Page } from '@playwright/test';

type Hook = { answer: () => number | null; type: () => string | null; level: (n: number) => void; find: (type: string) => boolean };
const correctIndex = (page: Page) => page.evaluate(() => (window as unknown as { __diagramGame: Hook }).__diagramGame.answer());

test('@smoke diagram game: a right answer scores and explains every option; three mistakes end it and the best score survives a reload', async ({ page }) => {
  const fetched: string[] = [];
  page.on('request', (r) => fetched.push(new URL(r.url()).pathname));
  await page.goto('/en/diagram-game/?e2e=1&seed=12345');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pick the right diagram');
  expect(fetched.some((p) => /\/App-[^/]*\.js$/.test(p))).toBe(false);
  await page.getByTestId('dg-start').click();
  await expect(page.getByTestId('dg-options')).toBeVisible();
  await expect(page.getByTestId('dg-score')).toHaveAttribute('data-score', '0');

  const right = (await correctIndex(page))!;
  expect([0, 1, 2]).toContain(right);
  await page.getByTestId(`dg-option-${right}`).click();
  await expect(page.getByTestId('dg-verdict')).toHaveAttribute('data-correct', 'true');
  const score = Number(await page.getByTestId('dg-score').getAttribute('data-score'));
  expect(score).toBeGreaterThanOrEqual(100);
  await expect(page.getByTestId('dg-points')).toHaveText(`+${score} points`);
  await expect(page.getByTestId('dg-score')).toHaveText(String(score));
  await expect(page.getByTestId(`dg-why-${right}`)).toHaveText('Correct: this is the diagram of this structure.');
  for (const i of [0, 1, 2].filter((i) => i !== right)) {
    await expect(page.getByTestId(`dg-why-${i}`)).not.toHaveAttribute('data-tag', '');
    await expect(page.getByTestId(`dg-why-${i}`)).not.toBeEmpty();
  }

  for (let lives = 2; lives >= 0; lives--) {
    await page.getByTestId('dg-next').click();
    await expect(page.getByTestId('dg-options')).toBeVisible();
    const wrong = ((await correctIndex(page))! + 1) % 3;
    await page.keyboard.press(String(wrong + 1));
    await expect(page.getByTestId('dg-lives')).toHaveAttribute('data-lives', String(lives));
    await expect(page.getByTestId('dg-verdict')).toHaveAttribute('data-correct', 'false');
  }
  await expect(page.getByTestId('dg-again')).toBeVisible();
  await expect(page.getByTestId('dg-new-best')).toBeVisible();
  await expect(page.getByTestId('dg-score')).toHaveAttribute('data-score', String(score));
  await expect(page.getByTestId('dg-stat-rounds')).toHaveText('4');

  await page.reload();
  await expect(page.getByTestId('dg-best-intro')).toContainText(String(score));
});

test('@smoke diagram game: a round that shows one diagram and asks which of four structures it belongs to', async ({ page }) => {
  await page.goto('/es/diagram-game/?e2e=1&seed=99');
  await page.getByTestId('dg-start').click();
  await expect(page.getByTestId('dg-options')).toBeVisible();
  await page.evaluate(() => (window as unknown as { __diagramGame: Hook }).__diagramGame.level(3));
  expect(await page.evaluate(() => (window as unknown as { __diagramGame: Hook }).__diagramGame.find('which'))).toBe(true);
  await expect(page.getByTestId('dg-options')).toHaveAttribute('data-round-type', 'which');
  await expect(page.getByTestId('dg-question')).toContainText('¿Qué estructura');
  await expect(page.getByTestId('dg-options').locator('> li')).toHaveCount(4);
  await expect(page.locator('.problem-figure .support, .problem-figure .load')).toHaveCount(0);
  const right = (await correctIndex(page))!;
  await page.keyboard.press(String(right + 1));
  await expect(page.getByTestId('dg-verdict')).toHaveAttribute('data-correct', 'true');
  await expect(page.getByTestId(`dg-why-${right}`)).toHaveText('Esta estructura da el diagrama de arriba.');
  for (const i of [0, 1, 2, 3].filter((i) => i !== right)) await expect(page.getByTestId(`dg-option-${i}`).locator('.curve').first()).toBeVisible();
  const other = right === 0 ? 1 : 0;
  await page.getByTestId(`dg-option-${other}`).click();
  await expect(page.getByTestId('dg-reason')).toHaveText(`${other + 1}Esta da otro diagrama, que ahora está dibujado encima.`);
  await expect(page.getByTestId('dg-verdict')).toHaveAttribute('data-correct', 'true');
});

const call = (page: Page, f: string, ...args: unknown[]) =>
  page.evaluate(([name, rest]) => (window as unknown as { __diagramGame: Record<string, (...a: unknown[]) => unknown> }).__diagramGame[name as string]!(...(rest as unknown[])), [f, args] as const);

async function fitsOneScreen(page: Page, what: string, minDrawing: number) {
  const m = await page.evaluate(() => {
    const scroller = document.querySelector('.landing')!;
    const inside = (el: Element | null) => {
      if (!el) return true;
      const r = el.getBoundingClientRect();
      return r.top >= -1 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1;
    };
    const parts = ['.hud', '[data-testid="dg-question"]', '.problem-figure', '[data-testid="dg-next"]', '[data-testid="dg-again"]', ...[0, 1, 2, 3].map((i) => `[data-testid="dg-option-${i}"]`)];
    const drawn = [0, 1, 2, 3].flatMap((i) => {
      const svg = document.querySelector(`[data-testid="dg-option-${i}"] svg`);
      if (!svg) return [];
      const boxes = [...svg.querySelectorAll('path')].map((p) => p.getBoundingClientRect()).filter((r) => r.width + r.height > 0);
      const w = Math.max(...boxes.map((r) => r.right)) - Math.min(...boxes.map((r) => r.left));
      const h = Math.max(...boxes.map((r) => r.bottom)) - Math.min(...boxes.map((r) => r.top));
      return [Math.max(w, h)];
    });
    return {
      smallest: Math.min(...drawn),
      down: scroller.scrollHeight - scroller.clientHeight,
      side: Math.max(scroller.scrollWidth - scroller.clientWidth, document.documentElement.scrollWidth - innerWidth),
      outside: parts.filter((sel) => !inside(document.querySelector(sel))),
    };
  });
  expect(m.down, `${what}: vertical scroll`).toBeLessThanOrEqual(0);
  expect(m.side, `${what}: horizontal scroll`).toBeLessThanOrEqual(0);
  expect(m.outside, `${what}: off screen`).toEqual([]);
  expect(m.smallest, `${what}: the smallest option drawing, in px`).toBeGreaterThanOrEqual(minDrawing);
}

async function playThrough(page: Page, label: string, minDrawing: number) {
  await page.goto('/es/diagram-game/?e2e=1&seed=31');
  await page.getByTestId('dg-start').click();
  await expect(page.getByTestId('dg-options')).toBeVisible();
  await fitsOneScreen(page, `${label} first round`, minDrawing);
  await page.getByTestId(`dg-option-${(await correctIndex(page))!}`).click();
  await expect(page.getByTestId('dg-next')).toBeVisible();
  await fitsOneScreen(page, `${label} answered`, minDrawing);
  for (const [level, type, template] of [[3, 'which', undefined], [4, 'odd', 'column-lateral'], [5, 'pick', undefined]] as const) {
    await call(page, 'level', level);
    expect(await call(page, 'find', type, template)).toBe(true);
    await fitsOneScreen(page, `${label} level ${level + 1} ${type}`, minDrawing);
    await page.keyboard.press(String((((await correctIndex(page))! + 1) % 3) + 1));
    await expect(page.getByTestId('dg-verdict')).toHaveAttribute('data-correct', 'false');
    await fitsOneScreen(page, `${label} level ${level + 1} ${type} answered wrong`, minDrawing);
  }
  await expect(page.getByTestId('dg-again')).toBeVisible();
  await fitsOneScreen(page, `${label} game over`, 0);
}

for (const [label, width, height, minDrawing] of [['wide screen', 1440, 900, 150], ['laptop', 1280, 680, 110], ['tablet portrait', 768, 1024, 150]] as const) {
  test(`@smoke diagram game fits one screen on a ${label}, with no scroll either way, through every kind of round`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await playThrough(page, label, minDrawing);
  });
}

test.describe('on a phone', () => {
  test.use({ hasTouch: true, isMobile: true });

  for (const [label, width, height, minDrawing] of [['portrait', 390, 664, 90], ['small portrait', 360, 600, 75], ['landscape', 844, 340, 90], ['small landscape', 667, 300, 70]] as const) {
    test(`@smoke diagram game fits one screen on a phone in ${label}, with no scroll either way`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await playThrough(page, label, minDrawing);
    });
  }

  test('@smoke held upright, the start screen suggests turning the phone; held sideways, it does not', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 664 });
    await page.goto('/es/diagram-game/?e2e=1');
    await expect(page.getByTestId('dg-rotate')).toContainText('Girá el teléfono');
    await page.setViewportSize({ width: 844, height: 340 });
    await expect(page.getByTestId('dg-rotate')).toHaveCount(0);
  });
});

test('@smoke the question names the diagram in its own colour, with its symbol, and quitting keeps the best score and goes back to the start', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/es/diagram-game/?e2e=1&seed=5');
  await page.getByTestId('dg-start').click();
  await expect(page.getByTestId('dg-options')).toBeVisible();
  const term = page.getByTestId('dg-term');
  await expect(term).toHaveText(/^(esfuerzo normal \(N\)|esfuerzo de corte \(Vz\)|momento flector \(My\)|deformada \(δ\))$/);
  const [termColour, textColour] = await term.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el.parentElement!).color]);
  expect(termColour).not.toBe(textColour);
  await page.getByTestId(`dg-option-${(await correctIndex(page))!}`).click();
  const score = await page.getByTestId('dg-score').getAttribute('data-score');
  await page.getByTestId('dg-quit').click();
  await expect(page.getByTestId('dg-start')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('dg-best-intro')).toContainText(score!);
});

test('@slow Educational mode links to the diagram game', async ({ page }) => {
  await page.goto('/app/education?e2e=1');
  await expect(page.locator('.edu-panel')).toBeVisible({ timeout: 45_000 });
  await page.getByTestId('edu-open-game').click();
  await expect(page).toHaveURL(/\/diagram-game\/?$/);
  await expect(page.getByTestId('dg-start')).toBeVisible();
});
