import { render } from 'svelte/server';
import { expect, it } from 'vitest';
import { i18n, setLocale } from '../../../lib/i18n/store.svelte';
import ScalarFieldViewer from '../ScalarFieldViewer.svelte';
import * as dictionaries from '../scalar-viewer-translations';

const props = { xy: [], cells: [], values: null, range: { min: 0, max: 0 }, title: 'Viewer' };

it.skip.each(['en', 'es', 'pt'] as const)('renders keyboard help in the active %s locale (known wrong result: #2286)', locale => {
  const before = i18n.locale;
  setLocale(locale);
  try {
    const { body } = render(ScalarFieldViewer, { props });
    expect(body).toContain(`title="${dictionaries[locale]['scalarViewer.keyboard']}"`);
  } finally {
    setLocale(before);
  }
});

it.skip.each(['en', 'es', 'pt'] as const)('renders keyboard help in the explicit %s locale with chrome hidden (known wrong result: #2286)', locale => {
  const { body } = render(ScalarFieldViewer, { props: { ...props, locale, chrome: false } });
  expect(body).toContain(`title="${dictionaries[locale]['scalarViewer.keyboard']}"`);
});
