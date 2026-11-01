import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import Page from '../RiksCrisfieldPage.svelte';
import Chart from '../PathChart.svelte';
import { articleStrings, translations } from '../article';
import { publicI18n } from '../../../../lib/i18n/store.svelte';

it.each(['en','es','pt','de','fr','tr'] as const)('renders the complete %s page with an honest reference scope', locale => {
  publicI18n.locale = locale;
  const copy = articleStrings(locale);
  const { body } = render(Page);
  expect(body).toContain(copy.arcLengthSnapThroughRiksAndCrisfield);
  expect(body).toContain(copy.scopeText);
  expect(body).toContain(copy.limitHeadline);
  expect(body).toContain(copy.citationRelation);
  expect(body).toContain(`lang="${locale}"`);
  expect(Object.keys(translations[locale]).sort()).toEqual(Object.keys(translations.en).sort());
  expect(body).not.toMatch(/Questions for the authors|Not compared:|full text|pending|provisional/);
  expect(body).not.toContain('role="status"');
  if (locale !== 'en') expect(body).not.toContain('Upper limit load');
});
it('gives adjacent limit labels separate vertical boxes and an accessible value summary', () => {
  const {body} = render(Chart,{props:{series:[{name:'reference',color:'orange',points:[[0,0],[1,2]]}],limits:[{x:.9,y:2,label:'reference limit'},{x:.901,y:2,label:'measured limit'}],current:{x:.8,y:1.9},xLabel:'v (m)',yLabel:'P (kN)'}});
  const labels = [...body.matchAll(/<text x="([^"]+)" y="([^"]+)" class="limit-label/g)];
  expect(labels).toHaveLength(2);
  expect(Math.abs(Number(labels[0][2])-Number(labels[1][2]))).toBeGreaterThanOrEqual(22);
  expect(body).toMatch(/aria-label="[^"]*reference limit:[^"]*measured limit:/);
});
