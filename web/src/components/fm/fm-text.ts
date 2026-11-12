/**
 * Words and numbers the flexibility-method steps share: what each redundant
 * is called, subscripts, and a number format that reads well both for a
 * reaction of 45 kN and for a flexibility coefficient of 1e-5 m/kN.
 */
import { t } from '../../lib/i18n';
import { along } from '../../lib/axes/display';
import { axesStore } from '../../lib/axes/axes.svelte';
import { planeSigns } from '../../lib/axes/frame';
import type { Redundant, Geometry } from '../../lib/engine/force-method/solve';
import type { ReleaseOption } from '../../lib/engine/force-method/releases';

export function sub(n: number | string): string {
  return String(n).split('').map((d) => ('0123456789'.includes(d) ? '₀₁₂₃₄₅₆₇₈₉'[Number(d)] : d)).join('');
}

export const xName = (i: number) => `X${sub(i)}`;

/** A 3D redundant's text, its axis letter the user's, signed when the user axis points the other way. */
function spaceAxisIn(text: string, k: number): string {
  const a = along(k as 0 | 1 | 2);
  return text.replace(/(?<![A-Za-z])[xyz](?![A-Za-z])/, `${a.sign < 0 ? '−' : ''}${a.name.toLowerCase()}`);
}

export function redundantText(r: Redundant, g: Geometry): string {
  if (r.kind === 'reaction') {
    const sup = g.supports.find((s) => s.nodeId === r.nodeId);
    if (g.is3D) {
      /* 3D: forces along x, y, z and moments about them; 0 is the normal on an inclined support. */
      const inclined = sup && sup.restrained.length === 6 && sup.restrained[0] && !sup.restrained[1] && !sup.restrained[2] && r.component === 0;
      const key = inclined ? 'fm.x3.normal' : `fm.x3.reaction${r.component}`;
      return inclined ? t(key).replace('{node}', String(r.nodeId)) : spaceAxisIn(t(key), (r.component ?? 0) % 3).replace('{node}', String(r.nodeId));
    }
    const key = r.component === 1 && sup?.angle !== undefined ? 'fm.x.reaction1n' : `fm.x.reaction${r.component}`;
    return t(key).replace('{node}', String(r.nodeId));
  }
  if (r.kind === 'spring') return t(`course.statics.x.spring${r.component ?? 1}`).replace('{node}', String(r.nodeId));
  return t(r.hinge ? 'course.statics.x.hinge' : `fm.x.${r.kind}`)
    .replace('{el}', String(r.elementId))
    .replace('{end}', r.end === 'J' ? 'j' : 'i');
}

/** One release the reader can choose, in words. */
export function releaseLabel(o: ReleaseOption, g?: Geometry): string {
  const end = o.end === 'J' ? 'j' : 'i';
  if (o.kind === 'reaction') {
    const inclined = o.component === 1 && g?.supports.find((s) => s.nodeId === o.nodeId)?.angle !== undefined;
    return t(inclined ? 'fm.x.reaction1n' : `fm.x.reaction${o.component}`).replace('{node}', String(o.nodeId));
  }
  if (o.kind === 'spring') return t(`course.statics.x.spring${o.component}`).replace('{node}', String(o.nodeId));
  if (o.kind === 'biela') return t('course.statics.fm.opt.biela').replace('{el}', String(o.elementId));
  const key = o.kind === 'hinge' ? 'course.statics.fm.opt.hinge' : o.count === 2 ? 'course.statics.fm.opt.cutHinged' : 'course.statics.fm.opt.cut';
  return t(key).replace('{el}', String(o.elementId)).replace('{end}', end);
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
  return componentShown(c, rotated, is3D).name;
}

/** A reaction component of the method (model axes) as the user reads it: its name and the sign its value takes. */
export function componentShown(c: number, rotated = false, is3D = false): { name: string; sign: number } {
  if (is3D) {
    if (rotated && c === 0) return { name: 'Rn', sign: 1 };
    const a = along((c % 3) as 0 | 1 | 2);
    return { name: `${c < 3 ? 'R' : 'M'}${a.name.toLowerCase()}`, sign: c < 3 ? a.sign : axesStore.frame.det * a.sign };
  }
  const p = planeSigns(axesStore.frame);
  if (c === 2) return { name: 'M', sign: p.sr };
  if (rotated) return { name: c === 0 ? 'Rt' : 'Rn', sign: 1 };
  return c === 0 ? { name: `R${p.h.toLowerCase()}`, sign: p.sx } : { name: `R${p.v.toLowerCase()}`, sign: p.sz };
}

/** Units of a redundant: moments in kN·m, forces in kN. */
export function redundantUnit(r: Redundant, is3D = false): string {
  const moment = (r.kind === 'spring' && r.component === 2) || r.kind === 'cutM' || r.kind === 'cutMy' || r.kind === 'cutMz' || r.kind === 'cutT'
    || (r.kind === 'reaction' && (is3D ? (r.component ?? 0) >= 3 : r.component === 2));
  return moment ? 'kN·m' : 'kN';
}
