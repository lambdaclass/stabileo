import { afterEach, describe, expect, it } from 'vitest';
import { uiStore } from '../../store/ui.svelte';
import { openProTabFromQuery } from '../pro-tab-link';

const q = (s: string) => new URLSearchParams(s);

describe('?proTab opens PRO on one of its views', () => {
  afterEach(() => { uiStore.proActiveTab = 'nodes'; uiStore.designInPro = false; });

  it('opens the reinforcement sheets, which design off does not hold back', () => {
    uiStore.designInPro = false;
    openProTabFromQuery(q('example=rc-beam-flexure&proTab=rcSheets'));
    expect(uiStore.proActiveTab).toBe('rcSheets');
  });

  it('ignores a view it does not know', () => {
    openProTabFromQuery(q('proTab=nowhere'));
    expect(uiStore.proActiveTab).toBe('nodes');
  });

  it('asks before opening a place of design while design is off', () => {
    uiStore.designInPro = false;
    openProTabFromQuery(q('proTab=steel'));
    expect(uiStore.proActiveTab).toBe('nodes');
    expect(uiStore.toasts.at(-1)?.actionId).toBe('enable-design-link');
  });
});
