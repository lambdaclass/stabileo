import { beamCapacityShear, columnCapacityShear, columnConfinement, hoopSpacingFor, nominalMomentAt } from '../engine/design/seismic/capacity';
import { faceLayout, groupsArea } from './bars';
import type { Fmt } from './format';
import { check, ratioOf, type BarGroup, type BeamAdopted, type CheckLine, type ColumnAdopted, type Step } from './types';

/** Chapter 18 as the project sets it: λo, the probable over nominal strength of the bars. */
export interface Seismic { overstrength: number }

interface BeamSide { top: BarGroup[]; bottom: BarGroup[] }

/**
 * §18.6.3.2 by areas at the start, middle and end of a span: every section holds, top and bottom, a
 * quarter of the most steel at either face, and the bottom at each face half the top there. With what
 * each run needs more of, cm², for the sections to hold it.
 */
export function faceRule(S: BeamSide, M: BeamSide, E: BeamSide): { maxEnd: number; minAny: number; quarterOk: boolean; halfOk: boolean; more: { top: number; bottom: number } } {
  const area = (g: BarGroup[]) => groupsArea(g);
  const maxEnd = Math.max(area(S.top), area(S.bottom), area(E.top), area(E.bottom));
  const least = (face: 'top' | 'bottom') => Math.min(...[S, M, E].map((x) => area(x[face])));
  const minAny = Math.min(least('top'), least('bottom'));
  const halfShort = Math.max(0, 0.5 * area(S.top) - area(S.bottom), 0.5 * area(E.top) - area(E.bottom));
  return {
    maxEnd, minAny, quarterOk: minAny >= 0.25 * maxEnd - 1e-6, halfOk: halfShort <= 1e-6,
    more: { top: Math.max(0, 0.25 * maxEnd - least('top')), bottom: Math.max(halfShort, 0.25 * maxEnd - least('bottom')) },
  };
}

/** Gravity shear at the ends: the largest of the combinations with no earthquake case, else half the design shear. */
function gravityShear(combos: Array<{ seismic?: boolean; v: number }>, vu: number): number {
  const g = combos.filter((k) => !k.seismic);
  return g.length ? Math.max(...g.map((k) => k.v)) : vu / 2;
}

export function beamSeismic(
  d: { b: number; h: number; length: number; faces?: { start: number; end: number }; combos: Array<{ seismic?: boolean; v: number }>; vu: { value: number } },
  c: { mat: { fc: number; fy: number }; cover: number; overstrength: number },
  a: BeamAdopted, at: (s: 'start' | 'span' | 'end') => BeamSide, fmt: Fmt,
): { checks: CheckLine[]; steps: Step[]; sZone: number; ve: number; vg: number; ln: number } {
  const sd = a.stirrups.dia;
  const S = at('start'), E = at('end'), M = at('span');
  const area = (g: BarGroup[]) => groupsArea(g);
  const dEff = d.h - faceLayout(S.bottom, d.b, c.cover, sd).centroidFromFace;
  const dPrime = faceLayout(S.top, d.b, c.cover, sd).centroidFromFace;
  const ln = Math.max(0.5, d.length - (d.faces ? d.faces.start + d.faces.end : 0));
  const dbMin = Math.min(...[...S.top, ...S.bottom, ...E.top, ...E.bottom].filter((g) => g.count > 0).map((g) => g.dia), 99);
  const vg = gravityShear(d.combos, d.vu.value);
  const cap = beamCapacityShear({
    b: d.b, h: d.h, d: dEff, dPrime, fc: c.mat.fc, fy: c.mat.fy, fyt: c.mat.fy,
    ends: [{ top: area(S.top), bottom: area(S.bottom) }, { top: area(E.top), bottom: area(E.bottom) }],
    ln, vg: [vg, vg], hoops: { diameter: sd, legs: a.stirrups.legs, spacing: a.stirrups.spacing, length: 2 * d.h }, longMinDiaMm: dbMin, overstrength: c.overstrength,
  });
  const sVe = hoopSpacingFor(cap.ve, cap.vcZero, d.b, dEff, c.mat.fc, c.mat.fy, sd, a.stirrups.legs);
  const sZone = Math.min(cap.hoops.spacing, sVe ?? 0.05);
  const { maxEnd, minAny, quarterOk, halfOk } = faceRule(S, M, E);
  const rho = Math.max(...[S, M, E].flatMap((x) => [area(x.top), area(x.bottom)])) * 1e-4 / (d.b * dEff);
  return {
    sZone, ve: cap.ve, vg, ln,
    checks: [
      check('rcSheets.v.seisBeamVe', cap.utilization <= 1 + 1e-6, { clause: '§18.6.5', demand: `Ve = ${fmt(cap.ve)} kN`, capacity: `${fmt(cap.phiVn)} kN`, ratio: cap.utilization }),
      check('rcSheets.v.seisBeamHoops', a.stirrups.spacing <= sZone + 1e-6, { clause: '§18.6.4.4', demand: `${fmt(a.stirrups.spacing * 100, 1)} cm`, capacity: `≤ ${fmt(sZone * 100, 1)} cm (2h = ${fmt(2 * d.h * 100, 0)} cm)` }),
      check('rcSheets.v.seisBeamHalf', halfOk, { clause: '§18.6.3.2' }),
      check('rcSheets.v.seisBeamQuarter', quarterOk, { clause: '§18.6.3.2', demand: `${fmt(minAny)} cm²`, capacity: `≥ ${fmt(0.25 * maxEnd)} cm²` }),
      check('rcSheets.v.seisBeamRho', rho <= 0.025 + 1e-9, { clause: '§18.6.3.1', demand: `${fmt(rho * 100, 2)} %`, capacity: '≤ 2.5 %' }),
    ],
    steps: [
      { label: 'rcSheets.s.seisMpr', formula: `Mpr = Mn(${fmt(c.overstrength)}·fy), φ = 1`, value: `${fmt(cap.mprNeg[0])} · ${fmt(cap.mprPos[1])} kN·m` },
      { label: 'rcSheets.s.seisVe', formula: 'Ve = (Mpr,i + Mpr,j)/ln + Vg', value: `(${fmt(Math.max(cap.mprNeg[0] + cap.mprPos[1], cap.mprPos[0] + cap.mprNeg[1]))})/${fmt(ln)} + ${fmt(vg)} = ${fmt(cap.ve)} kN${cap.vcZero ? ' (Vc = 0)' : ''}` },
      { label: 'rcSheets.s.seisZone', formula: 's ≤ min(d/4; 6·db; 150 mm) @ 2h', value: `${fmt(sZone * 100, 1)} cm` },
    ],
  };
}

/** The hoop's legs across each side in the confinement zones: the crossties `x` across h (for the bars along b) and `y` across b, the largest spacing hx between held bars, m, and the perimeter bars held. */
export interface ConfinedTies { x: number; y: number; hx: number; held: number; perimeter: number }

/** §18.7.5 as the adopted hoops meet it: lo, so and Ash at the spacing in lo, with Table 18.7.5.4 (c) above 0.3·Ag·f'c. */
export function columnConfinementOf(
  d: { b: number; h: number; lu: number; cases: Array<{ pu: number }> }, c: { mat: { fc: number; fy: number }; cover: number },
  a: ColumnAdopted, ct: ConfinedTies,
) {
  const longMin = Math.min(a.corner, a.nx > 0 ? a.dx : 99, a.ny > 0 ? a.dy : 99);
  const pu = Math.max(0, ...d.cases.map((k) => k.pu));
  return columnConfinement({ b: d.b, h: d.h, cover: c.cover, lu: d.lu, fc: c.mat.fc, fyt: c.mat.fy, longMinDiaMm: longMin, tieDiaMm: a.tieDia, legsB: 2 + ct.x, legsH: 2 + ct.y, hx: ct.hx, provided: { length: Math.max(d.b, d.h, d.lu / 6, 0.45), spacing: a.tieSpacing }, pu, nl: ct.held });
}

export function columnSeismic(
  d: { b: number; h: number; lu: number; cases: Array<{ pu: number; vx?: number; vy?: number }> },
  c: { mat: { fc: number; fy: number }; cover: number; overstrength: number },
  a: ColumnAdopted, bars: Array<{ x: number; y: number; area: number }>, ct: ConfinedTies, fmt: Fmt,
): { checks: CheckLine[]; steps: Step[]; so: number; lo: number } {
  const minDim = Math.min(d.b, d.h), Ag = d.b * d.h;
  const area = bars.reduce((s, b) => s + b.area, 0);
  const rho = area / Ag;
  const conf = columnConfinementOf(d, c, a, ct);
  const puMax = Math.max(0, ...d.cases.map((k) => k.pu));
  const outline = { kind: 'rect' as const, b: d.b, h: d.h };
  const mprX = nominalMomentAt(outline, bars, c.mat.fc, c.overstrength * c.mat.fy, Math.PI / 2, puMax);
  const mprY = nominalMomentAt(outline, bars, c.mat.fc, c.overstrength * c.mat.fy, 0, puMax);
  const ties = (legs: number) => ({ diameter: a.tieDia, legs, spacing: Math.min(a.tieSpacing, conf.so) });
  const vx = Math.max(0, ...d.cases.map((k) => k.vx ?? 0)), vy = Math.max(0, ...d.cases.map((k) => k.vy ?? 0));
  const shX = columnCapacityShear({ b: d.b, h: d.h, d: d.h - c.cover - 0.02, fc: c.mat.fc, fyt: c.mat.fy, mpr: [mprX, mprX], lu: d.lu, vu: vx, pu: puMax, ties: ties(2 + ct.x) });
  const shY = columnCapacityShear({ b: d.h, h: d.b, d: d.b - c.cover - 0.02, fc: c.mat.fc, fyt: c.mat.fy, mpr: [mprY, mprY], lu: d.lu, vu: vy, pu: puMax, ties: ties(2 + ct.y) });
  const allHeld = !conf.high || ct.held >= ct.perimeter;
  return {
    so: conf.so, lo: conf.lo,
    checks: [
      check('rcSheets.v.seisColDim', minDim >= 0.3 - 1e-9 && minDim / Math.max(d.b, d.h) >= 0.4 - 1e-9, { clause: '§18.7.2.1', demand: `${fmt(d.b * 100, 0)} × ${fmt(d.h * 100, 0)} cm`, capacity: '≥ 30 cm; ≥ 0.4' }),
      check('rcSheets.v.seisColRho', rho >= 0.01 - 1e-9 && rho <= 0.06 + 1e-9, { clause: '§18.7.4.1', demand: `${fmt(rho * 100, 2)} %`, capacity: '1 … 6 %' }),
      check('rcSheets.v.seisColHx', ct.hx <= conf.hxMax + 1e-6 && allHeld, { clause: '§18.7.5.2', demand: `hx = ${fmt(ct.hx * 100, 1)} cm${conf.high ? ` · ${ct.held}/${ct.perimeter}` : ''}`, capacity: `≤ ${fmt(conf.hxMax * 100, 0)} cm${conf.high ? ` · ${ct.perimeter}/${ct.perimeter}` : ''}`, ratio: ct.hx / conf.hxMax }),
      check('rcSheets.v.seisColSo', a.tieSpacing <= conf.so + 1e-6, { clause: '§18.7.5.3', demand: `${fmt(a.tieSpacing * 100, 1)} cm`, capacity: `≤ ${fmt(conf.so * 100, 1)} cm (lo = ${fmt(conf.lo * 100, 0)} cm)` }),
      check('rcSheets.v.seisColAsh', conf.ashOk, { clause: '§18.7.5.4', demand: `${fmt(conf.ashRequired.acrossB)} · ${fmt(conf.ashRequired.acrossH)} cm²`, capacity: `${2 + ct.x} · ${2 + ct.y} Ø${a.tieDia} c/${fmt(a.tieSpacing * 100, 1)} = ${fmt(conf.ashProvided.acrossB)} · ${fmt(conf.ashProvided.acrossH)} cm²`, ratio: Math.max(ratioOf(conf.ashRequired.acrossB, conf.ashProvided.acrossB), ratioOf(conf.ashRequired.acrossH, conf.ashProvided.acrossH)) }),
      check('rcSheets.v.seisColVe', shX.utilization <= 1 + 1e-6 && shY.utilization <= 1 + 1e-6, { clause: '§18.7.6', demand: `${fmt(shX.ve)} · ${fmt(shY.ve)} kN`, capacity: `${fmt(shX.phiVn)} · ${fmt(shY.phiVn)} kN`, ratio: Math.max(shX.utilization, shY.utilization) }),
    ],
    steps: [
      { label: 'rcSheets.s.seisColMpr', formula: `Mpr = Mn(${fmt(c.overstrength)}·fy; Pu,max)`, value: `${fmt(mprX)} · ${fmt(mprY)} kN·m` },
      { label: 'rcSheets.s.seisColConf', formula: 'lo = max(b; h; lu/6; 450 mm); so; Ash', value: `${fmt(conf.lo * 100, 0)} cm · ${fmt(conf.so * 100, 1)} cm` },
      { label: 'rcSheets.s.seisColAsh', formula: `Ash/(s·bc) ≥ max(0.3·(Ag/Ach − 1)·f'c/fyt; 0.09·f'c/fyt${conf.high ? '; 0.2·kf·kn·Pu/(fyt·Ach)' : ''})`, value: `${2 + ct.x} · ${2 + ct.y} Ø${a.tieDia} c/${fmt(a.tieSpacing * 100, 1)} cm` },
    ],
  };
}
