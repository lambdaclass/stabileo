/**
 * The typed fields of the wind's dynamics (`ProWindDynamics`): β, n₁ and e_R per wind axis.
 *
 * They were read with `Number(s.replace(',', '.'))`, which took "3 m" and "1.234,5" for nothing:
 * e_R became 0, and n₁ "0.8 Hz" erased the frequency, so the plan refused a direction the reader
 * had given. They read as every other number the app takes (`parseDecimal`): a blank field is a
 * value not given, and text that does not read keeps the value there was, which the field shows
 * again.
 */
import { parseDecimal } from '../../lib/utils/numeric-input';

/** β as the field shows it: a percentage, with the decimal comma the dialog writes it with. */
export function betaText(beta: number): string {
  return String(Math.round(beta * 1000) / 10).replace('.', ',');
}

/** A typed β, %, as a fraction of critical; null when it does not read or is not within (0, 20) %. */
export function readBeta(raw: string): number | null {
  const v = parseDecimal(raw);
  return v !== null && v > 0 && v < 20 ? v / 100 : null;
}

/** A typed n₁, Hz: blank is none given; text that does not read, or no frequency (≤ 0), keeps `previous`. */
export function readN1(raw: string, previous: number | undefined): number | undefined {
  if (raw.trim() === '') return undefined;
  const v = parseDecimal(raw);
  return v !== null && v > 0 ? v : previous;
}

/** A typed e_R, m, either sign: blank is none given (read as 0); text that does not read keeps `previous`. */
export function readER(raw: string, previous: number | undefined): number | undefined {
  if (raw.trim() === '') return undefined;
  return parseDecimal(raw) ?? previous;
}
