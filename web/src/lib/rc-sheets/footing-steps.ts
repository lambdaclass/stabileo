import type { Fmt } from './format';
import type { FootingAnalysis, FootingRowCode, Proposal } from './footing-design';
import { ASSUMED_FILL_WEIGHT, CONCRETE_WEIGHT } from './footing-mechanics';
import { meshText } from './footing-mesh';
import type { FootingAdopted, FootingContext, FootingDemand } from './footing-types';
import type { Step, StepGroup } from './types';

export function footingSteps(d: FootingDemand, c: FootingContext, r: FootingAnalysis, a: FootingAdopted, code: FootingRowCode, fmt: Fmt, prop: Proposal | null): StepGroup[] {
  const cm = (v: number) => fmt(v * 100, 0);
  const b = r.bearing, s = d.service;
  const soil: Step[] = [
    { label: 'rcSheets.s.footService', formula: 'N · Mx · My · Vx · Vy', value: s ? `${fmt(s.N, 1)} kN · ${fmt(s.Mx, 1)} · ${fmt(s.My, 1)} kN·m · ${fmt(s.Vx, 1)} · ${fmt(s.Vy, 1)} kN` : '—' },
    ...(d.lateralLeftOut ? [{ label: 'rcSheets.s.footLateralOut', value: String(d.lateralLeftOut) }] : []),
    ...(b ? [
      { label: 'rcSheets.s.footWeight', formula: `G = (${CONCRETE_WEIGHT}·h + γs·(z − h))·B·L`, value: `${fmt(b.weight, 1)} kN (γs = ${fmt(d.soil?.unitWeight ?? ASSUMED_FILL_WEIGHT, 0)} kN/m³${d.soil?.unitWeight ? '' : ' *'})` },
      { label: 'rcSheets.s.footEcc', formula: 'e = M/(N + G)', value: `${fmt(b.ex * 100, 1)} · ${fmt(b.ey * 100, 1)} cm` },
      { label: 'rcSheets.s.footPressure', formula: 'qmáx · qmín · qmed', value: `${fmt(b.qMax, 0)} · ${fmt(b.qMin, 0)} · ${fmt(b.qMean, 0)} kPa`, ok: b.ok },
      { label: 'rcSheets.s.footAllowable', formula: 'qadm · k·qadm', value: b.allowable ? `${fmt(b.allowable, 0)} · ${fmt(b.edgeFactor * b.allowable, 0)} kPa${d.soil?.presumed ? ' *' : ` (${d.soil?.name ?? ''})`}` : '—' },
      { label: 'rcSheets.s.footContactShare', formula: 'A contacto / A', value: `${fmt(b.contact * 100, 0)} %` },
    ] : []),
  ];
  const size: Step[] = [
    { label: `rcSheets.footSizing.${c.sizing}`, value: '' },
    { label: 'rcSheets.s.footSize', formula: 'B × L × h', value: `${cm(a.B)} × ${cm(a.L)} × ${cm(a.h)} cm`, ...(prop ? { ok: prop.reached } : {}) },
    { label: 'rcSheets.s.footOffset', formula: 'eB · eL', value: `${cm(a.ex)} · ${cm(a.ey)} cm` },
    { label: 'rcSheets.s.footLever', formula: 'z', value: `${fmt(r.lever, 2)} m` },
  ];
  const dirSteps = (k: FootingAnalysis['x']): Step[] => {
    const X = k.dir.toUpperCase(), m = k.dir === 'x' ? a.x : a.y;
    return [
      { label: `rcSheets.s.footMu${X}`, formula: 'Mu = Σ q·A·e (§13.2.6.6) · d', value: `${fmt(k.mu, 1)} kN·m · ${fmt(k.d * 100, 1)} cm` },
      { label: `rcSheets.s.footAs${X}`, formula: 'As ≥ máx(As,u; 0,0018·b·h)', value: `${fmt(k.asReq, 2)} cm² (${fmt(k.asMin, 2)})` },
      { label: `rcSheets.s.footMesh${X}`, formula: 'Ø c/s', value: `${meshText(m)} · ${fmt(k.asProvided, 2)} cm²`, ok: k.asProvided >= k.asReq - 1e-6 },
      ...(k.band ? [{ label: 'rcSheets.s.footBandShare', formula: 'γs = 2/(β + 1)', value: `${fmt(k.band.share, 3)} · ${fmt(k.band.asReq, 2)} → ${fmt(k.band.asProvided, 2)} cm²`, ok: k.band.asProvided >= k.band.asReq - 1e-6 }] : []),
      { label: `rcSheets.s.footPhiMn${X}`, formula: 'φMn', value: `${fmt(k.phiMn, 1)} kN·m`, ok: k.mu <= k.phiMn + 1e-6 },
    ];
  };
  const shear: Step[] = [
    ...[r.x, r.y].map((k): Step => ({ label: `rcSheets.s.footVu${k.dir.toUpperCase()}`, formula: `${code.oneWayFormula} (${code.oneWayClause})`, value: `${fmt(k.vu, 1)} ≤ ${fmt(k.phiVc, 1)} kN`, ok: k.vu <= k.phiVc + 1e-6 })),
    ...(r.punching ? [
      { label: 'rcSheets.s.footPunch', formula: 'bo (d/2) · β · d', value: `${fmt(r.punching.bo, 2)} m · ${fmt(r.punching.beta, 2)} · ${fmt(r.layers.d * 100, 1)} cm (${r.punching.position})` },
      { label: 'rcSheets.s.footPunchVc', formula: "vu = Vu/(bo·d) + γv·Msc·c/Jc ≤ φ·mín(0,33; 0,17(1 + 2/β); 0,083(2 + αs·d/bo))·√f'c, λs = 1", value: `${fmt(r.punching.vu, 3)} ≤ ${fmt(r.punching.phiVc, 3)} MPa (${r.punching.combo})`, ok: r.punching.utilization <= 1 + 1e-6 },
    ] : []),
  ];
  const dw = r.dowels, bs = r.bearingStrength;
  const detail: Step[] = [
    ...[r.x, r.y].map((k): Step => ({ label: `rcSheets.s.footAnchor${k.dir.toUpperCase()}`, formula: k.anchorage.hooked ? 'ldh ≤ v − c' : 'ld ≤ v − c', value: `${cm(k.anchorage.ld)} ≤ ${cm(k.anchorage.available)} cm`, ok: k.anchorage.ok })),
    { label: 'rcSheets.s.footBearingStrength', formula: "φBn = 0,65·0,85·f'c·A1·√(A2/A1)", value: `${fmt(bs.pu, 1)} ≤ ${fmt(Math.min(bs.column, bs.footing), 1)} kN (√ = ${fmt(bs.root, 2)})`, ok: bs.pu <= Math.min(bs.column, bs.footing) + 1e-6 },
    ...(dw ? [
      { label: 'rcSheets.s.footDowels', formula: 'As ≥ 0,005·Ag', value: `${dw.count} Ø${dw.dia} · ${fmt(dw.area, 2)} ≥ ${fmt(dw.required, 2)} cm²`, ok: dw.area >= dw.required - 1e-6 },
      { label: 'rcSheets.s.footDowelLd', formula: dw.tension ? 'máx(ldc; ldh) ≤ h − c − 2Ø' : 'ldc ≤ h − c − 2Ø', value: `${cm(Math.max(dw.ldc, dw.ldh))} ≤ ${cm(dw.available)} cm`, ok: Math.max(dw.ldc, dw.ldh) <= dw.available + 1e-9 },
      { label: 'rcSheets.s.footLap', formula: dw.tension ? '1,3·ld' : '0,071·fy·db', value: `${cm(dw.lap)} cm` },
    ] : []),
  ];
  return [
    { title: 'rcSheets.g.footSoil', steps: soil },
    { title: 'rcSheets.g.footSize', steps: size },
    { title: 'rcSheets.g.footFlexure', steps: [...dirSteps(r.x), ...dirSteps(r.y)] },
    { title: 'rcSheets.g.footShear', steps: shear },
    { title: 'rcSheets.g.footDetail', steps: detail },
  ];
}
