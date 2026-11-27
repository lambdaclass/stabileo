import { afterEach, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { publicI18n, setLocale } from '../../../lib/i18n/store.svelte';
import Gallery from '../Gallery.svelte';
import RiserPage from '../gayNeto2014/RiserPage.svelte';
import ArchPage from '../heyman1966/ArchPage.svelte';
import CqcPage from '../cqc1981/CqcPage.svelte';
import validation from '../../../../../research/benchmarks/cqc-1981/VALIDATION.json';

const original = publicI18n.locale;
afterEach(() => setLocale(original));

it.skip.each([Gallery, RiserPage])('known wrong result: #2595 — the Italian riser lead locates the peak magnitude on the suspended side', component => {
  setLocale('it');
  expect(render(component).body).toContain('massimo in valore assoluto nel tratto sospeso vicino al fondale');
});

it.skip('known wrong result: #2595 — the Italian CQC article accounts for each native validation quantity', () => {
  setLocale('it');
  const paragraph = render(CqcPage).body.match(/<p[^>]*>(Limite di regressione[^<]+)<\/p>/)?.[1];
  expect(paragraph).toContain('le frequenze dei due modi');
  expect(paragraph).toContain('la somma delle masse modali efficaci in X');
  expect(paragraph).toContain('per ciascuna regola (SRSS e CQC), il taglio alla base e gli spostamenti in X dei nodi di copertura 5 e 6');
  expect(paragraph).toContain(`(${validation.checks.length} verifiche)`);
});

it.skip('known wrong result: #2595 — the Italian arch article identifies the weight and tangency assumptions of the Heyman comparison', () => {
  setLocale('it');
  const paragraph = render(ArchPage).body.match(/<p[^>]*>(La stessa tabella[^<]+)<\/p>/)?.[1];
  expect(paragraph).toContain('peso distribuito lungo la linea d’asse');
  expect(paragraph).toContain('condizione di tangenza diversa da quella di Milankovitch');
});
