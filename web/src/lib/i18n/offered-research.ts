import { PUBLIC_LOCALES, type Locale } from './offered';
import { COMPLETE as hu } from './locales/complete/hu';

export function buildPublicLocales(research: boolean): readonly Locale[] {
  const base = PUBLIC_LOCALES.filter(locale => locale !== 'hu');
  return research && hu ? [...base, 'hu'] : base;
}
