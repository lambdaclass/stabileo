import { render } from 'svelte/server';
import { expect, it } from 'vitest';
import { PUBLIC_LOCALES } from '../../../../lib/i18n/offered';
import { publicI18n, setLocale } from '../../../../lib/i18n/store.svelte';
import ShauerArticle from '../ShauerArticle.svelte';

it.skip.each(PUBLIC_LOCALES)('known wrong result: #2613 — publishes the history update exactly once in the %s article', locale => {
  const original = publicI18n.locale;
  try {
    setLocale(locale);
    const { body } = render(ShauerArticle, { props: { frames: [], showsReference: false } });
    expect(body.match(/H = max\(0, H_prev, ψ\)/g)).toHaveLength(1);
  } finally {
    setLocale(original);
  }
});
