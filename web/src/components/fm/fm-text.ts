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
    if (g.is3D) {
      /* 3D: forces along x, y, z and moments about them; 0 is the normal on an inclined support. */
      const inclined = sup && sup.restrained.length === 6 && sup.restrained[0] && !sup.restrained[1] && !sup.restrained[2] && r.component === 0;
      const key = inclined ? 'fm.x3.normal' : `fm.x3.reaction${r.component}`;
      return t(key).replace('{node}', String(r.nodeId));
    }
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

/** "Rx", "Rz", "M" — or "Rn" on a node that has its own axes; six names in 3D. */
export function componentName(c: number, rotated = false, is3D = false): string {
  if (is3D) return rotated && c === 0 ? 'Rn' : ['Rx', 'Ry', 'Rz', 'Mx', 'My', 'Mz'][c];
  if (c === 2) return 'M';
  if (rotated) return c === 0 ? 'Rt' : 'Rn';
  return c === 0 ? 'Rx' : 'Rz';
}

/** Units of a redundant: moments in kN·m, forces in kN. */
export function redundantUnit(r: Redundant, is3D = false): string {
  const moment = r.kind === 'cutM' || r.kind === 'cutMy' || r.kind === 'cutMz' || r.kind === 'cutT'
    || (r.kind === 'reaction' && (is3D ? (r.component ?? 0) >= 3 : r.component === 2));
  return moment ? 'kN·m' : 'kN';
}
