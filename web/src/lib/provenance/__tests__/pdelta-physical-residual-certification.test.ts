import { expect, it } from 'vitest';
import entry from '../result-changes/pdelta-physical-residual-certification.json';

it.each([
  ['en', 'Opposite lost moments cannot cancel in a global balance and certify a nonzero physical free residual.'],
  ['es', 'Los momentos opuestos perdidos no pueden cancelarse en el balance global y certificar un residuo libre físico distinto de cero.'],
  ['pt', 'Momentos opostos perdidos não podem se anular no balanço global e certificar um resíduo livre físico não nulo.'],
  ['de', 'Entgegengesetzte verlorene Momente können sich nicht in der globalen Bilanz aufheben und ein von null verschiedenes physikalisches freies Residuum bestätigen.'],
  ['fr', 'Des moments opposés perdus ne peuvent pas se compenser dans le bilan global et certifier un résidu libre physique non nul.'],
  ['tr', 'Kaybolan zıt momentler global dengede birbirini götürerek sıfır olmayan fiziksel serbest artığı doğrulayamaz.'],
] as const)('known wrong result: #1952 — %s explains why global moment cancellation cannot certify the physical residual', (locale, claim) => {
  expect(entry.explanation[locale]).toContain(claim);
});
