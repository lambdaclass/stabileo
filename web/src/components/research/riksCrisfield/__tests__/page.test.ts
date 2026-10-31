import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Page from '../RiksCrisfieldPage.svelte';
import Chart from '../PathChart.svelte';
import { articleStrings, translations } from '../article';
import { publicI18n, setLocale } from '../../../../lib/i18n/store.svelte';

const original = publicI18n.locale;
afterEach(() => setLocale(original));

it.each(['en','es','pt','de','fr','tr'] as const)('renders the complete %s page with an honest reference scope', locale => {
  setLocale(locale);
  const copy = articleStrings(locale);
  const { body } = render(Page);
  expect(body).toContain(copy.arcLengthSnapThroughRiksAndCrisfield);
  expect(body).toContain(copy.scopeText);
  expect(body).toContain(copy.limitHeadline);
  expect(body).toContain(`${copy.arcLengthSnapThroughRiksAndCrisfield}${copy.citationRelation} `);
  expect(body).toContain('https://doi.org/10.1016/0020-7683(79)90081-7');
  expect(body).toContain('https://doi.org/10.1016/0045-7949(81)90108-5');
  expect(body.match(/<td class="pass[ "]/g)).toHaveLength(6);
  expect(body).toContain(`lang="${locale}"`);
  expect(Object.keys(translations[locale]).sort()).toEqual(Object.keys(translations.en).sort());
  expect(body).not.toMatch(/Questions for the authors|Not compared:|full text|pending|provisional/);
  expect(body).not.toContain('role="status"');
  if (locale !== 'en') expect(body).not.toContain('Upper limit load');
});
it('lists adjacent limit labels outside the plot area, with an accessible value summary', () => {
  const {body} = render(Chart,{props:{series:[{name:'reference',color:'orange',points:[[0,0],[1,2]]}],limits:[{x:.9,y:2,label:'reference limit'},{x:.901,y:2,label:'measured limit'}],current:{x:.8,y:1.9},xLabel:'v (m)',yLabel:'P (kN)'}});
  const legend = body.match(/<ul class="path-legend[^"]*">([\s\S]*?)<\/ul>/)![1].replace(/<!--[\s\S]*?-->/g, '');
  expect([...legend.matchAll(/<li class="limit-label[^"]*">[\s\S]*?<\/svg>([^<]*)<\/li>/g)].map(m => m[1])).toEqual(['reference limit', 'measured limit']);
  expect(legend).toContain('reference');
  expect(body.split('</svg>')[0]).not.toContain('reference limit<');
  expect(body).toMatch(/aria-label="[^"]*reference limit:[^"]*measured limit:/);
});
