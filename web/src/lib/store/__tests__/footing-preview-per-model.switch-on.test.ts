import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore } from '..';
import { footingPreview } from '../rc-sheets-footing-preview.svelte';

beforeEach(() => { modelStore.clear(); historyStore.clear(); });

describe('the foundation layout shown before one is adopted', () => {
  it('starts at the recommended one and keeps what was picked while the model stays', () => {
    expect(footingPreview.system).toBe('auto');
    footingPreview.system = 'piles';
    footingPreview.compare = true;
    modelStore.addNode(0, 0, 0);
    expect(footingPreview.system).toBe('piles');
    expect(footingPreview.compare).toBe(true);
  });

  it('is the recommended one again, comparing nothing, in another project', () => {
    footingPreview.system = 'piles';
    footingPreview.compare = true;
    modelStore.clear();
    expect(footingPreview.system).toBe('auto');
    expect(footingPreview.compare).toBe(false);
    footingPreview.compare = true;
    expect(footingPreview.system).toBe('auto');
  });
});
