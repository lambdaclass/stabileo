/**
 * The committed footing project, opened through the production file input. Shared by the CAD
 * handoff journeys and the design desk's footing editor.
 */
import { expect, openBasicProjectPanel } from './fixtures';
import type { Page } from '@playwright/test';

const FIXTURE = new URL(
  '../src/lib/export/__fixtures__/rc-footing-cad-poc.ded.json', import.meta.url).pathname;

/**
 * Open the committed project through the production file input.
 *
 * The journey does what a user does: switch to Básico, open the saved project, and let the
 * project put the app back into PRO. `deserializeProject` restores `analysisMode`,
 * `uiStore.appMode` derives from it, and the fixture is saved as the PRO project it is. No
 * test-only load hook is involved at any point.
 *
 * ── Why the Básico route, now that PRO has its own ─────────────────
 *
 * PR20 gave PRO a Project view with its own Open (`pr-project` → `pp-open`), and
 * `pro-project-files.spec.ts` covers it. This helper deliberately keeps the OTHER route,
 * because the assertion below — that the app lands back in PRO without the test putting it
 * there — only means something if the file was opened from somewhere else.
 *
 * What did change is where Básico keeps the control. PR20 replaced Básico's left toolbar with a
 * ribbon and a panel, so `ToolbarProject` — the same component, the same input — now renders
 * inside the panel that `hdr-project` opens. Without that click the input is not on the page at
 * all, which is why every test in this file was failing.
 */
export async function openCommittedProject(page: Page) {
  // First button in the mode toggle is Básico. Selected structurally rather than by label, so
  // the Spanish journeys below use the same helper.
  await page.locator('[data-tour="mode-toggle"] button').first().click();
  // Desktop Básico is the ribbon, and the project controls live in a panel it opens —
  // `BasicPanel` renders `ToolbarProject`, so nothing is attached until the panel is.
  // This helper was written before the ribbon reached this branch and reached straight
  // for the input, which no longer exists on load. The click goes through the shared
  // opener: `hdr-project` toggles, so an unconditional click can CLOSE the panel.
  await openBasicProjectPanel(page);
  const input = page.getByTestId('project-open-file');
  await expect(input).toBeAttached();
  await input.setInputFiles(FIXTURE);

  // Wait on real state: the restored project carries eight elements and has returned the app to
  // PRO on its own, because that is the mode it was saved in.
  await expect
    .poll(() => page.evaluate(() => window.__stabileo.elementIds().length), { timeout: 30_000 })
    .toBe(8);
  // The app body carries the PRO layout class only when `uiStore.appMode` is 'pro', so this is
  // the assertion that the opened project — not the test — put the app back into PRO.
  await expect(page.locator('.app-body-pro')).toBeAttached();
}

