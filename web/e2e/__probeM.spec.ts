import { test, designAll, loadModel } from './fixtures';
test.use({ viewport: { width: 1280, height: 720 } });
test('PROBE section change takes', async ({ pro: page }) => {
  test.slow(); test.setTimeout(600_000);
  await loadModel(page, 'rc-design-qa-8');
  await designAll(page);
  await page.getByTestId('pr-stage-design').click();
  await page.getByTestId('pr-cmd-design').click();
  const rowText = async () => (await page.locator('[data-outcome]').first().innerText()).replace(/\n/g,' | ').slice(0,110);
  console.log('PROBE row before: ' + await rowText());
  await page.evaluate(() => {
    const w = window as never as { __stabileoActions: { updateSection(i:number,d:unknown):void } };
    for (let id = 1; id <= 8; id++) w.__stabileoActions.updateSection(id, { b: 0.05, h: 0.06 });
  });
  await page.waitForTimeout(400);
  console.log('PROBE row after patch: ' + await rowText());
  await designAll(page);
  await page.getByTestId('pr-stage-design').click();
  await page.getByTestId('pr-cmd-design').click();
  const counts = await page.evaluate(() => {
    const m: Record<string, number> = {};
    for (const el of document.querySelectorAll('[data-outcome]')) { const o = el.getAttribute('data-outcome')||'(empty)'; m[o]=(m[o]||0)+1; }
    return m;
  });
  console.log('PROBE outcomes after redesign: ' + JSON.stringify(counts));
  console.log('PROBE row final: ' + await rowText());
});
