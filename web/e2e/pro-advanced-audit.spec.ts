import { test, expect, loadModel, solveModel } from './fixtures';

/**
 * Every analysis in the Advanced panel answers when it is pressed.
 *
 * ── Why press all of them, rather than read them ───────────────────
 *
 * There are sixteen, most reached through WASM, and the failure mode they
 * share is silence: a button that runs, throws inside a worker, and leaves
 * the panel exactly as it was. That is indistinguishable from a button that
 * worked and had nothing to report, and it is the reason "check that they all
 * still work" cannot be done by reading — the code for a broken one and a
 * working one differ by an exception nobody sees.
 *
 * So this presses each and requires an ANSWER: either the analysis reports
 * something, or the panel says why it cannot. What it may not do is nothing.
 */
/**
 * The panel is four analyses always on screen and thirteen behind a chip
 * picker, one at a time. A sweep has to walk the chips.
 */
const CHIPS = [
  'timehistory', 'harmonic', 'nolineal', 'imperfections', 't', 'ssi',
  't8', 't9', 't10', 'influenceline3d', 'multicase', 'sectionanalyzer', 'constrained',
];

test.describe('@slow PRO — every advanced analysis answers', () => {
  /* Sixteen real analyses on a real model; the default sixty seconds is for
     a test that presses one button. */
  test.setTimeout(15 * 60_000);

  test('each button reports a result or a reason, never silence', async ({ pro: page }) => {
    await loadModel(page, 'rc-design-qa-8');
    await solveModel(page);
    await page.getByTestId('pr-stage-analyse').click();
    await page.getByTestId('pr-cmd-advanced').click();

    const silent: string[] = [];
    const blocked: string[] = [];
    const answered: string[] = [];

    /** Press one button and wait for its group to say something new. */
    const press = async (btn: ReturnType<typeof page.locator>, name: string) => {
      if (await btn.isDisabled()) { blocked.push(name); return; }
      /*
       * The WHOLE panel, not the button's own group.
       *
       * Anchoring to the nearest `.adv-group`/`.adv-panel` reported seven of
       * these as silent, and they were not: Harmonic answers "Peak amplitude:
       * 0.0041 m — f_res=12.14 Hz" into a SIBLING of the block holding its
       * button. A measurement that mistakes where an answer is printed for
       * the absence of one is worse than no measurement, because it indicts
       * working code.
       */
      const tab = page.locator('.adv-tab');
      const before = (await tab.innerText()).trim();
      await btn.click();
      for (let waited = 0; waited < 20_000; waited += 500) {
        await page.waitForTimeout(500);
        if ((await tab.innerText()).trim() !== before) { answered.push(name); return; }
        if (await page.locator('.adv-error').count() > 0) { answered.push(name); return; }
      }
      silent.push(name);
    };

    // The four that are always on screen.
    const top = page.locator('.adv-group .adv-run-btn');
    for (let i = 0; i < await top.count(); i++) {
      const b = top.nth(i);
      await press(b, ((await b.textContent()) ?? `#${i}`).trim());
    }

    // Then one chip at a time.
    for (const chip of CHIPS) {
      const c = page.getByTestId(`adv-chip-${chip}`);
      if (await c.count() === 0) { silent.push(`${chip} (no chip)`); continue; }
      await c.click();
      await page.waitForTimeout(200);
      const btns = page.locator('.adv-panel .adv-run-btn');
      const n = await btns.count();
      if (n === 0) { silent.push(`${chip} (no run button)`); continue; }
      for (let i = 0; i < n; i++) await press(btns.nth(i), `${chip}#${i}`);
    }

    console.log(`ADV answered=${answered.length} blocked=${blocked.length} silent=${silent.length}`);
    console.log(`ADV blocked: ${blocked.join(', ')}`);
    console.log(`ADV silent: ${silent.join(', ')}`);

    /*
     * A DISABLED button is a fair answer: several of these need input the
     * fixture does not provide — springs, stages, a constraint pair — and
     * refusing until it exists is right. What is not an answer is running and
     * saying nothing.
     */
    expect(silent, `these ran and said nothing: ${silent.join(', ')}`).toEqual([]);
    expect(answered.length, 'several actually ran').toBeGreaterThan(3);
  });
});
