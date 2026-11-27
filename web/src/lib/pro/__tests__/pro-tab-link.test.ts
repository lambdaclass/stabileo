import { afterEach, describe, expect, it } from 'vitest';
import { uiStore } from '../../store/ui.svelte';
import { openProTabFromQuery, PRO_TAB_LINKS } from '../pro-tab-link';

const q = (s: string) => new URLSearchParams(s);

describe('?proTab opens PRO on one of its views', () => {
  afterEach(() => { uiStore.proActiveTab = 'nodes'; uiStore.designInPro = false; });

  it.each(['link', 'restore'])('selects available reinforcement sheets through %s with design off', entry => {
    uiStore.designInPro = false;
    openProTabFromQuery(q('proTab=elements'));
    expect(uiStore.proActiveTab).toBe('elements');
    if (entry === 'link') openProTabFromQuery(q('example=rc-beam-flexure&proTab=rcSheets'));
    else uiStore.proActiveTab = 'rcSheets';
    expect.soft(uiStore.proActiveTab).toBe(__PUBLIC_FEATURES__.proRcSheets ? 'rcSheets' : 'elements');
    expect(PRO_TAB_LINKS.includes('rcSheets')).toBe(!!__PUBLIC_FEATURES__.proRcSheets);
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
