import { expect, it } from 'vitest';
import { tAt, ensureLocale } from '../store.svelte';
import { teAt } from '../engine-text';
import { OFFERED_LOCALES } from '../offered';

it.each(OFFERED_LOCALES)('known wrong result: #1928 the published reinforcement results explain their dispositions in %s', async locale => {
  await ensureLocale(locale);
  const params = { edition: 'edition-token', element: 'member-token', x: 'station-token', mark: 'mark-token', length: 'length-token', stock: 'stock-token' };
  for (const key of ['project.adoptedReinforcementIgnored', 'wall.tensionRequiresBarLayout', 'wall.boundaryBarCount', 'wall.tensionAtOpenings', 'wall.tensionShearEdition', 'detailing.cutoff.unverified', 'detailing.schedule.spliceNote']) {
    const template = tAt(key, locale);
    expect.soft(template, key).not.toBe(key);
    expect.soft(template, key).toBeTruthy();
    const message = teAt({ key, params }, locale);
    for (const [name, value] of Object.entries(params)) {
      if (template.includes(`{${name}}`)) expect(message).toContain(value);
    }
    expect(message).not.toMatch(/\{\w+\}/);
  }
});
