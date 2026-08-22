import { test, designAll, loadModel } from './fixtures';
test.use({ viewport: { width: 1280, height: 720 } });
test('PROBE which section', async ({ pro: page }) => {
  test.slow(); test.setTimeout(600_000);
  await loadModel(page, 'rc-design-qa-8');
  await designAll(page);
  await page.getByTestId('pr-stage-design').click();
  await page.getByTestId('pr-cmd-design').click();
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('[data-outcome]')].slice(0,4)
      .map(r => (r as HTMLElement).innerText.replace(/\n+/g,' | ').slice(0,120)));
  console.log('PROBE rows ' + JSON.stringify(rows, null, 0));
  // try each id one at a time, cheap
  for (const id of [2,3,4,5,6]) {
    await page.evaluate((i) => {
      const w = window as never as { __stabileoActions: { updateSection(a:number,b:unknown):void } };
      w.__stabileoActions.updateSection(i, { b: 0.09, h: 0.12 });
    }, id);
    await designAll(page);
    await page.getByTestId('pr-stage-design').click();
    await page.getByTestId('pr-cmd-design').click();
    const c = await page.evaluate(() => {
      const m: Record<string,number> = {};
      for (const el of document.querySelectorAll('[data-outcome]')) { const o=el.getAttribute('data-outcome')||'?'; m[o]=(m[o]||0)+1; }
      return m;
    });
    console.log(`PROBE id=${id} → ` + JSON.stringify(c));
    if (Object.keys(c).some(k=>k!=='VERIFIED')) break;
  }
});
