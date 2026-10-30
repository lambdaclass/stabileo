import { test, expect } from '@playwright/test';

import { translations } from '../src/components/research/fairclough2026/translations';
import { PUBLIC_LOCALES } from '../src/lib/i18n/offered';
import result from '../../research/optimisation/fairclough-2026/results/stabileo_results.json' with { type: 'json' };
import reference from '../../research/optimisation/fairclough-2026/reference-results/five-node.json' with { type: 'json' };
import published from '../../research/optimisation/fairclough-2026/reference-results/published_comparison.json' with { type: 'json' };
import validation from '../../research/optimisation/fairclough-2026/VALIDATION.json' with { type: 'json' };

for (const locale of PUBLIC_LOCALES) {
const text = translations[locale];
const format = (v: number, digits = 10) => new Intl.NumberFormat(locale,{maximumSignificantDigits:digits}).format(v);
for (const [width,height] of [[360,800],[390,844],[844,390],[810,1080]]) {
  test(`Fairclough layout and live solve ${locale} ${width}x${height} @smoke`, async ({page}) => {
    await page.setViewportSize({width,height});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto(`/${locale}/research/optimisation/fairclough-2026?e2e=1`);
    await expect(page.getByRole('heading',{name:text.title})).toBeVisible();
    await expect(page.getByTestId('volume')).toHaveText(format(result.layout.volume));
    await expect(page.locator('.rs-viewer-host canvas').first()).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const pane=await page.locator('.rs-viewer-host canvas').first().boundingBox();
    expect(pane!.y).toBeGreaterThanOrEqual(0);
    expect(pane!.y + pane!.height).toBeLessThanOrEqual(height);
    for (const button of await page.locator('.experiment button').all()) {
      const box=await button.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(await button.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
    }
    const canvas = page.locator('.sfv-canvas');
    await canvas.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowUp');
    await page.keyboard.press('+');
    await expect(canvas).toBeFocused();
    const article = page.locator('.rs-shell-article');
    for (const value of [published.checks[0].reference, reference.volume, result.layout.volume]) await expect(article).toContainText(format(value));
    await expect(article).toContainText(format(result.engine.relative_balance_error,3));
    const badges = page.locator('.rs-verify dd');
    expect((await badges.nth(0).innerText()).match(/\d+/g)?.map(Number)).toEqual([validation.checks.filter(c=>c.passed).length, validation.checks.length]);
    expect((await badges.nth(1).innerText()).match(/\d+/g)?.map(Number)).toEqual([published.checks.filter(c=>c.passed).length, published.checks.length]);
    for (const author of [true,false]) {
      await page.getByRole('button',{name:author ? text.author : text.own,exact:true}).click();
      await expect(page.getByTestId('selected-volume')).toHaveText(format(author ? reference.volume : result.layout.volume));
      await expect(page.getByTestId('selected-height')).toHaveText(format(author ? reference.elevations[4] : result.layout.nodes[4][2]));
      await expect(page.locator('.sfv-canvas')).toHaveAttribute('aria-label',new RegExp(author ? text.author : text.own));
    }
    await page.getByRole('button',{name:text.plan,exact:true}).click();
    await page.getByRole('button',{name:text.run,exact:true}).click();
    await expect(page.getByTestId('source')).toContainText(text.cached,{timeout:30000});
    await expect(page.getByTestId('volume')).toHaveText(format(result.layout.volume));
    await page.getByRole('button',{name:text.restart}).click();
    await expect(page.getByTestId('source')).toContainText(text.replay);
    for (const node of await page.locator('.experiment p, .experiment .shell-legend, .experiment .status-value, .experiment .status-label, .experiment .sfv-mark').all()) {
      expect(await node.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
    }
    const editor=page.getByRole('link',{name:`${text.open} · ${text.own}`,exact:true});
    await expect(editor).toHaveAttribute('href',/app\/basic(?:\?e2e=1)?#data=2\./);
    await editor.click();
    await expect(page).toHaveURL(/app\/basic(?:\?e2e=1)?#data=2\./);
    await expect(page.locator('canvas').first()).toBeVisible();
    await expect.poll(async () => page.evaluate(() => {
      const hooks = (window as unknown as {__stabileo?: {hasDrawnResults(): boolean; nodeCount():number}}).__stabileo;
      return hooks?.hasDrawnResults() ? hooks.nodeCount() : 0;
    }), {timeout:60000}).toBe(129); // slow-ok: The editor initializes WASM and solves the imported 129-node gridshell before drawing results.
    const reaction = await page.evaluate(() => (window as unknown as {__stabileo:{verticalReaction3D():number}}).__stabileo.verticalReaction3D());
    expect(Math.abs(reaction-result.engine.vertical_reaction)/Math.abs(result.engine.vertical_reaction)).toBeLessThan(1e-8);
  });
}

}
