import { publicI18n } from '../../lib/i18n/store.svelte';
export function formatContourLabel(value: number, min: number, max: number, bands = 0): string {
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  const spacing = Math.abs(max - min) / (bands > 0 && bands <= 8 ? bands : 2);
  const decimals = spacing > 0 ? -Math.floor(Math.log10(spacing)) : 1;
  if (magnitude >= 1e4 || magnitude < 1e-2) {
    const precision = Math.min(15, Math.max(1, Math.floor(Math.log10(magnitude)) + decimals));
    return new Intl.NumberFormat(publicI18n.locale, { notation: 'scientific', minimumFractionDigits: precision, maximumFractionDigits: precision }).format(value).replace(/E(-?)(\d+)/, (_, sign, exponent) => `e${sign || '+'}${exponent}`);
  }
  const digits = Math.min(15, Math.max(magnitude >= 100 ? 0 : 1, decimals));
  return new Intl.NumberFormat(publicI18n.locale, {useGrouping: false, minimumFractionDigits: digits, maximumFractionDigits: digits}).format(value);
}
