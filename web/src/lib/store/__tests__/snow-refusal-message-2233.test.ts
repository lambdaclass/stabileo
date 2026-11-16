import { expect, it } from 'vitest';
import { expandCombinations } from '../../engine/loads/combination-cases';
import { runEngineAction, runEngineActionAsync, engineGuarded, errorText } from '../engine-action';
import { uiStore } from '../ui.svelte';
import { setLocale, t } from '../../i18n';

const regression = it.skipIf(process.env.SNOW_ROUND5_REPRO !== '1');

regression('known wrong result: #2233 snow refusals translate at every engine action boundary', async () => {
  let refusal: unknown;
  try {
    expandCombinations([{ id: 'flat', label: 'flat', refs: [], terms: [{ symbol: 'S', factor: 1, snowBasis: 'flatRoof' }] }], []);
  } catch (error) { refusal = error; }
  expect(refusal).toBeInstanceOf(Error);
  try {
    for (const locale of ['en', 'es'] as const) {
      setLocale(locale);
      const message = t('snow.refused.flatRoofCase');
      expect(message).not.toBe('snow.refused.flatRoofCase');
      expect(errorText(refusal)).toBe(message);
      const action = () => { throw refusal; };
      expect(runEngineAction(action)).toBeUndefined();
      expect(uiStore.toasts.at(-1)).toMatchObject({ type: 'error', message });
      await expect(runEngineActionAsync(async () => action())).resolves.toBeUndefined();
      expect(uiStore.toasts.at(-1)).toMatchObject({ type: 'error', message });
      expect(engineGuarded(action)).toEqual({ value: null, error: message });
    }
    expect(() => runEngineAction(() => { throw new TypeError('defect'); })).toThrow(TypeError);
    expect(runEngineAction(() => 7)).toBe(7);
  } finally { setLocale('en'); }
});
