import type { Page } from '@playwright/test';

export type DesignOptionTestKey = 'faces' | 'flange' | 'bentBars' | 'slabBentBars' | 'endZones' | 'seismic';

const SECTION: Record<DesignOptionTestKey, string> = { faces: 'analysis', flange: 'analysis', bentBars: 'detailing', slabBentBars: 'detailing', endZones: 'detailing', seismic: 'seismic' };

const isOpen = (page: Page, testId: string) => page.getByTestId(testId).first().evaluate((d) => (d as HTMLDetailsElement).open);

/** Turns a design option on or off from the sheets' panel: its design data, then the option's section, as a person does. */
export async function setDesignOption(page: Page, key: DesignOptionTestKey, on = true): Promise<void> {
  if (!(await isOpen(page, 'rc-design-data'))) await page.getByTestId('rc-dd-edit').click();
  const section = page.getByTestId('rc-design-data').getByTestId(`design-options-${SECTION[key]}`);
  if (!(await section.evaluate((d) => (d as HTMLDetailsElement).open))) await section.locator('> summary').click();
  const box = section.getByTestId(`dd-opt-${key}`);
  if (on) await box.check(); else await box.uncheck();
}
