/**
 * A structural wall under chapter 18 (ACI 318-19, CIRSOC 201-2025), at the base of a storey:
 * two curtains where §18.10.2.2 asks, the distributed ratios of §18.10.2.1, special boundary
 * elements by the stress check of §18.10.6.3 with their length and hoops (§18.10.6.4), ties at
 * the edges otherwise where the edge ratio exceeds 2.8/fy (§18.10.6.5(a)), and the horizontals
 * anchored round the edge bars where §18.10.6.5(b) asks.
 *
 * Hoops cross the thickness with two legs and the boundary length with a leg every hx at most;
 * hx is held to min(350 mm; 2·t/3).
 */
import { shearSqrtFc } from '../engine/codes/argentina/cirsoc201-basis';
import { barArea } from './bars';
import { tieDiaFor } from './column-row';
import type { Fmt } from './format';
import { check, type CheckLine, type Step, type WallAdopted } from './types';
import type { WallComboForces } from './wall-row';

export interface WallBoundaryHoops { dia: number; spacing: number; legsAcross: number; legsAlong: number; clause: string }

export interface WallSeismic {
  /** Two curtains by §18.10.2.2. */
  twoCurtains: boolean;
  /** Largest extreme-fibre compression of the gross section, MPa, and whether it calls for special boundary elements. */
  sigma: number; special: boolean;
  /** Neutral axis depth of the governing combination, m. */
  c: number;
  /** From each end, m: the special boundary element, or the zone of edge ties. */
  boundaryLength: number;
  hoops: WallBoundaryHoops | null;
  /** The horizontals must hook round the edge bars or meet U-bars (§18.10.6.5(b)). */
  anchorEnds: boolean;
  checks: CheckLine[];
  steps: Step[];
}

const so = (hx: number) => Math.min(0.15, Math.max(0.1, (100 + (350 - hx * 1000) / 3) / 1000));
const floorTo = (x: number, step: number) => Math.round(Math.max(step, Math.floor(x / step + 1e-9) * step) * 1e6) / 1e6;

export function wallSeismic(
  d: { length: number; height: number; thickness: number; combos: readonly WallComboForces[] },
  ctx: { mat: { fc: number; fy: number }; cover: number },
  a: WallAdopted, cs: ReadonlyArray<number | undefined>, fmt: Fmt,
): WallSeismic {
  const L = d.length, t = d.thickness, fc = ctx.mat.fc, fy = ctx.mat.fy;
  const acv = L * t, root = shearSqrtFc(fc);
  const vu = Math.max(0, ...d.combos.map((k) => k.vu));
  const twoCurtains = vu > 0.17 * root * acv * 1000 || d.height / L >= 2;
  const lowShear = vu <= 0.083 * root * acv * 1000;
  const rhoOf = (m: { diameter: number; spacing: number }) => (m.spacing > 0 ? a.curtains * barArea(m.diameter) * 1e-4 / (m.spacing * t) : 0);
  const rhoL = rhoOf(a.vertical), rhoT = rhoOf(a.horizontal);
  const ig = t * L ** 3 / 12;
  const sigmas = d.combos.map((k) => (Math.max(0, k.pu) / acv + k.mu * (L / 2) / ig) / 1000);
  const sigma = Math.max(0, ...sigmas);
  const special = sigma >= 0.2 * fc - 1e-9;
  const c = Math.max(0, ...cs.filter((x): x is number => x !== undefined && Number.isFinite(x)));

  const ends = a.boundary && a.boundary.count > 0 ? a.boundary.diameter : a.vertical.diameter;
  const dbMin = Math.min(a.vertical.diameter, ends);
  const hx = Math.min(0.35, (2 * t) / 3);
  const bc = Math.max(0.05, t - 2 * ctx.cover);
  let boundaryLength = 0;
  let hoops: WallBoundaryHoops | null = null;
  const checks: CheckLine[] = [];
  const steps: Step[] = [];

  if (special) {
    boundaryLength = Math.min(L / 2, Math.max(c - 0.1 * L, c / 2, 0));
    const sMax = floorTo(Math.min(t / 3, (6 * dbMin) / 1000, so(hx)), 0.025);
    const core = Math.max(0.05, boundaryLength - ctx.cover);
    const legsAcross = Math.max(2, Math.ceil(core / hx) + 1), legsAlong = 2;
    const ag = Math.max(boundaryLength, 0.05) * t, ach = core * bc;
    const k = Math.max(0.3 * Math.max(0, ag / ach - 1) * fc / fy, 0.09 * fc / fy);
    const fits = (dia: number) => legsAcross * barArea(dia) * 1e-4 >= k * sMax * core - 1e-12 && legsAlong * barArea(dia) * 1e-4 >= k * sMax * bc - 1e-12;
    const dia = [tieDiaFor(ends), 8, 10, 12].filter((x) => x >= tieDiaFor(ends)).find(fits);
    hoops = { dia: dia ?? 12, spacing: sMax, legsAcross, legsAlong, clause: '§18.10.6.4' };
    checks.push(
      check('rcSheets.v.wallSpecialBoundary', true, { clause: '§18.10.6.3, §18.10.6.4(a)', demand: `σ = ${fmt(sigma)} MPa ≥ 0.2·f'c = ${fmt(0.2 * fc)} MPa`, capacity: `${fmt(boundaryLength * 100, 0)} cm (c = ${fmt(c * 100, 0)} cm)` }),
      check('rcSheets.v.wallBoundaryAsh', dia !== undefined, { clause: '§18.10.6.4(f)', demand: `Ash/(s·bc) ≥ ${fmt(k * 100, 3)} %`, capacity: dia !== undefined ? `Ø${dia} c/${fmt(sMax * 100, 1)}` : '> Ø12' }),
    );
    steps.push(
      { label: 'rcSheets.s.wallSigma', formula: 'σ = Pu/Ag + Mu·(lw/2)/Ig ≥ 0.2·f\'c (§18.10.6.3)', value: `${fmt(sigma)} MPa` },
      { label: 'rcSheets.s.wallBoundaryLength', formula: 'max(c − 0.1·lw; c/2) (§18.10.6.4(a))', value: `${fmt(boundaryLength * 100, 0)} cm` },
      { label: 'rcSheets.s.wallBoundaryHoops', formula: 's ≤ min(t/3; 6·db; so), so = 100 + (350 − hx)/3 mm (§18.10.6.4(e))', value: `Ø${hoops.dia} c/${fmt(sMax * 100, 1)}` },
    );
  } else {
    const ext = a.boundary && a.boundary.count > 0 ? a.boundary : null;
    if (ext) {
      const pitch = Math.max(0.05, 2 * ext.diameter / 1000);
      const per = Math.ceil(ext.count / a.curtains);
      const zone = Math.min(L / 2, ctx.cover + per * pitch + pitch / 2);
      const along = Math.max(1, Math.floor(zone / a.vertical.spacing) + 1);
      const rho = (ext.count * barArea(ext.diameter) + a.curtains * along * barArea(a.vertical.diameter)) * 1e-4 / (zone * t);
      if (rho > 2.8 / fy) {
        boundaryLength = zone;
        hoops = { dia: tieDiaFor(ext.diameter), spacing: floorTo(Math.min(0.2, (8 * dbMin) / 1000), 0.025), legsAcross: 2, legsAlong: 2, clause: '§18.10.6.5(a)' };
        checks.push(check('rcSheets.v.wallEdgeTies', true, { clause: '§18.10.6.5(a)', demand: `ρ = ${fmt(rho * 100, 2)} % > 2.8/fy = ${fmt(280 / fy, 2)} %`, capacity: `Ø${hoops.dia} c/${fmt(hoops.spacing * 100, 1)}` }));
      }
    }
    steps.push({ label: 'rcSheets.s.wallSigma', formula: 'σ = Pu/Ag + Mu·(lw/2)/Ig < 0.2·f\'c (§18.10.6.3)', value: `${fmt(sigma)} MPa` });
  }

  checks.push(
    check('rcSheets.v.wallSeisCurtains', !twoCurtains || a.curtains === 2, { clause: '§18.10.2.2', demand: twoCurtains ? `Vu > 0.17·√f'c·Acv ∨ hw/lw ≥ 2` : '—', capacity: String(a.curtains) }),
    check('rcSheets.v.wallSeisRho', lowShear || (rhoL >= 0.0025 - 1e-9 && rhoT >= 0.0025 - 1e-9), { clause: '§18.10.2.1', demand: '≥ 0.25 %', capacity: `${fmt(rhoL * 100, 3)} · ${fmt(rhoT * 100, 3)} %` }),
  );
  return { twoCurtains, sigma, special, c, boundaryLength, hoops, anchorEnds: !lowShear, checks, steps };
}
