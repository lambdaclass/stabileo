import { expect, it } from 'vitest';
import validation from '../../../../../../research/metamaterials/grossman-2026/VALIDATION.json';
import { checkText, hasCheckText } from '../check-names';

it('gives every validation check name and metric a Spanish and a Portuguese text', () => {
  for (const { name, metric } of validation.checks) {
    for (const text of [name, metric]) {
      expect(hasCheckText(text), text).toBe(true);
      expect(checkText(text, 'en')).toBe(text);
    }
    for (const locale of ['es', 'pt']) expect(checkText(name, locale), `${locale} ${name}`).not.toBe(name);
  }
  expect(checkText('triangular lattice: isotropic', 'pt')).toBe('rede triangular: isotrópica');
});
