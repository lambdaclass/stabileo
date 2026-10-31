import { publicI18n } from '../../lib/i18n/store.svelte';
import { formatContourLabel } from './contour-label';

const keyboardHints: Record<string, string> = {
  en: 'Arrow keys: orbit. Shift + arrows: pan. Plus/minus: zoom.',
  es: 'Flechas: orbitar. Mayús + flechas: desplazar. Más/menos: zoom.',
  pt: 'Setas: orbitar. Shift + setas: deslocar. Mais/menos: zoom.',
  de: 'Pfeiltasten: drehen. Umschalt + Pfeile: verschieben. Plus/Minus: zoomen.',
  fr: 'Flèches : orbite. Maj + flèches : déplacement. Plus/moins : zoom.',
  tr: 'Oklar: döndür. Shift + oklar: kaydır. Artı/eksi: yakınlaştır.',
};

export const scalarFieldKeyboardHint = () => keyboardHints[publicI18n.locale] ?? keyboardHints.en;

export function formatLocalizedContourLabel(value: number, min: number, max: number, bands = 0): string {
  const separator = new Intl.NumberFormat(publicI18n.locale).formatToParts(0.5).find(part => part.type === 'decimal')?.value ?? '.';
  return formatContourLabel(value, min, max, bands).replace('.', separator);
}
