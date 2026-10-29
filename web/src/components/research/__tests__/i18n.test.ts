import { expect, it } from 'vitest';
import { publicI18n, setLocale } from '../../../lib/i18n/store.svelte';
import { rs } from '../i18n';

it('attributes reset parameters to reference code in every public locale', () => {
  const original = publicI18n.locale;
  try {
    for (const [locale, expected] of [
      ['en', 'Reset to the reference-code parameters'],
      ['es', 'Restablecer los parámetros del código de referencia'],
      ['pt', 'Restaurar os parâmetros do código de referência'],
    ]) {
      setLocale(locale);
      expect(rs().resetParameters).toBe(expected);
    }
  } finally { setLocale(original); }
});
