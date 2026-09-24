/**
 * Words and numbers the flexibility-method steps share: what each redundant
 * is called, subscripts, and a number format that reads well both for a
 * reaction of 45 kN and for a flexibility coefficient of 1e-5 m/kN.
 */
import { t } from '../../lib/i18n';
import type { Redundant, Geometry } from '../../lib/engine/force-method/solve';

export function sub(n: number | string): string {
  return String(n).split('').map((d) => ('0123456789'.includes(d) ? '₀₁₂₃₄₅₆₇₈₉'[Number(d)] : d)).join('');
}

export const xName = (i: number) => `X${sub(i)}`;

export function redundantText(r: Redundant, g: Geometry): string {
  if (r.kind === 'reaction') {
    const sup = g.supports.find((s) => s.nodeId === r.nodeId);
    const key = r.component === 1 && sup?.angle !== undefined ? 'fm.x.reaction1n' : `fm.x.reaction${r.component}`;
    return t(key).replace('{node}', String(r.nodeId));
  }
  return t(`fm.x.${r.kind}`)
    .replace('{el}', String(r.elementId))
    .replace('{end}', r.end === 'J' ? 'j' : 'i');
}

/** Engineering format: fixed where it is readable, scientific where it is not. */
export function num(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a < 1e-12) return '0';
  if (a >= 1e5 || a < 1e-3) return v.toExponential(digits - 1);
  return v.toFixed(a >= 100 ? 1 : a >= 10 ? 2 : digits);
}

/** "Rx", "Rz", "M" — or "Rn" on a node that has its own axes. */
export function componentName(c: number, rotated = false): string {
  if (c === 2) return 'M';
  if (rotated) return c === 0 ? 'Rt' : 'Rn';
  return c === 0 ? 'Rx' : 'Rz';
}
