import type { Fmt } from './format';
import { check, ratioOf, type CheckLine, type Step } from './types';
import type { GroupColumn, PunchingSection } from './footing-types';

type Punched = Pick<GroupColumn, 'name' | 'punching'>;

const SECTION_CLAUSE: Record<PunchingSection['at'], string> = { column: '§22.6.4.1(a)', outer: '§22.6.4.2, §22.6.6.1', drop: '§22.6.4.1(b)' };

/** A text for a column's stirrups for punching: legs per line, lines and their spacing. */
export const cageText = (k: Punched, fmt: Fmt): string => {
  const c = k.punching?.fix?.cage;
  return c ? `${k.punching?.legs ?? c.legs} Ø${c.dia} × ${c.lines} · s = ${fmt(c.spacing * 100, 1)} cm` : '';
};

/** A text for a column's drop: how far past its faces and how deep, cm. */
export const dropText = (k: Punched, fmt: Fmt): string => {
  const dr = k.punching?.fix?.drop;
  return dr ? `${fmt(dr.w * 100, 0)} · ${fmt(dr.hd * 100, 0)} cm` : '';
};

/**
 * The punching lines of the columns of a footing: the concrete alone (§22.6, §13.2.6.2(b)); with
 * stirrups the section at d/2 on φ·(0,17·√f'c + vs) (§22.6.6.1, §22.6.7.2), the ceiling φ·0,5·√f'c
 * (§22.6.6.3), the section past the outermost line (§22.6.4.2) and their detailing (§22.6.7.1,
 * §8.7.6.3); with a drop the section at d/2 on its depth and the one past its edges (§22.6.4.1).
 */
export function punchingChecks(columns: readonly Punched[], fmt: Fmt): CheckLine[] {
  const out: CheckLine[] = [];
  const mpa = (v: number) => `${fmt(v, 3)} MPa`, cm = (v: number) => `${fmt(v * 100, 1)} cm`;
  for (const k of columns) {
    const p = k.punching;
    if (!p) continue;
    const fix = p.fix, secs = p.sections ?? [];
    if (!fix) { out.push(check('rcSheets.v.footPunching', p.utilization <= 1 + 1e-6, { clause: `§22.6, §13.2.6.2(b) · ${k.name}`, demand: mpa(p.vu), capacity: mpa(p.phiVc), ratio: p.utilization })); continue; }
    for (const s of secs) {
      const label = fix.cage ? (s.at === 'column' ? 'rcSheets.v.footPunchCage' : 'rcSheets.v.footPunchOuter') : s.at === 'column' ? 'rcSheets.v.footPunchDrop' : 'rcSheets.v.footPunchDropEdge';
      const clause = fix.cage && s.at === 'column' ? '§22.6.6.1, §22.6.7.2' : SECTION_CLAUSE[s.at];
      out.push(check(label, s.vu <= s.phiV + 1e-6, { clause: `${clause} · ${k.name}`, demand: `${mpa(s.vu)} · d = ${cm(s.d)}`, capacity: `${mpa(s.phiV)} · bo = ${fmt(s.bo, 2)} m`, ratio: ratioOf(s.vu, s.phiV) }));
    }
    const c = fix.cage;
    if (c && p.ceiling !== undefined) {
      out.push(check('rcSheets.v.footPunchCeiling', p.vu <= p.ceiling + 1e-6, { clause: `§22.6.6.3 · ${k.name}`, demand: mpa(p.vu), capacity: `φ·0,5·√f'c = ${mpa(p.ceiling)}`, ratio: ratioOf(p.vu, p.ceiling) }));
      const d = secs.find((s) => s.at === 'column')?.d ?? 0;
      const ok = d >= 0.15 - 1e-9 && d >= (16 * c.dia) / 1000 - 1e-9 && c.spacing <= d / 2 + 1e-9 && c.first <= d / 2 + 1e-9;
      out.push(check('rcSheets.v.footPunchDetail', ok, { clause: `§22.6.7.1, §8.7.6.3 · ${k.name}`, demand: `${cageText(k, fmt)} · s0 = ${cm(c.first)}`, capacity: `d = ${cm(d)} ≥ 15 cm, 16·db · s ≤ d/2 = ${cm(d / 2)}` }));
    }
  }
  return out;
}

/** The punching steps of the columns of a footing: each section read and what carries it. */
export function punchingSteps(columns: readonly Punched[], fmt: Fmt): Step[] {
  const out: Step[] = [];
  for (const k of columns) {
    const p = k.punching;
    if (!p) continue;
    if (p.fix?.cage) out.push({ label: 'rcSheets.s.footPunchCage', formula: `${k.name}: vs = Av·fyt/(bo·s)`, value: `${cageText(k, fmt)} → vs = ${fmt(p.vs ?? 0, 3)} MPa`, ok: p.utilization <= 1 + 1e-6 });
    if (p.fix?.drop) out.push({ label: 'rcSheets.s.footPunchDrop', formula: `${k.name}: w · hd`, value: dropText(k, fmt), ok: p.utilization <= 1 + 1e-6 });
    for (const s of p.sections ?? [{ at: 'column' as const, vu: p.vu, phiV: p.phiVc, bo: p.bo, d: 0, combo: p.combo }]) {
      out.push({ label: s.at === 'column' ? 'rcSheets.s.footPunchVc' : s.at === 'outer' ? 'rcSheets.s.footPunchOuter' : 'rcSheets.s.footPunchDropEdge', formula: `${k.name} (${p.position})`, value: `${fmt(s.vu, 3)} ≤ ${fmt(s.phiV, 3)} MPa (${s.combo})`, ok: s.vu <= s.phiV + 1e-6 });
    }
  }
  return out;
}
