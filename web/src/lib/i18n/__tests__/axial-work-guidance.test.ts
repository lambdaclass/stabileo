import { expect, it } from 'vitest';
import { allDictFor } from '../locales/all';
import { PUBLIC_LOCALES } from '../offered';

it.each(PUBLIC_LOCALES)('known wrong result: #2613 — axial dissipation uses the magnitude of extension in %s', locale => {
  const note = allDictFor(locale)['course.plastic.mech.axialNote'];
  expect(note).toContain('Np·|Δ|');
  expect(note).not.toContain('Np·Δ');
});
