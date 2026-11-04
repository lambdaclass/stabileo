import { publicI18n } from '../../lib/i18n/store.svelte';
import { formatContourLabel } from './contour-label';

export function formatLocalizedContourLabel(value: number, min: number, max: number, bands = 0, locale = publicI18n.locale): string {
  const separator = new Intl.NumberFormat(locale).formatToParts(0.5).find(part => part.type === 'decimal')?.value ?? '.';
  return formatContourLabel(value, min, max, bands).replace('.', separator);
}
