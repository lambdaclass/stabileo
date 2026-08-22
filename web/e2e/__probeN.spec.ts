import { test, designAll, loadModel } from './fixtures';
test.use({ viewport: { width: 1280, height: 720 } });
for (const dim of [{b:0.12,h:0.15},{b:0.09,h:0.12}]) {
  test(`PROBE one section ${dim.b}x${dim.h}`, async ({ pro: page }) => {
    test.slow(); test.setTimeout(900_000);
    await loadModel(page, 'rc-design-qa-8');
    await designAll(page);
    await page.evaluate((d) => {
      const w = window as never as { __stabileoActions: { updateSection(i:number,x:unknown):void } };
      w.__stabileoActions.updateSection(1, d);
    }, dim);
    await page.waitForTimeout(300);
    const t0 = Date.now();
    await designAll(page);
    await page.getByTestId('pr-stage-design').click();
    await page.getByTestId('pr-cmd-design').click();
    const counts = await page.evaluate(() => {
      const m: Record<string,number> = {};
      for (const el of document.querySelectorAll('[data-outcome]')) { const o=el.getAttribute('data-outcome')||'?'; m[o]=(m[o]||0)+1; }
      return m;
    });
    console.log(`PROBE ${dim.b}x${dim.h} in ${Math.round((Date.now()-t0)/1000)}s → ` + JSON.stringify(counts));
  });
}
