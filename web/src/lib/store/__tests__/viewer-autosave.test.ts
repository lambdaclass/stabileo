import { describe, it, expect, afterEach } from 'vitest';
import { modelStore, uiStore } from '../index';
import { requestAutosave, resetAutosaveService } from '../autosave-service';

describe('a model only being looked at', () => {
  afterEach(() => { uiStore.viewerMode = false; uiStore.embedMode = false; resetAutosaveService(); });

  it('never takes the autosave slot, in the viewer or embedded', async () => {
    modelStore.clear();
    modelStore.addNode(0, 0, 0);
    uiStore.viewerMode = true;
    expect(await requestAutosave('timer')).toBeNull();
    uiStore.viewerMode = false;
    uiStore.embedMode = true;
    expect(await requestAutosave('manual')).toBeNull();
  });
});
