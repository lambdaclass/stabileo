import { expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { translations } from '../article';
import { setLocale } from '../../../../lib/i18n/store.svelte';

vi.mock('../replay', async (original) => {
  const actual = await original<typeof import('../replay')>();
  return {
    nativeReplay: (c: Parameters<typeof actual.nativeReplay>[0]) => {
      const run = actual.nativeReplay(c);
      return { ...run, frames: run.frames.slice(0, 40), converged: false };
    },
  };
});

it('shows a truncated path as not evaluated, without a limit marker or a 100% error', async () => {
  setLocale('en');
  const { default: Page } = await import('../RiksCrisfieldPage.svelte');
  const { body } = render(Page);
  const copy = translations.en;
  expect(body).toContain(`${copy.checkHeadline}: 1/3 ${copy.passed}`);
  expect(body.match(new RegExp(`>${copy.notEvaluated}<`, 'g'))).toHaveLength(8);
  expect(body).not.toContain('100%');
  expect(body).not.toContain(copy.measuredLimit);
  expect(body).toContain(copy.referenceLimit);
});
