/**
 * Numbers for research pages: the page language's decimal separator, a true minus sign (U+2212),
 * scientific values as "1.6 × 10⁻¹²" (rendered with markup by callers), and a narrow no-break
 * space between a number and its unit (SI Brochure §5.4.3).
 */
import { publicI18n } from '../../../lib/i18n/store.svelte';

export const MINUS = '−';
export const THIN = ' ';

type Opts = { dp?: number; sig?: number; locale?: string };

function loc(o: Opts) {
  return o.locale ?? publicI18n.locale ?? 'en';
}

export function num(v: number, o: Opts = {}): string {
  if (!Number.isFinite(v)) return String(v);
  const f = new Intl.NumberFormat(loc(o), {
    useGrouping: false,
    ...(o.sig !== undefined ? { maximumSignificantDigits: o.sig } : { minimumFractionDigits: o.dp ?? 0, maximumFractionDigits: o.dp ?? 6 }),
  });
  return f.format(v === 0 ? 0 : v).replace('-', MINUS);
}

/** Mantissa and exponent for "m × 10^e"; the caller renders the exponent as a superscript. */
export function sci(v: number, sig = 2, locale?: string): { mantissa: string; exp: string } {
  if (v === 0) return { mantissa: '0', exp: '' };
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / 10 ** e;
  return { mantissa: num(Number(m.toPrecision(sig)), { sig, locale }), exp: num(e, { locale }) };
}

/** A number with its unit, joined by a narrow no-break space. */
export function qty(v: number, unit: string, o: Opts = {}): string {
  return unit ? `${num(v, o)}${THIN}${unit}` : num(v, o);
}

export function tickDecimals(step: number): number {
  const exponent = Math.floor(Math.log10(step) + 1e-9);
  const fractional = Math.abs(step / 10 ** exponent - 2.5) < 1e-9;
  return Math.max(0, -exponent + Number(fractional));
}
