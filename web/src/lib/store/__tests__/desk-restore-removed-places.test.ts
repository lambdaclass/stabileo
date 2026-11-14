import { describe, expect, it } from 'vitest';
import { deskUi, type DeskViewState } from '../design-desk-ui.svelte';

const saved = (tab: string): DeskViewState => ({
  ...deskUi.capture(), tab: tab as DeskViewState['tab'],
});

describe('a design tab saved on a place that no longer exists', () => {
  it.each(['detailing', 'documents', 'listings'])('restores %s onto the plan', (tab) => {
    deskUi.restore(saved(tab), false);
    expect(deskUi.tab).toBe('plan');
  });

  it('keeps a place that still exists', () => {
    deskUi.restore(saved('sheets'), false);
    expect(deskUi.tab).toBe('sheets');
  });
});
