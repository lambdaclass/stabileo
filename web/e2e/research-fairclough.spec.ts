import { test, expect } from '@playwright/test';

for (const [width,height] of [[360,800],[390,844],[844,390],[810,1080]]) {
  test(`Fairclough layout and live solve ${width}x${height} @smoke`, async ({page}) => {
    await page.setViewportSize({width,height});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto('/en/research/optimisation/fairclough-2026?e2e=1');
    await expect(page.getByRole('heading',{name:'A square gridshell under its own weight'})).toBeVisible();
    await expect(page.getByTestId('volume')).toHaveText(/13\.83937/);
    await expect(page.locator('.rs-viewer-host canvas').first()).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const pane=await page.locator('.experiment').boundingBox();
    expect(pane!.y).toBeLessThan(750);
    for (const button of await page.locator('.experiment button').all()) {
      const box=await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(await button.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
    }
    await page.getByRole('button',{name:'Plan',exact:true}).click();
    await page.getByRole('button',{name:'Recompute live',exact:true}).click();
    await expect(page.getByTestId('source')).toContainText('Cached result',{timeout:30000});
    await expect(page.getByTestId('volume')).toHaveText(/13\.83937/);
    await page.getByRole('button',{name:'Restart replay'}).click();
    await expect(page.getByTestId('source')).toContainText('Precomputed replay');
    const editor=page.getByRole('link',{name:'Open in Stabileo',exact:true});
    await expect(editor).toHaveAttribute('href',/app\/basic(?:\?e2e=1)?#data=2\./);
    await editor.click();
    await expect(page).toHaveURL(/app\/basic(?:\?e2e=1)?#data=2\./);
    await expect(page.locator('canvas').first()).toBeVisible();
    await expect.poll(async () => page.evaluate(() => {
      const hooks = (window as unknown as {__stabileo?: {hasDrawnResults(): boolean; nodeCount():number}}).__stabileo;
      return hooks?.hasDrawnResults() ? hooks.nodeCount() : 0;
    }), {timeout:60000}).toBe(129);
  });
}
