import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import ConvergenceLegend from './ConvergenceLegend.svelte';
import { text } from './i18n';

it('preserves the space after the reference separator in rendered output', () => {
  const { body } = render(ConvergenceLegend, {
    props: { reference: text.en.reference, hasReference: true },
  });
  expect(body.replace(/<!--.*?-->/g, '')).toBe('<p>Authors’ reference · Stabileo</p>');
});

it('labels results without a matching reference', () => {
  const { body } = render(ConvergenceLegend, {
    props: { reference: text.en.reference, hasReference: false },
  });
  expect(body.replace(/<!--.*?-->/g, '')).toBe('<p>Stabileo</p>');
});
