import { expect, it } from 'vitest';
import de from '../../i18n/locales/de';
import en from '../../i18n/locales/en';
import es from '../../i18n/locales/es';
import fr from '../../i18n/locales/fr';
import hu from '../../i18n/locales/hu';
import pt from '../../i18n/locales/pt';
import tr from '../../i18n/locales/tr';
import zh from '../../i18n/locales/zh';

const locales = [
  { lang: 'de', dict: de, garage: 'Parkhäuser' },
  { lang: 'en', dict: en, garage: 'car parks' },
  { lang: 'es', dict: es, garage: 'estacionamientos' },
  { lang: 'fr', dict: fr, garage: 'parkings' },
  { lang: 'hu', dict: hu, garage: 'parkolóházak' },
  { lang: 'pt', dict: pt, garage: 'estacionamentos' },
  { lang: 'tr', dict: tr, garage: 'otopark' },
];

it.each(locales)('known wrong result: #1928 — $lang shows Eurocode spectral acceleration as a ratio when using weight', ({ dict }) => {
  expect(dict['loads.ec.seismic.baseShear']).toContain('Fb = (Sd(T1)/g)·W·λ = {sd} × {w} kN × {lambda} = {fb} kN');
});

it.each(locales)('known wrong result: #1928 — $lang shows when the ASCE ordinary roof minimum governs', ({ dict }) => {
  expect(dict['loads.asce7.roofLive']).toContain('Lr = max(12 psf, 20 psf · R1 R2)');
  expect(dict['loads.asce7.roofLive']).toMatch(/R1 R2 ≤ 0[.,]6/);
});

it.each(locales)('$lang preserves the UK National Annex altitude term and TBDY car park group', ({ dict, garage }) => {
  expect(dict['loads.ec.snow.ukSk']).toMatch(/sk = 0[.,]15 \+ \(0[.,]1·Z \+ 0[.,]05\) \+ \(A − 100\)\/525/);
  expect(dict['loads.tr.seismic.use.residential']).toContain(garage);
  expect(dict['loads.tr.seismic.use.residential']).toMatch(/n = 0[.,]30/);
  expect(dict['loads.tr.seismic.use.assembly']).not.toContain(garage);
});

it.skip.each([
  ...locales.map(({ lang, dict }) => ({ lang, dict })),
  { lang: 'zh', dict: zh },
])('known wrong result: #1928 — $lang gives the whole EC2 punching reinforcement averaging width', ({ dict }) => {
  const label = dict['rcSheets.ec2.v.punchingRho'] ?? en['rcSheets.ec2.v.punchingRho'];
  expect(label).toContain('c + 6d');
  expect(label).toContain('3d');
  expect(label).not.toContain('c + 3d');
});
