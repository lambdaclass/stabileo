import { describe, expect, it } from 'vitest';
import { deskUi, type DeskViewState } from '../design-desk-ui.svelte';

const saved = (tab: string): DeskViewState => ({
  ...deskUi.capture(), tab: tab as DeskViewState['tab'],
});

describe('a design tab saved on a place that no longer exists', () => {
  it.each(['detailing', 'documents', 'listings', 'plan', 'levels', 'list', 'prepare', 'frame', 'column', 'slab', 'footing', 'seismic', 'budget', 'report'])('restores %s onto the steel profiles', (tab) => {
    deskUi.restore(saved(tab), false);
    expect(deskUi.tab).toBe('steel');
  });

  it('keeps a place that still exists', () => {
    deskUi.restore(saved('sheets'), false);
    expect(deskUi.tab).toBe('sheets');
  });

  it('reads a state saved with the level, filter and run fields it no longer keeps', () => {
    deskUi.restore({ open: false, focus: null, tab: 'connections', codesMode: 'memoria', levelZ: 3, filter: 'ok', modelLevelSeen: 3 } as DeskViewState, false);
    expect(deskUi.capture()).toEqual({ open: false, focus: null, tab: 'connections', codesMode: 'memoria' });
  });
});
