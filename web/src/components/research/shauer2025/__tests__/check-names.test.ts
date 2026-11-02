import { expect, it } from 'vitest';
import validation from '../../../../../../research/fracture/shauer-2025/VALIDATION.json';
import { checkName, hasCheckName } from '../check-names';

it('names every validation check in Spanish and Portuguese, keeping the example prefix', () => {
  for (const { name } of validation.checks) {
    expect(hasCheckName(name), name).toBe(true);
    for (const locale of ['es', 'pt']) expect(checkName(name, locale), `${locale} ${name}`).not.toBe(name);
    expect(checkName(name, 'en')).toBe(name);
  }
  expect(checkName('ex2: nodal damage at the peak step 56', 'es')).toBe('ex2: daño nodal en el paso pico 56');
  expect(checkName('ex9: a check added later', 'es')).toBe('ex9: a check added later');
});
