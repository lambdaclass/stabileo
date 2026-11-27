import { describe, it, expect, afterEach, vi } from 'vitest';
import { modelStore, uiStore } from '../index';
import { requestAutosave, resetAutosaveService } from '../autosave-service';
import { examLock } from '../exam-lock.svelte';
import { saveWorkspaceSettled, saveWorkspaceToLocalStorage } from '../file';

describe('a model only being looked at', () => {
  afterEach(() => { uiStore.viewerMode = false; uiStore.embedMode = false; examLock.reset(); resetAutosaveService(); });

  it('never takes the autosave slot, in the viewer or embedded', async () => {
    modelStore.clear();
    modelStore.addNode(0, 0, 0);
    uiStore.viewerMode = true;
    expect(await requestAutosave('timer')).toBeNull();
    uiStore.viewerMode = false;
    uiStore.embedMode = true;
    expect(await requestAutosave('manual')).toBeNull();
  });

  it('never takes it from the exam room, whose canvas holds the exercise and not the reader\'s work', async () => {
    modelStore.clear();
    modelStore.addNode(0, 0, 0);
    examLock.enterRoom();
    expect(await requestAutosave('timer')).toBeNull();
    examLock.leaveRoom();
    expect(examLock.holdsWorkspace).toBe(false);
  });

  it('never writes the reader\'s saved tabs from the exam room, not even through a settled save', async () => {
    const stored = new Map([['stabileo-workspace', 'the reader\'s tabs']]);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => stored.get(k) ?? null,
      setItem: (k: string, v: string) => { stored.set(k, v); },
      removeItem: (k: string) => { stored.delete(k); },
    });
    modelStore.clear();
    modelStore.addNode(0, 0, 0);
    examLock.enterRoom();
    expect(saveWorkspaceToLocalStorage()).toBe(false);
    expect(await saveWorkspaceSettled()).toBe(false);
    expect(stored.get('stabileo-workspace')).toBe('the reader\'s tabs');
    vi.unstubAllGlobals();
  });
});
